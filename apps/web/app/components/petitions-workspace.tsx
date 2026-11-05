import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

type Project = {id:string;name:string;status:string};
type PetitionField = {key:string;label:string;source:'project'|'user'|'system';required:boolean;multiline?:boolean};
type PetitionTemplate = {
  id:string;name:string;description:string;versionId:string;version:number;fileName:string;
  sha256:string;byteSize:number;fieldKeys:string[];fields:PetitionField[];
  versionCount:number;createdByName:string;createdAt:string;
};
type PetitionTemplateVersion = {
  id:string;version:number;fileName:string;sha256:string;byteSize:number;
  fieldKeys:string[];fields:PetitionField[];createdAt:string;createdByName:string;
};
type PetitionDocumentStatus='draft'|'in_review'|'approved'|'sent';
type PetitionDocument = {
  id:string;projectId:string;projectName:string;templateVersionId:string;templateId:string;
  templateName:string;templateVersion:number;title:string;fileName:string;sha256:string;
  byteSize:number;status:PetitionDocumentStatus;version:number;createdAt:string;updatedAt:string;
  creatorName:string;previewText?:string;fields?:Record<string,string>;
};
type Request = (path:string,method?:string,data?:unknown)=>Promise<Record<string,any>>;

const MAX_TEMPLATE_BYTES=12*1024*1024;
const EMPTY_FORM:Record<string,string>={};

const statusLabels:Record<PetitionDocumentStatus,string>={
  draft:'Taslak',in_review:'İncelemede',approved:'Onaylandı',sent:'Gönderildi',
};

function formatSize(bytes:number):string{
  if(bytes<1024*1024)return Math.max(1,Math.round(bytes/1024))+' KB';
  return (bytes/(1024*1024)).toFixed(2)+' MB';
}
function dateLabel(value:string):string{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Tarih bilinmiyor';
  return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeZone:'Europe/Istanbul'}).format(date);
}
function dateTimeLabel(value:string):string{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return 'Tarih bilinmiyor';
  return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(date);
}
function safeBaseName(value:string):string{
  return value.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ')
    .trim().replace(/[. ]+$/,'').slice(0,140)||'Dilekce';
}
function statusTone(status:PetitionDocumentStatus):string{
  return status==='sent'||status==='approved'?'petition-status-complete':status==='in_review'?'petition-status-review':'petition-status-draft';
}

export function PetitionsWorkspace({
  projects,canCreate,canUpdate,canManageTemplates,canApprove,request,
}:{
  projects:Project[];
  canCreate:boolean;
  canUpdate:boolean;
  canManageTemplates:boolean;
  canApprove:boolean;
  request:Request;
}){
  const [templates,setTemplates]=useState<PetitionTemplate[]>([]);
  const [documents,setDocuments]=useState<PetitionDocument[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);

  const [selectedProjectId,setSelectedProjectId]=useState('');
  const [selectedTemplateVersionId,setSelectedTemplateVersionId]=useState('');
  const [fieldValues,setFieldValues]=useState<Record<string,string>>(EMPTY_FORM);
  const [documentTitle,setDocumentTitle]=useState('');
  const [documentFileName,setDocumentFileName]=useState('');
  const [createdDocument,setCreatedDocument]=useState<PetitionDocument|null>(null);

  const [templateName,setTemplateName]=useState('');
  const [templateDescription,setTemplateDescription]=useState('');
  const [templateFile,setTemplateFile]=useState<File|null>(null);
  const [versionTarget,setVersionTarget]=useState<string|null>(null);
  const [versionFile,setVersionFile]=useState<File|null>(null);
  const [historyTemplateId,setHistoryTemplateId]=useState<string|null>(null);
  const [historyVersions,setHistoryVersions]=useState<PetitionTemplateVersion[]>([]);

  const activeProjects=useMemo(()=>projects.filter(project=>project.status!=='archived'),[projects]);
  const selectedTemplate=templates.find(template=>template.versionId===selectedTemplateVersionId)??null;
  const selectedProject=activeProjects.find(project=>project.id===selectedProjectId)??null;

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [templateResult,documentResult]=await Promise.all([
        request('petitions/templates'),
        request('petitions/documents?status=active&limit=80'),
      ]);
      setTemplates(Array.isArray(templateResult.templates)?templateResult.templates as PetitionTemplate[]:[]);
      setDocuments(Array.isArray(documentResult.documents)?documentResult.documents as PetitionDocument[]:[]);
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Dilekçe kayıtları alınamadı.');
    }finally{setLoading(false);}
  },[request]);

  useEffect(()=>{void load();},[load,refreshKey]);
  useEffect(()=>{
    setSelectedProjectId(current=>current&&activeProjects.some(project=>project.id===current)?current:(activeProjects[0]?.id??''));
  },[activeProjects]);
  useEffect(()=>{
    if(!selectedTemplate){setFieldValues(EMPTY_FORM);return;}
    const next:Record<string,string>={};
    for(const field of selectedTemplate.fields){
      if(field.source==='user')next[field.key]=fieldValues[field.key]??'';
    }
    setFieldValues(next);
  // A template version change intentionally resets its own field values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedTemplateVersionId]);

  async function uploadTemplate(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canManageTemplates||busy)return;
    if(!templateFile){setError('Bir DOCX şablonu seçin.');return;}
    if(!templateFile.name.toLocaleLowerCase('tr-TR').endsWith('.docx')||templateFile.size<22||templateFile.size>MAX_TEMPLATE_BYTES){
      setError('Yalnızca 12 MB sınırını aşmayan geçerli bir .docx dosyası seçin.');return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      const form=new FormData();
      form.append('name',templateName);
      form.append('description',templateDescription);
      form.append('file',templateFile);
      const result=await request('petitions/templates','POST',form);
      setTemplateName('');setTemplateDescription('');setTemplateFile(null);
      setSelectedTemplateVersionId(result.template?.versionId??'');
      setNotice('Word şablonu ortak PULSE deposuna kaydedildi. Alanlar ve dosya bütünlüğü doğrulandı.');
      setRefreshKey(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'Word şablonu kaydedilemedi.');}
    finally{setBusy(false);}
  }

  async function uploadVersion(templateId:string){
    if(!canManageTemplates||busy)return;
    if(!versionFile){setError('Yeni şablon sürümü için DOCX dosyası seçin.');return;}
    if(!versionFile.name.toLocaleLowerCase('tr-TR').endsWith('.docx')||versionFile.size<22||versionFile.size>MAX_TEMPLATE_BYTES){
      setError('Yalnızca 12 MB sınırını aşmayan geçerli bir .docx dosyası seçin.');return;
    }
    setBusy(true);setError('');setNotice('');
    try{
      const form=new FormData();form.append('file',versionFile);
      const result=await request('petitions/templates/'+templateId+'/versions','POST',form);
      setVersionTarget(null);setVersionFile(null);
      setSelectedTemplateVersionId(result.template?.versionId??'');
      setNotice('Yeni şablon sürümü kaydedildi. Önceki sürümler belge kayıtlarında korunuyor.');
      setRefreshKey(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'Şablon sürümü kaydedilemedi.');}
    finally{setBusy(false);}
  }

  async function archiveTemplate(template:PetitionTemplate){
    if(!canManageTemplates||busy)return;
    if(!window.confirm(`“${template.name}” şablonu yeni dilekçe oluşturma listesinden kaldırılsın mı? Önceki dilekçe kayıtları korunur.`))return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('petitions/templates/'+template.id+'/archive','POST',{});
      if(selectedTemplate?.id===template.id)setSelectedTemplateVersionId('');
      setNotice('Şablon arşivlendi. Daha önce oluşturulan belgeler korunuyor.');
      setRefreshKey(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'Şablon arşivlenemedi.');}
    finally{setBusy(false);}
  }

  async function showHistory(templateId:string){
    setHistoryTemplateId(current=>current===templateId?null:templateId);
    if(historyTemplateId===templateId)return;
    setBusy(true);setError('');
    try{
      const result=await request('petitions/templates/'+templateId+'/versions');
      setHistoryVersions(Array.isArray(result.versions)?result.versions as PetitionTemplateVersion:[]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Şablon geçmişi alınamadı.');setHistoryTemplateId(null);}
    finally{setBusy(false);}
  }

  function setField(key:string,value:string){setFieldValues(current=>({...current,[key]:value}));}

  async function createDocument(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canCreate||busy)return;
    if(!selectedProject){setError('Bir proje seçin.');return;}
    if(!selectedTemplate){setError('Etkin bir Word şablonu seçin.');return;}
    setBusy(true);setError('');setNotice('');
    try{
      const result=await request('petitions/documents','POST',{
        projectId:selectedProject.id,
        templateVersionId:selectedTemplate.versionId,
        title:documentTitle.trim(),
        fileName:documentFileName.trim(),
        fields:fieldValues,
      });
      setCreatedDocument(result.document as PetitionDocument);
      setDocumentTitle('');setDocumentFileName('');
      setNotice('Word belgesi oluşturuldu ve proje kaydına bağlandı.'); 
      setRefreshKey(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'Word belgesi oluşturulamadı.');}
    finally{setBusy(false);}
  }

  async function changeStatus(document:PetitionDocument,next:PetitionDocumentStatus){
    if(!canUpdate||busy)return;
    const messages:Record<PetitionDocumentStatus,string>={
      draft:'Bu belge taslak olarak işaretlensin mi?',
      in_review:'Belge inceleme sırasına alınsın mı?',
      approved:'Belge onaylandı olarak işaretlensin mi? Bu işlem elektronik imza değildir.',
      sent:'Belgenin kurum/ilgili tarafa gönderildiğini teyit ediyor musunuz? Sistem otomatik gönderim yapmaz.',
    };
    if(!window.confirm(messages[next]))return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('petitions/documents/'+document.id+'/status','PATCH',{
        status:next,version:document.version,note:'',
      });
      if(createdDocument?.id===document.id){
        const latest=await request('petitions/documents/'+document.id);
        setCreatedDocument(latest.document as PetitionDocument);
      }
      setNotice('Dilekçe durumu güncellendi.');
      setRefreshKey(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:'Dilekçe durumu güncellenemedi.');}
    finally{setBusy(false);}
  }

  const userFields=selectedTemplate?.fields.filter(field=>field.source==='user')??[];
  const canCreateSelected=canCreate&&Boolean(selectedProject&&selectedTemplate)&&!busy&&!loading&&
    userFields.filter(field=>field.required).every(field=>(fieldValues[field.key]??'').trim().length>0);

  return <section className="petitions-workspace" aria-label="Dilekçeler">
    <header className="petitions-intro">
      <div>
        <span className="petitions-kicker">WORD BELGE VE ONAY SÜRECİ</span>
        <h2>Dilekçeler</h2>
        <p>Onaylı Word şablonlarından proje bilgileriyle doldurulmuş dilekçeler oluşturun.</p>
      </div>
      <button type="button" className="petition-export-button" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading||busy}>Yenile</button>
    </header>

    {error&&<div className="petitions-alert" role="alert">{error}</div>}
    {notice&&<div className="petitions-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}

    {canManageTemplates&&<section className="petition-template-panel">
      <div className="petition-panel-heading">
        <div><h3>Şablon yönetimi</h3><p>Yetkili Word şablonlarını ortak PULSE veritabanında saklayın ve sürümleyin.</p></div>
        <span className="template-ready">Yönetim</span>
      </div>
      <form className="petition-template-upload" onSubmit={event=>void uploadTemplate(event)}>
        <label><span>Şablon adı</span><input value={templateName} onChange={event=>setTemplateName(event.target.value)} required minLength={2} maxLength={160} placeholder="Kurum görüş talep dilekçesi"/></label>
        <label><span>Açıklama</span><input value={templateDescription} onChange={event=>setTemplateDescription(event.target.value)} maxLength={1000} placeholder="Kullanım amacı ve kapsam"/></label>
        <label className="petition-upload-field"><span>Word dosyası (.docx)</span><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event=>setTemplateFile(event.target.files?.[0]??null)} disabled={busy}/></label>
        <button type="submit" className="petition-create-button" disabled={busy||!templateName.trim()||!templateFile}>{busy?'Kaydediliyor…':'Şablonu kaydet'}</button>
      </form>
      <p className="petition-storage-note">Şablonun içinde kullanılacak alanları Word metnine tek satırda yazın: <code>{'{{PROJECT_NAME}}'}</code>, <code>{'{{PETITION_SUBJECT}}'}</code>, <code>{'{{PETITION_BODY}}'}</code>. Tanınmayan alan veya eksik zorunlu bilgi varsa kayıt/üretim durdurulur.</p>
    </section>}

    <section className="petition-template-panel">
      <div className="petition-panel-heading">
        <div><h3>Etkin Word şablonları</h3><p>Her şablonun sürümü, alanları ve kayıt geçmişi korunur.</p></div>
        <span className={templates.length?'template-ready':'template-missing'}>{loading?'Yükleniyor…':templates.length+' şablon'}</span>
      </div>
      {loading?<div className="petition-empty-template">Şablonlar yükleniyor…</div>
      :templates.length===0?<div className="petition-empty-template">Henüz etkin Word şablonu yok. Şablon yöneticisi, kurumca onaylanmış DOCX dosyasını yükleyebilir.</div>
      :<div className="petition-template-list">
        {templates.map(template=><article className="petition-template-row" key={template.id}>
          <div className="petition-docx-icon">W</div>
          <div className="petition-template-main">
            <strong>{template.name}</strong>
            <small>{template.description||'Açıklama girilmedi'} · Sürüm {template.version} · {formatSize(template.byteSize)} · {dateTimeLabel(template.createdAt)}</small>
            <div className="petition-token-list">{template.fields.map(field=><span key={field.key} title={field.label}>{'{{'+field.key+'}}'}</span>)}</div>
          </div>
          <div className="petition-template-row-actions">
            <button type="button" className="petition-export-button" onClick={()=>void showHistory(template.id)} disabled={busy}>Sürümler ({template.versionCount})</button>
            {canManageTemplates&&<button type="button" className="petition-export-button" onClick={()=>setVersionTarget(current=>current===template.id?null:template.id)} disabled={busy}>Yeni sürüm</button>}
            {canManageTemplates&&<button type="button" className="petition-text-button" onClick={()=>void archiveTemplate(template)} disabled={busy}>Arşivle</button>}
          </div>
          {versionTarget===template.id&&canManageTemplates&&<div className="petition-version-upload">
            <label>Yeni DOCX sürümü <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={event=>setVersionFile(event.target.files?.[0]??null)} disabled={busy}/></label>
            <button type="button" className="petition-create-button" onClick={()=>void uploadVersion(template.id)} disabled={busy||!versionFile}>Sürümü kaydet</button>
          </div>}
          {historyTemplateId===template.id&&<div className="petition-version-history">
            {historyVersions.map(version=><div key={version.id}>
              <span>v{version.version} · {version.fileName} · {formatSize(version.byteSize)} · {dateLabel(version.createdAt)}</span>
              <a href={'/api/petitions/templates/'+template.id+'/versions/'+version.id+'/download'}>Şablonu indir</a>
            </div>)}
          </div>}
        </article>)}
      </div>}
    </section>

    <section className="petition-draft-panel">
      <div className="petition-panel-heading">
        <div><h3>Yeni dilekçe oluştur</h3><p>Proje ve şablon alanları belgeye işlenir. Çıktı önce taslak olarak kaydedilir.</p></div>
        <span className="petition-step-index">01 / 03</span>
      </div>
      {!canCreate?<div className="petition-empty-template">Dilekçe oluşturma yetkiniz bulunmuyor.</div>
      :<form className="petition-create-form" onSubmit={event=>void createDocument(event)}>
        <div className="petition-draft-form">
          <label><span>İlgili proje <b>*</b></span>
            <select value={selectedProjectId} onChange={event=>setSelectedProjectId(event.target.value)} disabled={!activeProjects.length||busy}>
              <option value="">Proje seçin</option>
              {activeProjects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label><span>Word şablonu <b>*</b></span>
            <select value={selectedTemplateVersionId} onChange={event=>setSelectedTemplateVersionId(event.target.value)} disabled={!templates.length||busy}>
              <option value="">Şablon seçin</option>
              {templates.map(template=><option key={template.versionId} value={template.versionId}>{template.name} · v{template.version}</option>)}
            </select>
          </label>
          <label><span>Belge başlığı</span><input value={documentTitle} onChange={event=>setDocumentTitle(event.target.value)} maxLength={180} placeholder="Dilekçe konusu"/></label>
          <label><span>Dosya adı</span><input value={documentFileName} onChange={event=>setDocumentFileName(event.target.value)} maxLength={180} placeholder={selectedProject?'Dilekce_'+safeBaseName(selectedProject.name):'Dilekce_Proje'}/></label>
        </div>
        {selectedTemplate&&userFields.length>0&&<div className="petition-fields-section">
          <div className="petition-fields-heading"><strong>Dilekçe bilgileri</strong><span>Şablondaki alanlar</span></div>
          <div className="petition-fields-grid">
            {userFields.map(field=><label className={field.multiline?'petition-field petition-field-wide':'petition-field'} key={field.key}>
              <span>{field.label}{field.required&&<b> *</b>}</span>
              {field.multiline
                ?<textarea value={fieldValues[field.key]??''} onChange={event=>setField(field.key,event.target.value)} maxLength={field.key==='PETITION_BODY'?30000:1000} rows={field.key==='PETITION_BODY'?8:3} required={field.required}/>
                :<input value={fieldValues[field.key]??''} onChange={event=>setField(field.key,event.target.value)} maxLength={1000} required={field.required}/>}
            </label>)}
          </div>
        </div>}
        {selectedTemplate&&<div className="petition-auto-fields">
          <strong>Otomatik doldurulan bilgiler</strong>
          <span>{selectedTemplate.fields.filter(field=>field.source!=='user').map(field=>field.label).join(' · ')||'Bu şablon otomatik alan içermiyor.'}</span>
        </div>}
        <div className="petition-form-submit">
          <span>Çıktı proje kaydına bağlanır ve taslak olarak saklanır. Elektronik imza veya otomatik gönderim yapılmaz.</span>
          <button type="submit" className="petition-create-button" disabled={!canCreateSelected}>{busy?'Belge hazırlanıyor…':'Word belgesini oluştur'}</button>
        </div>
      </form>}
    </section>

    {createdDocument&&<section className="petition-draft-panel petition-generated-panel">
      <div className="petition-panel-heading">
        <div><h3>{createdDocument.title}</h3><p>{createdDocument.projectName||selectedProject?.name} · {createdDocument.templateName||selectedTemplate?.name} · v{createdDocument.templateVersion||selectedTemplate?.version}</p></div>
        <span className="petition-status-badge petition-status-draft">Taslak kaydedildi</span>
      </div>
      <div className="petition-generated-meta">
        <span>{createdDocument.fileName}</span><span>{formatSize(createdDocument.byteSize)}</span>
        <a href={'/api/petitions/documents/'+createdDocument.id+'/download'}>Word belgesini indir</a>
      </div>
      {createdDocument.previewText&&<div className="petition-preview">
        <strong>Belge metin önizlemesi</strong>
        <pre>{createdDocument.previewText}</pre>
      </div>}
    </section>}

    <section className="petition-draft-panel">
      <div className="petition-panel-heading">
        <div><h3>Oluşturulan dilekçeler</h3><p>Belge, proje, şablon sürümü ve işlem durumu birlikte tutulur.</p></div>
        <span className="petition-step-index">{documents.length} kayıt</span>
      </div>
      {loading?<div className="petition-empty-template">Dilekçe kayıtları yükleniyor…</div>
      :documents.length===0?<div className="petition-empty-template">Erişiminiz olan projelerde henüz dilekçe oluşturulmamış.</div>
      :<div className="petition-document-list">
        {documents.map(document=><article className="petition-document-row" key={document.id}>
          <div className="petition-docx-icon">W</div>
          <div className="petition-document-main">
            <strong>{document.title}</strong>
            <small>{document.projectName} · {document.templateName} v{document.templateVersion} · {document.creatorName} · {dateTimeLabel(document.updatedAt)}</small>
            <span>{document.fileName} · {formatSize(document.byteSize)}</span>
          </div>
          <span className={'petition-status-badge '+statusTone(document.status)}>{statusLabels[document.status]}</span>
          <div className="petition-document-actions">
            <a href={'/api/petitions/documents/'+document.id+'/download'}>İndir</a>
            {canUpdate&&document.status==='draft'&&<button type="button" onClick={()=>void changeStatus(document,'in_review')} disabled={busy}>İncelemeye gönder</button>}
            {canUpdate&&canApprove&&document.status==='in_review'&&<>
              <button type="button" onClick={()=>void changeStatus(document,'draft')} disabled={busy}>Düzeltmeye iade et</button>
              <button type="button" onClick={()=>void changeStatus(document,'approved')} disabled={busy}>Onayla</button>
            </>}
            {canUpdate&&canApprove&&document.status==='approved'&&<button type="button" onClick={()=>void changeStatus(document,'sent')} disabled={busy}>Gönderildi olarak işaretle</button>}
          </div>
        </article>)}
      </div>}
    </section>

    <section className="petition-desktop-parity">
      <div><span className="petition-parity-label">BELGE GÜVENLİĞİ</span>
        <h3>Şablon ve çıktılar PULSE veritabanında saklanır</h3>
        <p>Bu akış şirket dosya sunucusuna veya NAS'a bağlanmaz. Word dosyası oluşturulurken şablon sürümü, SHA-256 özeti, proje bağlantısı ve işlem geçmişi korunur. “Gönderildi” durumu yetkili kullanıcının teyididir; sistem dış kuruma otomatik gönderim veya elektronik imza yapmaz. Fiziksel Word/SMB kilidi web sürümünde yoktur.</p>
      </div>
    </section>
  </section>;
}
