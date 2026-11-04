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
async function sendTabReport(tab) {
  if (!tab || !Number.isInteger(tab.id) || !tab.url) return;
  const cfg = await getConfig();
  if (!cfg.apiBase || !cfg.pairingToken) return;
  let parsed;
  try { parsed = new URL(tab.url); } catch { return; }
  if (!['http:', 'https:'].includes(parsed.protocol)) return;
  const origin = parsed.origin;
  if (!cfg.allowedOrigins.includes(origin) || !(await hasOriginPermission(origin))) return;
  let apiOrigin;
  try { apiOrigin = new URL(cfg.apiBase).origin; } catch { return; }
  if (!(await hasOriginPermission(apiOrigin))) return;
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
  try {
    await fetch(cfg.apiBase + '/eced/reports', {
      method: 'POST',
      headers: {'Content-Type':'application/json','X-Pulse-Token':cfg.pairingToken},
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit'
    });
  } catch {
    // Network errors never become a logged-out observation.
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
chrome.runtime.onInstalled.addListener(() => { void schedule(); });
chrome.runtime.onStartup.addListener(() => { void schedule(); void reportAllTabs(); });
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === ALARM_NAME) void reportAllTabs(); });
chrome.tabs.onActivated.addListener(async info => {
  try { await sendTabReport(await chrome.tabs.get(info.tabId)); } catch {}
});
chrome.tabs.onUpdated.addListener((tabId,changeInfo,tab) => {
  if (changeInfo.url) {
    let keepKey = '';
    try { keepKey = new URL(tab.url || '').origin + '::' + String(tabId); } catch {}
    void clearTabLabels(tabId, keepKey);
  }
  if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') void sendTabReport(tab);
});
chrome.tabs.onRemoved.addListener(tabId => { void clearTabLabels(tabId); });
chrome.storage.onChanged.addListener((changes,area) => {
  if (area === 'local' && (changes.apiBase || changes.pairingToken || changes.allowedOrigins ||
      changes.accountLabels || changes.accountSources || changes.sessionStates || changes.sectionLabels)) void reportAllTabs();
});
chrome.runtime.onMessage.addListener((message,_sender,sendResponse) => {
  if (message?.type === 'portal-account-observed') {
    void (async()=>{
      const tab=_sender?.tab;
      const accountName=cleanText(message.accountName,100);
      if(!tab||!Number.isInteger(tab.id)||!tab.url||!accountName)return;
      let parsed;
      try{parsed=new URL(tab.url);}catch{return;}
      if(!['http:','https:'].includes(parsed.protocol)||parsed.hostname.toLowerCase()!=='eced.csb.gov.tr')return;
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
      if (tabs[0]) await sendTabReport(tabs[0]);
      sendResponse({ok:true});
    }).catch(() => sendResponse({ok:false}));
    return true;
  }
  return false;
});
void schedule();