const $ = id => document.getElementById(id);
let currentOrigin = '';
let currentTabKey = '';
let currentTabId = null;
const PORTAL_ORIGIN = 'https://eced.csb.gov.tr';
function showReportResult(result) {
  const ok = result?.ok === true;
  $('connection').textContent = ok ? 'Sinyal ulaştı' : 'Bağlantı sorunu';
  $('connection').classList.toggle('is-ok', ok);
  $('connection').classList.toggle('is-error', !ok);
  $('status').textContent = result?.message || 'Sinyal sonucu alınamadı. Eklentiyi yenileyip yeniden deneyin.';
}
async function init() {
  const tabs = await chrome.tabs.query({active:true,lastFocusedWindow:true});
  const tab = tabs[0];
  if (!tab || !tab.url) {
    $('pageTitle').textContent = 'Portal sekmesi bulunamadı';
    $('enableSite').disabled = true; $('save').disabled = true; return;
  }
  let parsed;
  try { parsed = new URL(tab.url); } catch {
    $('pageTitle').textContent = 'Bu sekme izlenemez';
    $('pageOrigin').textContent = 'Yalnızca HTTP(S) portal sekmeleri desteklenir.';
    $('enableSite').disabled = true; $('save').disabled = true; return;
  }
  if (!['http:','https:'].includes(parsed.protocol)) {
    $('pageTitle').textContent = 'Bu sekme izlenemez';
    $('pageOrigin').textContent = 'Yalnızca HTTP(S) portal sekmeleri desteklenir.';
    $('enableSite').disabled = true; $('save').disabled = true; return;
  }
  if (parsed.origin !== PORTAL_ORIGIN) {
    $('pageTitle').textContent = 'Desteklenmeyen portal adresi';
    $('pageOrigin').textContent = 'Güvenlik nedeniyle yalnızca https://eced.csb.gov.tr izlenebilir.';
    $('enableSite').disabled = true; $('save').disabled = true; return;
  }
  currentOrigin = parsed.origin;
  currentTabId = tab.id;
  currentTabKey = currentOrigin + '::' + String(tab.id);
  $('pageTitle').textContent = tab.title || 'Portal sekmesi';
  $('pageOrigin').textContent = currentOrigin + parsed.pathname;
  const saved = await chrome.storage.local.get(['allowedOrigins','accountLabels','accountSources','sessionStates','sectionLabels','apiBase','pairingToken']);
  const allowed = Array.isArray(saved.allowedOrigins) && saved.allowedOrigins.includes(currentOrigin);
  $('enableSite').textContent = allowed ? 'Portal izni açık' : 'Bu portalı izlemeye aç';
  $('enableSite').classList.toggle('enabled',allowed);
  $('accountName').value = (saved.accountLabels || {})[currentTabKey] || '';
  const detectedByPortal = (saved.accountSources || {})[currentTabKey] === 'portal';
  if (detectedByPortal) $('status').textContent = 'Hesap portal ekranında görünen profil etiketinden otomatik tanındı. İsterseniz görünen etiketi manuel olarak değiştirebilirsiniz.';
  $('sessionState').value = (saved.sessionStates || {})[currentTabKey] || 'unknown';
  $('sectionLabel').value = (saved.sectionLabels || {})[currentTabKey] || '';
  $('connection').textContent = saved.apiBase && saved.pairingToken ? 'Eşleştirme ayarlı' : 'Bağlantı gerekli';
}
$('enableSite').addEventListener('click',async()=>{
  if (!currentOrigin) return;
  const granted = await chrome.permissions.request({origins:[currentOrigin+'/*']});
  if (!granted) { $('status').textContent='Site izni verilmedi. Tarayıcı bu portalı izlemeyecek.'; return; }
  const saved = await chrome.storage.local.get(['allowedOrigins']);
  const allowed = Array.isArray(saved.allowedOrigins) ? saved.allowedOrigins : [];
  if (!allowed.includes(currentOrigin)) allowed.push(currentOrigin);
  await chrome.storage.local.set({allowedOrigins:allowed});
  $('enableSite').textContent='Portal izni açık'; $('enableSite').classList.add('enabled');
  let detectorReady = false;
  try {
    await chrome.scripting.executeScript({
      target:{tabId:currentTabId},
      files:['content-script.js']
    });
    await chrome.tabs.sendMessage(currentTabId,{type:'scan-visible-account'});
    detectorReady = true;
  } catch {
    // The user has granted portal access; do not reload or navigate their active page.
  }
  $('status').textContent = detectorReady
    ? 'Site izni verildi. Görünür profil etiketi otomatik algılanırsa hesap listesine eklenir; bulunamazsa etiketi manuel girebilirsiniz.'
    : 'Site izni verildi ancak algılayıcı bu sekmeye eklenemedi. Sayfayı kendiniz yenileyip eklentiyi tekrar açın. Parola veya çerez okunmaz.';
});
$('save').addEventListener('click',async()=>{
  if (!currentOrigin) return;
  const button=$('save');
  button.disabled=true;
  $('status').textContent='Seçimler kaydedildi. PULSE sinyali gönderiliyor…';
  try {
    const permission = await chrome.permissions.contains({origins:[currentOrigin+'/*']});
    if (!permission) {
      showReportResult({ok:false,message:'Önce “Bu portalı izlemeye aç” düğmesiyle site iznini verin.'});
      return;
    }
    const values = await chrome.storage.local.get(['accountLabels','accountSources','sessionStates','sectionLabels']);
    const accountLabels=values.accountLabels||{},accountSources=values.accountSources||{},sessionStates=values.sessionStates||{},sectionLabels=values.sectionLabels||{};
    const manualLabel=$('accountName').value.trim().slice(0,100);
    if(manualLabel){accountLabels[currentTabKey]=manualLabel;accountSources[currentTabKey]='manual';}
    else{delete accountLabels[currentTabKey];delete accountSources[currentTabKey];}
    sessionStates[currentTabKey]=manualLabel ? $('sessionState').value : 'unknown';
    sectionLabels[currentTabKey]=$('sectionLabel').value.trim().slice(0,60);
    await chrome.storage.local.set({accountLabels,accountSources,sessionStates,sectionLabels});
    const result=await chrome.runtime.sendMessage({type:'report-active-tab'});
    showReportResult(result);
  } catch {
    showReportResult({ok:false,message:'Seçimler kaydedildi ancak PULSE sinyal sonucu alınamadı. Eklentiyi yenileyip yeniden deneyin.'});
  } finally {
    button.disabled=false;
  }
});
void init().catch(()=>{$('status').textContent='Eklenti ayarları okunamadı. Tarayıcı eklenti sayfasından yenileyin.';});