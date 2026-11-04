import { useCallback, useEffect, useMemo, useState } from 'react';

type Request = (path: string, method?: string, data?: unknown) => Promise<Record<string, any>>;
type Report = {
  id:string; deviceId:string; deviceName:string; deviceOwnerName:string; browser:string; tabId:string;
  tabTitle:string; portalOrigin:string; pagePath:string; activeUiTab:string; accountName:string;
  normalizedAccount:string; accountSource:'manual'|'portal'|'unknown'; sessionState:'active'|'logged_out'|'unknown';
  tabActive:boolean; lastSeen:string;
};
type Device = {id:string;deviceName:string;createdAt:string;lastSeenAt:string|null};
type Claim = {id:string;normalizedAccount:string;accountName:string;userId:string;ownerName:string;deviceId:string;deviceName:string;createdAt:string;lastSeen:string;expiresAt:string};
type MonitorData = {reports:Report[];devices:Device[];claims:Claim[];seenAccounts:Array<{normalizedAccount:string;accountName:string;firstSeen:string;lastSeen:string;lastDeviceName:string}>;staleAfterSeconds:number;claimWindowSeconds:number};
type Tone = 'active'|'logged-out'|'unknown'|'stale';

function dateText(value:string|null|undefined):string {
  if(!value)return '—';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '—';
  return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
}
function ageText(value:string):string {
  const stamp=Date.parse(value);
  if(!Number.isFinite(stamp))return 'Bilinmiyor';
  const seconds=Math.max(0,Math.floor((Date.now()-stamp)/1000));
  if(seconds<60)return String(seconds)+' sn önce';
  if(seconds<3600)return String(Math.floor(seconds/60))+' dk önce';
  if(seconds<86400)return String(Math.floor(seconds/3600))+' sa önce';
  return String(Math.floor(seconds/86400))+' gün önce';
}
function stateOf(report:Report,staleAfterSeconds:number):{tone:Tone;label:string;fresh:boolean} {
  const stamp=Date.parse(report.lastSeen);
  const fresh=Number.isFinite(stamp)&&Date.now()-stamp<=staleAfterSeconds*1000&&stamp<=Date.now()+60_000;
  if(!fresh)return {tone:'stale',label:'Sinyal eski',fresh:false};
  if(report.sessionState==='active')return {tone:'active',label:report.tabActive?'Oturum gözlendi · açık sekme':'Oturum gözlendi · arka plan',fresh:true};
  if(report.sessionState==='logged_out')return {tone:'logged-out',label:'Oturum kapalı olarak işaretlendi',fresh:true};
  return {tone:'unknown',label:'Durum belirsiz',fresh:true};
}
function browserName(value:string):string {
  const key=value.toLowerCase();
  if(key.includes('edge'))return 'Microsoft Edge';
  if(key.includes('chrome'))return 'Google Chrome';
  if(key.includes('firefox'))return 'Firefox';
  return value||'Bilinmeyen tarayıcı';
}

export function EcedWorkspace({
  request,canCreate,canUpdate,canDelete,currentUserId,
}:{
  request:Request;canCreate:boolean;canUpdate:boolean;canDelete:boolean;currentUserId:string;
}) {
  const [data,setData]=useState<MonitorData|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'all'|'active'|'logged-out'|'unknown'|'stale'|'conflict'>('all');
  const [deviceName,setDeviceName]=useState('');
  const [pairing,setPairing]=useState<{id:string;deviceName:string;token:string;apiBase:string}|null>(null);
  const [selectedDeviceId,setSelectedDeviceId]=useState('');
  const [showToken,setShowToken]=useState(false);

  const load=useCallback(async(quiet=false)=>{
    if(!quiet)setLoading(true);
    setError('');
    try{
      const result=await request('eced/monitor') as MonitorData;
      setData(result);
      setSelectedDeviceId(current=>current&&result.devices.some(d=>d.id===current)?current:(result.devices[0]?.id??''));
    }catch(cause){setError(cause instanceof Error?cause.message:'e-ÇED izleme verileri alınamadı.');}
    finally{if(!quiet)setLoading(false);}
  },[request]);
  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='visible')void load(true);
    },20_000);
    return ()=>window.clearInterval(timer);
  },[load]);

  const reports=data?.reports??[];
  const devices=data?.devices??[];
  const claims=data?.claims??[];
  const staleAfter=data?.staleAfterSeconds??60;

  const conflictedAccounts=useMemo(()=>{
    const computers=new Map<string,Set<string>>();
    for(const report of reports){
      const state=stateOf(report,staleAfter);
      if(!state.fresh||report.sessionState!=='active'||!report.normalizedAccount)continue;
      const set=computers.get(report.normalizedAccount)??new Set<string>();
      if(report.deviceName)set.add(report.deviceName);
      computers.set(report.normalizedAccount,set);
    }
    return new Set([...computers].filter(([,names])=>names.size>1).map(([key])=>key));
  },[reports,staleAfter]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('tr-TR');
    return reports.filter(report=>{
      const state=stateOf(report,staleAfter);
      if(filter==='conflict'&&!conflictedAccounts.has(report.normalizedAccount))return false;
      if(filter!=='all'&&filter!=='conflict'&&state.tone!==filter)return false;
      if(!needle)return true;
      return [report.accountName,report.deviceName,report.deviceOwnerName,report.browser,report.tabTitle,
        report.portalOrigin,report.pagePath,report.activeUiTab].join(' ').toLocaleLowerCase('tr-TR').includes(needle);
    }).sort((a,b)=>Date.parse(b.lastSeen)-Date.parse(a.lastSeen));
  },[reports,query,filter,staleAfter,conflictedAccounts]);

  const stats=useMemo(()=>{
    let active=0,loggedOut=0,unknown=0,stale=0;
    for(const report of reports){
      const state=stateOf(report,staleAfter);
      if(state.tone==='active')active++;
      else if(state.tone==='logged-out')loggedOut++;
      else if(state.tone==='stale')stale++;
      else unknown++;
    }
    return {active,loggedOut,unknown,stale,conflicts:conflictedAccounts.size};
  },[reports,staleAfter,conflictedAccounts]);

  async function createPairing(){
    if(!canCreate||deviceName.trim().length<2)return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await request('eced/pairings','POST',{deviceName:deviceName.trim()});
      const device=result.device as Device;
      const origin=typeof window!=='undefined'?window.location.origin:'';
      setPairing({id:device.id,deviceName:device.deviceName,token:String(result.pairingToken??''),apiBase:origin+'/api'});
      setShowToken(true);setDeviceName('');
      setNotice('Eşleştirme anahtarı oluşturuldu. Bu anahtar yalnızca şimdi gösterilir.');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Tarayıcı eşleştirmesi oluşturulamadı.');}
    finally{setBusy(false);}
  }
  async function copyToken(){
    if(!pairing?.token)return;
    try{await navigator.clipboard.writeText(pairing.token);setNotice('Eşleştirme anahtarı panoya kopyalandı.');}
    catch{setError('Tarayıcı panoya kopyalamaya izin vermedi. Anahtarı görünen alandan elle kopyalayın.');}
  }
  async function revokeDevice(device:Device){
    if(!canDelete)return;
    if(!window.confirm(device.deviceName+' eşleştirmesini iptal etmek istiyor musunuz? Bu cihazın rapor göndermesi durur.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('eced/pairings/'+device.id,'DELETE',{});
      setNotice(device.deviceName+' eşleştirmesi iptal edildi.');
      if(pairing?.id===device.id){setPairing(null);setShowToken(false);}
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Eşleştirme iptal edilemedi.');}
    finally{setBusy(false);}
  }
  async function claimAccount(report:Report){
    if(!canUpdate||!selectedDeviceId)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('eced/claims','POST',{accountName:report.accountName,deviceId:selectedDeviceId});
      setNotice(report.accountName+' hesabı 3 dakikalık rezervasyona alındı. Eşleştirilmiş PULSE eklentisi sinyal gönderdikçe rezervasyon yenilenir.');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Hesap rezerve edilemedi.');}
    finally{setBusy(false);}
  }
  async function releaseAccount(claim:Claim){
    if(!canUpdate)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('eced/claims/'+encodeURIComponent(claim.normalizedAccount),'DELETE',{});
      setNotice(claim.accountName+' hesabının rezervasyonu bırakıldı.');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Rezervasyon bırakılamadı.');}
    finally{setBusy(false);}
  }

  return <section className="eced-monitor-workspace" aria-label="e-ÇED canlı izleme">
    <header className="eced-monitor-intro">
      <div><span className="eced-monitor-kicker">TARAYICI VE HESAP GÖZLEMİ</span>
        <h2>e-ÇED Canlı Takip</h2>
        <p>İzin verdiğiniz Chrome / Edge profillerinden gelen görünür hesap ve sekme sinyalleri.</p>
      </div>
      <button type="button" className="eced-refresh-button" onClick={()=>void load()} disabled={loading||busy}>↻ {loading?'Yükleniyor…':'Yenile'}</button>
    </header>

    {error&&<div className="eced-monitor-alert" role="alert"><span>{error}</span></div>}
    {notice&&<div className="eced-monitor-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}

    <div className="eced-monitor-metrics">
      <article className="metric-active"><span>Güncel oturum gözlemi</span><strong>{stats.active}</strong><small>Görünür etiket / aktif sinyal</small></article>
      <article className="metric-offline"><span>Oturum kapalı işaretli</span><strong>{stats.loggedOut}</strong><small>Eklentiden açıkça gelen durum</small></article>
      <article className="metric-unknown"><span>Belirsiz veya eski</span><strong>{stats.unknown+stats.stale}</strong><small>Oturum kapalı kabul edilmez</small></article>
      <article className={stats.conflicts?'metric-conflict':''}><span>Çoklu cihaz uyarısı</span><strong>{stats.conflicts}</strong><small>Aynı etiket birden fazla cihazda</small></article>
    </div>

    <section className="eced-reports-panel">
      <div className="eced-panel-heading"><div><h3>Canlı tarayıcı raporları</h3><p>Son sinyali eskiyen cihazlar çevrimdışı / oturum kapalı diye yorumlanmaz.</p></div><span>{filtered.length} / {reports.length} rapor</span></div>
      <div className="eced-report-toolbar">
        <label className="eced-report-search"><span>⌕</span><input aria-label="Tarayıcı raporlarında ara" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Hesap, bilgisayar, kullanıcı veya portalda ara"/></label>
        <select aria-label="Rapor durum filtresi" value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}>
          <option value="all">Tüm durumlar</option><option value="active">Oturum gözlendi</option><option value="logged-out">Kapalı işaretli</option><option value="unknown">Belirsiz</option><option value="stale">Sinyal eski</option><option value="conflict">Çoklu cihaz</option>
        </select>
        {canUpdate&&<label className="eced-claim-device"><span>Rezervasyon cihazı</span><select value={selectedDeviceId} onChange={event=>setSelectedDeviceId(event.target.value)}><option value="">Eşleştirme seçin</option>{devices.map(device=><option key={device.id} value={device.id}>{device.deviceName}</option>)}</select></label>}
      </div>
      {loading&&!data?<div className="eced-monitor-empty">e-ÇED raporları yükleniyor…</div>
      :filtered.length===0?<div className="eced-monitor-empty"><strong>{reports.length?'Filtreyle eşleşen rapor yok':'Henüz tarayıcı raporu alınmadı'}</strong><span>{reports.length?'Arama ve durum filtresini değiştirin.':'Eklentiyi kurup portal sekmesi için site izni verin. Ardından eklentide “Bu sekmeyi izle” seçeneğini etkinleştirin.'}</span></div>
      :<div className="eced-report-table-wrap"><table className="eced-report-table"><thead><tr><th>Durum</th><th>e-ÇED hesabı</th><th>Bilgisayar / kullanıcı</th><th>Tarayıcı</th><th>Portal sayfası</th><th>Son sinyal</th><th>Rezervasyon</th><th>İşlem</th></tr></thead>
        <tbody>{filtered.map(report=>{
          const state=stateOf(report,staleAfter);
          const conflict=conflictedAccounts.has(report.normalizedAccount);
          const claim=claims.find(item=>item.normalizedAccount===report.normalizedAccount);
          return <tr key={report.id}>
            <td><span className={'eced-report-state tone-'+state.tone}>{state.label}</span>{conflict&&<small className="eced-conflict-flag">Çoklu cihaz</small>}</td>
            <td><strong>{report.accountName||'Hesap etiketi seçilmedi'}</strong><small>{report.accountSource==='manual'?'Kullanıcı seçimi':report.accountSource==='portal'?'Görünür portal etiketi':'Kaynak belirsiz'}</small></td>
            <td><strong>{report.deviceName}</strong><small>{report.deviceOwnerName||'—'}</small></td>
            <td>{browserName(report.browser)}<small>{report.tabActive?'Sekme açık':'Arka plan sekmesi'}</small></td>
            <td><strong>{report.activeUiTab||report.tabTitle||'—'}</strong><small>{report.portalOrigin}{report.pagePath}</small></td>
            <td><strong>{ageText(report.lastSeen)}</strong><small>{dateText(report.lastSeen)}</small></td>
            <td>{claim?<><span className="eced-claim-chip">Rezerve</span><small>{claim.ownerName} · {claim.deviceName}</small></>:<span className="eced-unclaimed">Rezerve değil</span>}</td>
            <td>{canUpdate&&report.accountName&&selectedDeviceId&&!claim?<button type="button" className="eced-claim-button" disabled={busy} onClick={()=>void claimAccount(report)}>Hesabı rezerve et</button>
              :canUpdate&&claim&&claim.userId===currentUserId?<button type="button" className="eced-release-button" disabled={busy} onClick={()=>void releaseAccount(claim)}>Rezervasyonu bırak</button>
              :<span className="eced-no-action">{claim?'Başka kullanıcıda':'—'}</span>}</td>
          </tr>;
        })}</tbody></table></div>}
    </section>

    <section className="eced-seen-panel"><div className="eced-panel-heading"><div><h3>Gözlenmiş hesaplar</h3><p>En az bir kez tarayıcı eklentisinden görünür etiket olarak alınan hesaplar.</p></div><span>{data?.seenAccounts.length??0} kayıt</span></div>
      <div className="eced-seen-chips">{(data?.seenAccounts??[]).slice(0,30).map(account=><span key={account.normalizedAccount}><strong>{account.accountName}</strong><small>{account.lastDeviceName} · {ageText(account.lastSeen)}</small></span>)}</div>
    </section>

    <section className="eced-pairing-panel">
      <div className="eced-panel-heading"><div><h3>Tarayıcı eşleştirmeleri</h3><p>Her Windows bilgisayarı ve kullanılan tarayıcı profili için ayrı eşleştirme yapın.</p></div>
        <span>{devices.length} etkin cihaz</span></div>
      {canCreate&&<form className="eced-pairing-create" onSubmit={event=>{event.preventDefault();void createPairing();}}>
        <label><span>Bilgisayar / profil adı</span><input value={deviceName} onChange={event=>setDeviceName(event.target.value)} maxLength={80} minLength={2} placeholder="Örn. Ofis PC · Edge" required /></label>
        <button type="submit" disabled={busy||deviceName.trim().length<2}>{busy?'İşleniyor…':'Eşleştirme anahtarı oluştur'}</button>
      </form>}
      {pairing&&showToken&&<div className="eced-pairing-secret">
        <div><strong>{pairing.deviceName} için yeni anahtar</strong><p>Bu anahtar yalnızca bu ekranda gösterilir. Eklentiye güvenli şekilde kaydedin; daha sonra yeniden görüntülenemez.</p></div>
        <label><span>API adresi</span><input readOnly value={pairing.apiBase} onFocus={event=>event.currentTarget.select()}/></label>
        <label><span>Tek seferlik eşleştirme anahtarı</span><input readOnly type="text" value={pairing.token} onFocus={event=>event.currentTarget.select()} /></label>
        <div className="eced-secret-actions"><button type="button" onClick={()=>void copyToken()}>Anahtarı kopyala</button><button type="button" className="subtle" onClick={()=>{setPairing(null);setShowToken(false);}}>Gizle</button></div>
      </div>}
      {devices.length===0?<div className="eced-monitor-empty compact">Henüz tarayıcı eşleştirilmedi. Eşleştirme oluşturduktan sonra Chrome / Edge eklentisini yükleyin.</div>
      :<div className="eced-device-list">{devices.map(device=><article key={device.id}>
        <div className="eced-device-icon">◎</div><div className="eced-device-copy"><strong>{device.deviceName}</strong><span>Oluşturuldu: {dateText(device.createdAt)}</span><small>Son sinyal: {dateText(device.lastSeenAt)}</small></div>
        {canDelete&&<button type="button" className="eced-device-revoke" disabled={busy} onClick={()=>void revokeDevice(device)}>Eşleştirmeyi iptal et</button>}
      </article>)}</div>}
      <p className="eced-security-note">Eklenti yalnızca izin verilen portal sekmesinin adresini, başlığını, sekme etkinliğini ve sizin seçtiğiniz görünür hesap etiketini gönderir. Parola, çerez, form alanı, localStorage / sessionStorage veya sayfa HTML içeriği okunmaz. Bu gözlem, e-ÇED sunucusundan doğrulanmış kimlik kanıtı değildir.</p>
    </section>

    </section>
  </section>;
}


export function EcedAccountOverview({request,onOpen}:{request:Request;onOpen:()=>void}) {
  const [data,setData]=useState<MonitorData|null>(null);
  const [error,setError]=useState('');
  const load=useCallback(async()=>{
    try{setData(await request('eced/monitor') as MonitorData);setError('');}
    catch(cause){setError(cause instanceof Error?cause.message:'e-ÇED hesap durumu alınamadı.');}
  },[request]);
  useEffect(()=>{
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},20_000);
    return ()=>window.clearInterval(timer);
  },[load]);
  const accounts=useMemo(()=>{
    if(!data)return [];
    const latest=new Map<string,Report>();
    for(const report of data.reports){
      if(!report.normalizedAccount)continue;
      const old=latest.get(report.normalizedAccount);
      if(!old||Date.parse(report.lastSeen)>Date.parse(old.lastSeen))latest.set(report.normalizedAccount,report);
    }
    return data.seenAccounts.map(account=>{
      const report=latest.get(account.normalizedAccount);
      const state=report?stateOf(report,data.staleAfterSeconds):null;
      const tone=state?.fresh&&report?.sessionState==='active'?'busy'
        :state?.fresh&&report?.sessionState==='logged_out'?'ready':'unknown';
      const label=tone==='busy'?'Etkin portal sinyali':tone==='ready'?'Oturum kapalı işaretli':state?.tone==='stale'?'Sinyal eski':'Durum belirsiz';
      return {...account,tone,label};
    }).sort((a,b)=>({busy:0,ready:1,unknown:2}[a.tone]-{busy:0,ready:1,unknown:2}[b.tone])||a.accountName.localeCompare(b.accountName,'tr'));
  },[data]);
  const busyCount=accounts.filter(x=>x.tone==='busy').length;
  const readyCount=accounts.filter(x=>x.tone==='ready').length;
  return <section className="eced-overview-panel" aria-label="e-ÇED hesap durumları">
    <div className="eced-overview-heading">
      <div><span className="eced-overview-kicker">TARAYICI GÖZLEMİ</span><h2>e-ÇED hesapları</h2>
      <p>Durumlar tarayıcı eklentisinin son görünür portal sinyalidir; resmî e-ÇED oturum doğrulaması değildir.</p></div>
      <button type="button" onClick={onOpen}>Tümünü görüntüle <span aria-hidden="true">↗</span></button>
    </div>
    <div className="eced-overview-summary">
      <span className="eced-mini-count is-busy"><i/>{busyCount} etkin sinyal</span>
      <span className="eced-mini-count is-ready"><i/>{readyCount} kapalı işaretli</span>
      <span className="eced-overview-total">{accounts.length} kayıtlı hesap</span>
    </div>
    {error?<p className="eced-overview-state" role="status">Durum yenilenemedi. {error}</p>
      :!data?<p className="eced-overview-state">Hesap durumları yükleniyor…</p>
      :accounts.length===0?<p className="eced-overview-state">Henüz gözlenmiş hesap yok. İlk portal sinyali geldiğinde hesap otomatik olarak bu listeye eklenir.</p>
      :<div className="eced-overview-accounts">{accounts.slice(0,8).map(account=>
        <div className={'eced-overview-account tone-'+account.tone} key={account.normalizedAccount}>
          <i aria-hidden="true"/><strong>{account.accountName}</strong><span>{account.label}</span>
        </div>)}</div>}
  </section>;
}
