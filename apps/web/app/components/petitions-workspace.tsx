import { useEffect, useState } from 'react';

type Project = {id:string;name:string;status:string};
type TemplateRecord = {id:string;name:string;size:number;updatedAt:string;bytes:ArrayBuffer};
type StoredTemplateMeta = {name:string;size:number;updatedAt:string};

const DB_NAME='encev-pulse-local-petitions';
const STORE_NAME='templates';
const TEMPLATE_KEY='primary';
const MAX_TEMPLATE_BYTES=20*1024*1024;
const SAMPLE_URL='https://raw.githubusercontent.com/LaVeyan1337/12312/main/000D%C4%B0LEK%C3%87ELER%C4%B0M%C4%B0Z%202026.docx';

function openTemplateDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('Bu tarayıcı yerel şablon saklamayı desteklemiyor.'));return;}
    const opening=indexedDB.open(DB_NAME,1);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      if(!db.objectStoreNames.contains(STORE_NAME))db.createObjectStore(STORE_NAME,{keyPath:'id'});
    };
    opening.onsuccess=()=>resolve(opening.result);
    opening.onerror=()=>reject(opening.error??new Error('Yerel şablon deposu açılamadı.'));
    opening.onblocked=()=>reject(new Error('Şablon deposu başka bir sekmede güncelleniyor. Diğer PULSE sekmesini kapatıp yeniden deneyin.'));
  });
}
async function readTemplate():Promise<TemplateRecord|null>{
  const db=await openTemplateDb();
  try{
    return await new Promise((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readonly');
      const request=transaction.objectStore(STORE_NAME).get(TEMPLATE_KEY);
      request.onsuccess=()=>resolve((request.result as TemplateRecord|undefined)??null);
      request.onerror=()=>reject(request.error??new Error('Şablon okunamadı.'));
      transaction.onabort=()=>reject(transaction.error??new Error('Şablon okuma işlemi iptal edildi.'));
    });
  }finally{db.close();}
}
async function saveTemplate(record:TemplateRecord):Promise<void>{
  const db=await openTemplateDb();
  try{
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('Şablon kaydedilemedi.'));
      transaction.onabort=()=>reject(transaction.error??new Error('Şablon kaydı iptal edildi.'));
    });
  }finally{db.close();}
}
async function removeTemplate():Promise<void>{
  const db=await openTemplateDb();
  try{
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE_NAME,'readwrite');
      transaction.objectStore(STORE_NAME).delete(TEMPLATE_KEY);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('Şablon silinemedi.'));
      transaction.onabort=()=>reject(transaction.error??new Error('Şablon silme işlemi iptal edildi.'));
    });
  }finally{db.close();}
}
function fileNameSafe(value:string):string{
  return value.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').slice(0,90)||'Proje';
}
function isDocxPackage(bytes:ArrayBuffer):boolean{
  if(bytes.byteLength<22)return false;
  const view=new DataView(bytes);
  const minimum=Math.max(0,bytes.byteLength-65_557);
  let endRecord=-1;
  for(let offset=bytes.byteLength-22;offset>=minimum;offset--){
    if(view.getUint32(offset,true)===0x06054b50){endRecord=offset;break;}
  }
  if(endRecord<0)return false;
  const entryCount=view.getUint16(endRecord+10,true);
  let offset=view.getUint32(endRecord+16,true);
  if(entryCount===0xffff||offset===0xffffffff||offset>=bytes.byteLength)return false;
  const names=new Set<string>();
  for(let index=0;index<entryCount;index++){
    if(offset+46>bytes.byteLength||view.getUint32(offset,true)!==0x02014b50)return false;
    const nameLength=view.getUint16(offset+28,true);
    const extraLength=view.getUint16(offset+30,true);
    const commentLength=view.getUint16(offset+32,true);
    const next=offset+46+nameLength+extraLength+commentLength;
    if(next>bytes.byteLength||nameLength===0)return false;
    const nameBytes=new Uint8Array(bytes,offset+46,nameLength);
    names.add(new TextDecoder().decode(nameBytes));
    offset=next;
  }
  return names.has('[Content_Types].xml')&&names.has('word/document.xml');
}

function formatSize(bytes:number):string{
  if(bytes<1024*1024)return Math.max(1,Math.round(bytes/1024))+' KB';
  return (bytes/(1024*1024)).toFixed(2)+' MB';
}

export function PetitionsWorkspace({projects,canCreate}:{projects:Project[];canCreate:boolean}){
  const [template,setTemplate]=useState<StoredTemplateMeta|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selectedProjectId,setSelectedProjectId]=useState('');
  const [draftName,setDraftName]=useState('');

  useEffect(()=>{
    let cancelled=false;
    void readTemplate().then(record=>{
      if(!cancelled)setTemplate(record?{name:record.name,size:record.size,updatedAt:record.updatedAt}:null);
    }).catch(cause=>{
      if(!cancelled)setError(cause instanceof Error?cause.message:'Yerel Word şablonu okunamadı.');
    }).finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    setSelectedProjectId(current=>current&&projects.some(project=>project.id===current)?current:(projects[0]?.id??''));
  },[projects]);

  async function importTemplate(file:File|null){
    if(!file)return;
    setBusy(true);setError('');setNotice('');
    try{
      if(!file.name.toLocaleLowerCase('tr-TR').endsWith('.docx'))throw new Error('Yalnızca .docx Word dosyası seçilebilir.');
      if(file.size<4||file.size>MAX_TEMPLATE_BYTES)throw new Error('Word şablonu boş olamaz ve 20 MB sınırını aşamaz.');
      const bytes=await file.arrayBuffer();
      if(!isDocxPackage(bytes))throw new Error('Dosya geçerli bir DOCX ZIP paketi veya Word ana belge içeriği içermiyor. Word belgesini yeniden seçin.');
      const record:TemplateRecord={id:TEMPLATE_KEY,name:file.name,size:file.size,updatedAt:new Date().toISOString(),bytes};
      await saveTemplate(record);
      setTemplate({name:record.name,size:record.size,updatedAt:record.updatedAt});
      setNotice('Word şablonu bu tarayıcı profiline kaydedildi. Dosya sunucuya yüklenmedi.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Word şablonu kaydedilemedi.');}
    finally{setBusy(false);}
  }

  async function clearTemplate(){
    if(!window.confirm('Bu tarayıcı profilinde saklanan Word şablonunu silmek istiyor musunuz?'))return;
    setBusy(true);setError('');setNotice('');
    try{await removeTemplate();setTemplate(null);setNotice('Yerel Word şablonu silindi. Daha önce indirdiğiniz taslak dosyalar etkilenmez.');}
    catch(cause){setError(cause instanceof Error?cause.message:'Şablon silinemedi.');}
    finally{setBusy(false);}
  }

  async function createDraft(){
    if(!canCreate)return;
    setBusy(true);setError('');setNotice('');
    try{
      const record=await readTemplate();
      if(!record)throw new Error('Önce bir Word şablonu seçin veya örnek dilekçeyi indirip buraya aktarın.');
      const project=projects.find(item=>item.id===selectedProjectId);
      if(!project)throw new Error('Taslak için bir proje seçin.');
      const proposed=fileNameSafe('Dilekce_'+project.name+'_'+new Date().toLocaleDateString('sv-SE'))+'.docx';
      const chosen=draftName.trim()?fileNameSafe(draftName.trim()).replace(/\.docx$/i,'')+'.docx':proposed;
      const blob=new Blob([record.bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
      const url=URL.createObjectURL(blob);
      const anchor=document.createElement('a');
      anchor.href=url;anchor.download=chosen;anchor.style.display='none';
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      window.setTimeout(()=>URL.revokeObjectURL(url),1500);
      setNotice('Şablonun özgün baytları değiştirilmeden kopya olarak indirildi. Proje adı yalnızca dosya adına eklendi; belge içeriğini Word içinde düzenleyin.');
    }catch(cause){setError(cause instanceof Error?cause.message:'Word taslağı oluşturulamadı.');}
    finally{setBusy(false);}
  }

  const selectedProject=projects.find(item=>item.id===selectedProjectId);
  return <section className="petitions-workspace" aria-label="Dilekçeler">
    <header className="petitions-intro">
      <div><span className="petitions-kicker">WORD BELGE ÇALIŞMA ALANI</span><h2>Dilekçeler</h2>
        <p>Seçtiğiniz Word örneğinden proje için ayrı ve özgün biçimi korunmuş taslak kopyası oluşturun.</p></div>
    </header>
    {error&&<div className="petitions-alert" role="alert">{error}</div>}
    {notice&&<div className="petitions-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}

    <div className="petitions-capability-grid">
      <article><span className="petitions-capability-icon">▤</span><div><strong>Word biçimi korunur</strong><p>Şablonun sayfa düzeni, logo, görseller, başlık ve altbilgileri yeniden oluşturulmaz; dosya baytları aynen kopyalanır.</p></div></article>
      <article><span className="petitions-capability-icon">⌂</span><div><strong>Tarayıcıda yerel saklama</strong><p>Şablon yalnızca bu bilgisayarın bu tarayıcı profiline kaydedilir. Sunucuya veya şirket NAS'ına aktarılmaz.</p></div></article>
      <article><span className="petitions-capability-icon">↗</span><div><strong>Proje bazlı dosya adı</strong><p>Seçtiğiniz proje, taslak dosyasının adına eklenir. Word belgesinin içindeki alanlar otomatik değiştirilmez.</p></div></article>
    </div>

    <section className="petition-template-panel">
      <div className="petition-panel-heading"><div><h3>Word şablonu</h3><p>Mevcut dolu örneği ya da kurumunuzca onaylanmış bir DOCX belgesini seçin.</p></div><span className={template?'template-ready':'template-missing'}>{loading?'Kontrol ediliyor…':template?'Şablon kayıtlı':'Şablon seçilmedi'}</span></div>
      {template?<div className="petition-template-current">
        <div className="petition-template-file"><span className="petition-docx-icon">W</span><div><strong>{template.name}</strong><small>{formatSize(template.size)} · Son kaydetme {new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(template.updatedAt))}</small></div></div>
        {canCreate&&<button type="button" className="petition-text-button" disabled={busy} onClick={()=>void clearTemplate()}>Yerel şablonu sil</button>}
      </div>:<div className="petition-empty-template">{loading?'Yerel şablon aranıyor…':'Bu tarayıcı profiline henüz bir DOCX şablonu kaydetmediniz.'}</div>}
      {canCreate&&<div className="petition-template-actions">
        <label className="petition-file-picker">DOCX dosyası seç<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy} onChange={event=>{void importTemplate(event.target.files?.[0]??null);event.currentTarget.value='';}}/></label>
        <a href={SAMPLE_URL} target="_blank" rel="noopener noreferrer" className="petition-sample-link">2026 örnek dilekçeyi indir ↗</a>
      </div>}
      <p className="petition-storage-note">Gizlilik sınırı: IndexedDB içindeki şablon aynı tarayıcı profiline aittir; başka bilgisayarla eşitlenmez. Tarayıcı verileri temizlenirse bu yerel kopya kaybolabilir.</p>
    </section>

    <section className="petition-draft-panel">
      <div className="petition-panel-heading"><div><h3>Yeni Word taslağı oluştur</h3><p>Orijinal şablonun üzerine yazılmaz. Her işlem yeni bir DOCX indirmesi üretir.</p></div><span className="petition-step-index">01 / 02</span></div>
      <div className="petition-draft-form">
        <label><span>İlgili proje</span><select value={selectedProjectId} onChange={event=>setSelectedProjectId(event.target.value)} disabled={projects.length===0}><option value="">Proje seçin</option>{projects.filter(project=>project.status!=='archived').map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <label><span>Dosya adı (isteğe bağlı)</span><input value={draftName} onChange={event=>setDraftName(event.target.value)} maxLength={90} placeholder={selectedProject?'Dilekce_'+fileNameSafe(selectedProject.name):'Dilekce_Proje_YYYY-AA-GG'}/></label>
        <button type="button" className="petition-create-button" disabled={!canCreate||busy||loading||!template||!selectedProject} onClick={()=>void createDraft()}>{busy?'Hazırlanıyor…':'Word taslağını indir'}</button>
      </div>
      <p className="petition-draft-footnote">İndirilen belge, seçilen şablonun birebir kopyasıdır. Proje adı, kurum, tarih, mevzuat maddesi ve dilekçe metni gibi içerikler Word içinde yetkili kullanıcı tarafından kontrol edilip düzenlenmelidir.</p>
    </section>

    <section className="petition-desktop-parity">
      <div><span className="petition-parity-label">MASAÜSTÜ PULSE İŞLEVLERİ</span><h3>Ortak Word kilidi ve bekleme sırası web’e aktarılmadı</h3>
        <p>Word dosyasının gerçek kullanım kilidi, Windows/SMB dosya sahipliği, ekip çevrimiçi durumu, bekleme sırası, erişim geçmişi ve ortak yedek geçmişi masaüstü PULSE’un Windows dosya sunucusu bağlantısına bağlıdır. Bu web sürümünde NAS erişimi kapalıdır; bu işlemler yapılmış gibi gösterilmez. Ortak kilit akışı, ayrı ve güvenli bir masaüstü yardımcı servis kararıyla taşınabilir.</p></div>
    </section>
  </section>;
}
