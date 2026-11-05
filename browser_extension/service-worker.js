const ALARM_NAME = 'encev-pulse-report';
const MIN_REPORT_INTERVAL_MINUTES = 0.5;

function cleanText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function browserLabel() {
  const agent = String(self.navigator?.userAgent ?? '');
  if (/Edg\//i.test(agent)) return 'Microsoft Edge';
  if (/Firefox\//i.test(agent)) return 'Firefox';
  if (/Chrome\//i.test(agent)) return 'Google Chrome';
  return 'Bilinmeyen tarayıcı';
}
async function getConfig() {
  const result = await chrome.storage.local.get(['apiBase','pairingToken','clientId','allowedOrigins','accountLabels','accountSources','sessionStates','sectionLabels']);
  let clientId = result.clientId;
  if (!clientId) {
    clientId = crypto.randomUUID();
    await chrome.storage.local.set({ clientId });
  }
  return {
    apiBase: cleanText(result.apiBase, 500).replace(/\/+$/, ''),
    pairingToken: cleanText(result.pairingToken, 120),
    clientId,
    allowedOrigins: Array.isArray(result.allowedOrigins) ? result.allowedOrigins : [],
    accountLabels: result.accountLabels && typeof result.accountLabels === 'object' ? result.accountLabels : {},
    accountSources: result.accountSources && typeof result.accountSources === 'object' ? result.accountSources : {},
    sessionStates: result.sessionStates && typeof result.sessionStates === 'object' ? result.sessionStates : {},
    sectionLabels: result.sectionLabels && typeof result.sectionLabels === 'object' ? result.sectionLabels : {}
  };
}
async function hasOriginPermission(origin) {
  try { return await chrome.permissions.contains({ origins: [origin + '/*'] }); }
  catch { return false; }
}
async function clearTabLabels(tabId, keepKey = '') {
  const stored = await chrome.storage.local.get(['accountLabels','accountSources','sessionStates','sectionLabels']);
  const suffix = '::' + String(tabId);
  const accountLabels = stored.accountLabels && typeof stored.accountLabels === 'object' ? {...stored.accountLabels} : {};
  const accountSources = stored.accountSources && typeof stored.accountSources === 'object' ? {...stored.accountSources} : {};
  const sessionStates = stored.sessionStates && typeof stored.sessionStates === 'object' ? {...stored.sessionStates} : {};
  const sectionLabels = stored.sectionLabels && typeof stored.sectionLabels === 'object' ? {...stored.sectionLabels} : {};
  let changed = false;
  for (const map of [accountLabels, accountSources, sessionStates, sectionLabels]) {
    for (const key of Object.keys(map)) {
      if (key.endsWith(suffix) && key !== keepKey) {
        delete map[key];
        changed = true;
      }
    }
  }
  if (changed) await chrome.storage.local.set({accountLabels,accountSources,sessionStates,sectionLabels});
}
async function attachPortalObserver(tab) {
  if (!tab || !Number.isInteger(tab.id) || !tab.url) return false;
  let parsed;
  try { parsed = new URL(tab.url); } catch { return false; }
  if (parsed.origin !== 'https://eced.csb.gov.tr') return false;
  const cfg = await getConfig();
  if (!cfg.allowedOrigins.includes(parsed.origin) || !(await hasOriginPermission(parsed.origin))) return false;
  try {
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content-script.js']});
    await chrome.tabs.sendMessage(tab.id,{type:'scan-visible-account'});
    return true;
  } catch {
    // Restricted browser pages or an incomplete tab cannot be instrumented.
    return false;
  }
}
async function attachObserversToAllowedTabs() {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await attachPortalObserver(tab);
}

function reportStatus(ok, code, message, httpStatus = null) {
  return { ok, code, message, httpStatus };
}
async function sendTabReport(tab) {
  try {
    if (!tab || !Number.isInteger(tab.id) || !tab.url) {
      return reportStatus(false, 'tab_unavailable', 'Etkin tarayıcı sekmesi okunamadı.');
    }
    const cfg = await getConfig();
    if (!cfg.apiBase || !cfg.pairingToken) {
      return reportStatus(false, 'pairing_missing', 'PULSE API adresi veya eşleştirme anahtarı eksik. Eklenti bağlantı ayarlarını kontrol edin.');
    }
    let parsed;
    try { parsed = new URL(tab.url); } catch {
      return reportStatus(false, 'invalid_tab_url', 'Etkin sekmenin adresi okunamadı.');
    }
    if (parsed.origin !== 'https://eced.csb.gov.tr') {
      return reportStatus(false, 'not_portal_tab', 'Yalnızca resmî e-ÇED portalı sekmeleri raporlanır.');
    }
    const origin = parsed.origin;
    if (!cfg.allowedOrigins.includes(origin) || !(await hasOriginPermission(origin))) {
      return reportStatus(false, 'portal_permission_missing', 'e-ÇED portal izni verilmemiş. Portal sekmesinde “Bu portalı izlemeye aç” seçeneğini kullanın.');
    }
    let apiUrl;
    try { apiUrl = new URL(cfg.apiBase); } catch {
      return reportStatus(false, 'invalid_api_url', 'PULSE API adresi geçersiz. Eklenti bağlantı ayarlarını kontrol edin.');
    }
    if (!['http:', 'https:'].includes(apiUrl.protocol) || apiUrl.username || apiUrl.password || apiUrl.search || apiUrl.hash) {
      return reportStatus(false, 'invalid_api_url', 'PULSE API adresi geçerli bir HTTP(S) adresi olmalıdır.');
    }
    if (!(await hasOriginPermission(apiUrl.origin))) {
      return reportStatus(false, 'api_permission_missing', 'PULSE sunucu adresi için tarayıcı izni yok. Eklenti bağlantı ayarlarından doğru API adresini kaydedin.');
    }
    const tabKey = origin + '::' + String(tab.id);
    const accountName = cleanText(cfg.accountLabels[tabKey], 100);
    const accountSource = accountName ? (cfg.accountSources[tabKey] === 'portal' ? 'portal' : 'manual') : 'unknown';
    const sectionLabel = cleanText(cfg.sectionLabels[tabKey], 60);
    const selectedState = cfg.sessionStates[tabKey];
    const sessionState = ['active', 'logged_out', 'unknown'].includes(selectedState) ? selectedState : 'unknown';
    const payload = {
      clientId: cfg.clientId,
      browser: browserLabel(),
      tabId: String(tab.id),
      tabTitle: cleanText(tab.title, 120),
      url: origin + (parsed.pathname || '/'),
      activeUiTab: sectionLabel,
      accountName,
      accountSource,
      sessionState: accountName ? (sessionState === 'unknown' && accountSource === 'portal' ? 'active' : sessionState) : 'unknown',
      tabActive: Boolean(tab.active)
    };
    const response = await fetch(cfg.apiBase.replace(/\/+$/, '') + '/eced/reports', {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-Pulse-Token':cfg.pairingToken},
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit'
    });
    if (!response.ok) {
      const message = response.status === 401 || response.status === 403
        ? 'PULSE eşleştirmeyi reddetti (HTTP ' + response.status + '). Anahtar iptal edilmiş veya geçersiz olabilir.'
        : 'PULSE raporu kabul etmedi (HTTP ' + response.status + '). API sunucusu ve dağıtım günlükleri kontrol edilmeli.';
      return reportStatus(false, 'http_error', message, response.status);
    }
    return reportStatus(
      true,
      'reported',
      accountName
        ? 'Sinyal PULSE sunucusuna ulaştı. Hesap etiketi rapora eklendi.'
        : 'Sinyal PULSE sunucusuna ulaştı; ancak hesap etiketi boş. Portal profil etiketi otomatik tanınmadıysa elle girin.',
      response.status
    );
  } catch {
    return reportStatus(false, 'network_error', 'PULSE sunucusuna erişilemedi. API adresi, HTTPS sertifikası, sunucu erişimi ve izinleri kontrol edin.');
  }
}
async function reportAllTabs() {
  const cfg = await getConfig();
  if (!cfg.apiBase || !cfg.pairingToken || !cfg.allowedOrigins.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) await sendTabReport(tab);
}
async function schedule() {
  await chrome.alarms.create(ALARM_NAME, {periodInMinutes:MIN_REPORT_INTERVAL_MINUTES});
}
async function initializeBrowserState() {
  await schedule();
  await attachObserversToAllowedTabs();
  await reportAllTabs();
}
chrome.runtime.onInstalled.addListener(() => { void initializeBrowserState(); });
chrome.runtime.onStartup.addListener(() => { void initializeBrowserState(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) void reportAllTabs(); });
chrome.tabs.onActivated.addListener(async info => {
  try {
    const tab = await chrome.tabs.get(info.tabId);
    await attachPortalObserver(tab);
    await sendTabReport(tab);
  } catch {}
});
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab) => {
  if (changeInfo.url) {
    let keepKey = '';
    try { keepKey = new URL(tab.url || '').origin + '::' + String(tabId); } catch {}
    void clearTabLabels(tabId, keepKey);
  }
  if (changeInfo.status === 'complete') void attachPortalObserver(tab);
  if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') void sendTabReport(tab);
});
chrome.tabs.onRemoved.addListener(tabId => { void clearTabLabels(tabId); });
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'local' && (changes.apiBase || changes.pairingToken || changes.allowedOrigins ||
      changes.accountLabels || changes.accountSources || changes.sessionStates || changes.sectionLabels)) {
    void reportAllTabs();
    if (changes.allowedOrigins) void attachObserversToAllowedTabs();
  }
});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse) => {
  if (message?.type === 'portal-account-observed') {
    void (async()=>{
      const tab=_sender?.tab;
      const accountName=cleanText(message.accountName,100);
      if(!tab||!Number.isInteger(tab.id)||!tab.url||!accountName)return;
      let parsed;
      try{parsed=new URL(tab.url);}catch{return;}
      if(parsed.origin!=='https://eced.csb.gov.tr')return;
      const origin=parsed.origin;
      const cfg=await getConfig();
      if(!cfg.allowedOrigins.includes(origin)||!(await hasOriginPermission(origin)))return;
      const tabKey=origin+'::'+String(tab.id);
      const stored=await chrome.storage.local.get(['accountLabels','accountSources','sessionStates']);
      const accountLabels=stored.accountLabels&&typeof stored.accountLabels==='object'?{...stored.accountLabels}:{};
      const accountSources=stored.accountSources&&typeof stored.accountSources==='object'?{...stored.accountSources}:{};
      const sessionStates=stored.sessionStates&&typeof stored.sessionStates==='object'?{...stored.sessionStates}:{};
      // A deliberate manual label always wins over automatic portal detection.
      if(accountSources[tabKey]==='manual'&&cleanText(accountLabels[tabKey],100))return;
      accountLabels[tabKey]=accountName;
      accountSources[tabKey]='portal';
      if(sessionStates[tabKey]!=='logged_out')sessionStates[tabKey]='active';
      await chrome.storage.local.set({accountLabels,accountSources,sessionStates});
      await sendTabReport(tab);
    })().then(()=>sendResponse({ok:true})).catch(()=>sendResponse({ok:false}));
    return true;
  }
  if (message?.type === 'report-active-tab') {
    void chrome.tabs.query({active:true,lastFocusedWindow:true}).then(async tabs => {
      if (!tabs[0]) {
        sendResponse(reportStatus(false, 'tab_unavailable', 'Etkin tarayıcı sekmesi bulunamadı.'));
        return;
      }
      await attachPortalObserver(tabs[0]);
      sendResponse(await sendTabReport(tabs[0]));
    }).catch(() => sendResponse(reportStatus(false, 'browser_error', 'Tarayıcı sekmesi sorgulanamadı.')));
    return true;
  }
  return false;
});
void schedule();