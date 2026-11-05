const $ = id => document.getElementById(id);
function normalizeApiBase(value) {
  const parsed = new URL(String(value || '').trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('API adresi HTTP(S) olmalıdır.');
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('API adresinde kullanıcı adı, parola, query veya hash bulunamaz.');
  return parsed.href.replace(/\/+$/, '');
}
async function readConfig() {
  const values = await chrome.storage.local.get(['apiBase','pairingToken']);
  $('apiBase').value = values.apiBase || '';
  $('pairingToken').value = values.pairingToken || '';
}
function isOriginDeclared(origin) {
  const target = new URL(origin);
  const patterns = chrome.runtime.getManifest().optional_host_permissions || [];
  return patterns.some(pattern => {
    try {
      const allowed = new URL(pattern.replace(/\/\*$/, '/'));
      return allowed.protocol === target.protocol && allowed.hostname === target.hostname;
    } catch {
      return false;
    }
  });
}
async function testConnection(apiBaseInput = $('apiBase').value, tokenInput = $('pairingToken').value.trim()) {
  const apiBase = normalizeApiBase(apiBaseInput);
  const token = String(tokenInput || '').trim();
  if (!token) throw new Error('Eşleştirme anahtarını girin.');
  const origin = new URL(apiBase).origin;
  if (!isOriginDeclared(origin)) {
    throw new Error('Bu PULSE sunucu alan adı eklentinin izin listesinde yok. Tam HTTPS origin adresi manifest.json içindeki optional_host_permissions alanına eklenip eklenti yeniden yüklenmeli.');
  }
  const permitted = await chrome.permissions.contains({origins:[origin+'/*']});
  if (!permitted) throw new Error('Önce API sunucusu için bağlantı izni verin.');
  const response = await fetch(apiBase + '/eced/extension/health', {
    headers: {'X-Pulse-Token':token}, cache:'no-store', credentials:'omit'
  });
  if (!response.ok) throw new Error('PULSE API eşleştirmeyi doğrulamadı (HTTP ' + response.status + ').');
  return response.json();
}
$('save').addEventListener('click',async()=>{
  $('status').textContent='Bağlantı doğrulanıyor…';
  try{
    const apiBase=normalizeApiBase($('apiBase').value);
    const pairingToken=$('pairingToken').value.trim();
    if(!/^[A-Za-z0-9_-]{40,100}$/.test(pairingToken))throw new Error('Eşleştirme anahtarı biçimi geçersiz.');
    const apiOrigin=new URL(apiBase).origin;
    if(!isOriginDeclared(apiOrigin)) {
      throw new Error('Bu PULSE sunucu alan adı eklentinin izin listesinde yok. Tam HTTPS origin adresi manifest.json içindeki optional_host_permissions alanına eklenip eklenti yeniden yüklenmeli.');
    }
    const granted=await chrome.permissions.request({origins:[apiOrigin+'/*']});
    if(!granted)throw new Error('API sunucusu için erişim izni verilmedi.');
    const result=await testConnection(apiBase,pairingToken);
    await chrome.storage.local.set({apiBase,pairingToken});
    $('status').textContent='Bağlantı doğrulandı: '+result.deviceName+'. Şimdi e-ÇED portal sekmesinde site iznini açın.';
  }catch(error){$('status').textContent=error instanceof Error?error.message:'Ayarlar kaydedilemedi.';}
});
$('test').addEventListener('click',async()=>{
  $('status').textContent='PULSE bağlantısı deneniyor…';
  try{const result=await testConnection();$('status').textContent='Bağlantı başarılı: '+result.deviceName+'.';}
  catch(error){$('status').textContent=error instanceof Error?error.message:'Bağlantı başarısız.';}
});
void readConfig().catch(()=>$('status').textContent='Eklenti ayarları okunamadı.');