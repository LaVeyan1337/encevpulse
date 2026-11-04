const $ = id => document.getElementById(id);
let currentOrigin = '';
let currentTabKey = '';
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
  currentOrigin = parsed.origin;
  currentTabKey = currentOrigin + '::' + String(tab.id);
  $('pageTitle').textContent = tab.title || 'Portal sekmesi';
  $('pageOrigin').textContent = currentOrigin + parsed.pathname;
  const saved = await chrome.storage.local.get(['allowedOrigins','accountLabels','sessionStates','sectionLabels','apiBase','pairingToken']);
  const allowed = Array.isArray(saved.allowedOrigins) && saved.allowedOrigins.includes(currentOrigin);
  $('enableSite').textContent = allowed ? 'Portal izni açık' : 'Bu portalı izlemeye aç';
  $('enableSite').classList.toggle('enabled',allowed);
  $('accountName').value = (saved.accountLabels || {})[currentTabKey] || '';
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
  $('status').textContent='Bu portal için site izni verildi. Hesap etiketini kendiniz seçip kaydedebilirsiniz.';
});
$('save').addEventListener('click',async()=>{
  if (!currentOrigin) return;
  const permission = await chrome.permissions.contains({origins:[currentOrigin+'/*']});
  if (!permission) { $('status').textContent='Önce “Bu portalı izlemeye aç” düğmesiyle site iznini verin.'; return; }
  const values = await chrome.storage.local.get(['accountLabels','sessionStates','sectionLabels']);
  const accountLabels=values.accountLabels||{},sessionStates=values.sessionStates||{},sectionLabels=values.sectionLabels||{};
  accountLabels[currentTabKey]=$('accountName').value.trim().slice(0,100);
  sessionStates[currentTabKey]=accountLabels[currentTabKey] ? $('sessionState').value : 'unknown';
  sectionLabels[currentTabKey]=$('sectionLabel').value.trim().slice(0,60);
  await chrome.storage.local.set({accountLabels,sessionStates,sectionLabels});
  $('status').textContent='Seçimler kaydedildi. Parola, çerez veya web sayfasının depolama alanı okunmadı.';
  chrome.runtime.sendMessage({type:'report-active-tab'});
});
void init().catch(()=>{$('status').textContent='Eklenti ayarları okunamadı. Tarayıcı eklenti sayfasından yenileyin.';});