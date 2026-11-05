import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from './drawer';

type Project = { id:string; name:string; status:string };
type Task = {id:string;title:string;projectId:string|null;projectName:string|null};
type Note = {
  id:string; title:string; body:string; tags:string[]; projectId:string|null;
  projectName:string|null; taskId:string|null; taskTitle:string|null; version:number; archivedAt:string|null; createdAt:string; updatedAt:string;
};
type Draft = { title:string; body:string; tags:string; projectId:string; taskId:string };

export function NotesWorkspace({
  request, projects, canCreate, canUpdate, canDelete, canViewTasks,
}: {
  request:(path:string,method?:string,data?:unknown)=>Promise<Record<string,any>>;
  projects:Project[];
  canCreate:boolean;
  canUpdate:boolean;
  canDelete:boolean;
  canViewTasks:boolean;
}) {
  const [notes,setNotes]=useState<Note[]>([]);
  const [taskOptions,setTaskOptions]=useState<Task[]>([]);
  const [view,setView]=useState<'active'|'archived'>('active');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [drawerOpen,setDrawerOpen]=useState(false);
  const [editing,setEditing]=useState<Note|null>(null);
  const [draft,setDraft]=useState<Draft>({title:'',body:'',tags:'',projectId:'',taskId:''});
  const [formError,setFormError]=useState('');

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await request('notes?view='+view+'&q='+encodeURIComponent(query.trim()));
      setNotes(Array.isArray(result.notes)?result.notes as Note[]:[]);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Notlar alınamadı.');
    } finally {setLoading(false);}
  },[request,view,query]);

  useEffect(()=>{void load();},[load]);

  useEffect(()=>{
    let cancelled=false;
    if(!canViewTasks){setTaskOptions([]);return;}
    request('tasks?view=all&limit=100')
      .then(result=>{if(!cancelled)setTaskOptions(Array.isArray(result.tasks)?result.tasks as Task[]:[]);})
      .catch(()=>{if(!cancelled)setTaskOptions([]);});
    return ()=>{cancelled=true;};
  },[request,canViewTasks]);

  const visibleProjects=useMemo(()=>projects.filter(project=>project.status!=='archived'),[projects]);

  function openCreate() {
    if(!canCreate)return;
    setEditing(null);
    setDraft({title:'',body:'',tags:'',projectId:'',taskId:''});
    setFormError('');setError('');setNotice('');setDrawerOpen(true);
  }

  function openEdit(note:Note) {
    if(!canUpdate)return;
    setEditing(note);
    setDraft({title:note.title,body:note.body,tags:note.tags.join(', '),projectId:note.projectId??'',taskId:note.taskId??''});
    setFormError('');setError('');setNotice('');setDrawerOpen(true);
  }

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(saving||(!editing&&!canCreate)||(editing&&!canUpdate))return;
    const tags=draft.tags.split(',').map(tag=>tag.trim()).filter(Boolean);
    if(tags.length>12){setFormError('En fazla 12 etiket ekleyebilirsiniz.');return;}
    if(draft.title.trim().length<1){setFormError('Not başlığını girin.');return;}
    if(draft.title.trim().length>160){setFormError('Not başlığı 160 karakteri aşamaz.');return;}
    if(draft.body.length>20000){setFormError('Not metni 20.000 karakteri aşamaz.');return;}
    setSaving(true);setFormError('');
    try {
      const payload={title:draft.title.trim(),body:draft.body,tags,projectId:draft.projectId||null,taskId:draft.taskId||null,...(editing?{version:editing.version}:{})};
      await request(editing?'notes/'+editing.id:'notes',editing?'PATCH':'POST',payload);
      setDrawerOpen(false);
      setNotice(editing?'Not güncellendi.':'Not oluşturuldu.');
      await load();
    } catch(cause) {
      setFormError(cause instanceof Error?cause.message:'Not kaydedilemedi.');
    } finally {setSaving(false);}
  }

  async function archive(note:Note,restore=false) {
    if(saving||(!restore&&!canDelete)||(restore&&!canUpdate))return;
    const action=restore?'geri yüklemek':'arşivlemek';
    if(!window.confirm('“'+note.title+'” notunu '+action+' istiyor musunuz?'))return;
    setSaving(true);setError('');setNotice('');
    try {
      await request('notes/'+note.id+'/'+(restore?'restore':'archive'),'POST',{version:note.version});
      setNotice(restore?'Not geri yüklendi.':'Not arşivlendi.');
      await load();
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Not durumu değiştirilemedi.');
    } finally {setSaving(false);}
  }

  function dateLabel(value:string) {
    return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(value));
  }

  return <section className="notes-workspace" aria-label="Notlarım">
    <header className="notes-heading">
      <div><span className="notes-eyebrow">KİŞİSEL ALAN</span><h2>Notlarım</h2><p>Notlar yalnızca hesabınıza görünür. Projeyle ilişkilendirebilir, etiketleyebilir ve arşivleyebilirsiniz.</p></div>
      {canCreate&&view==='active'&&<button type="button" className="primary-button" onClick={openCreate}>Yeni not</button>}
    </header>
    {error&&<div className="notes-alert" role="alert">{error}</div>}
    {notice&&<div className="notes-notice" role="status"><span>{notice}</span><button type="button" onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}
    <div className="notes-toolbar">
      <label className="notes-search"><span aria-hidden="true">⌕</span><input aria-label="Notlarda ara" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Başlık, metin veya etikette ara…"/>{query&&<button type="button" onClick={()=>setQuery('')} aria-label="Aramayı temizle">×</button>}</label>
      <div className="notes-view-switch" role="group" aria-label="Not görünümü">
        <button type="button" aria-pressed={view==='active'} onClick={()=>setView('active')}>Notlarım</button>
        <button type="button" aria-pressed={view==='archived'} onClick={()=>setView('archived')}>Arşiv</button>
      </div>
    </div>
    {loading ? <div className="notes-empty" role="status">Notlar alınıyor…</div> :
      notes.length===0 ? <div className="notes-empty"><strong>{view==='active'?'Henüz not yok.':'Arşivlenmiş not yok.'}</strong><span>{query?'Arama ölçütünü değiştirin.':view==='active'?'Kişisel notunuzu oluşturup proje ve etiketlerle düzenleyebilirsiniz.':'Arşivlediğiniz notlar burada görünür.'}</span>{view==='active'&&canCreate&&!query&&<button type="button" className="secondary-button" onClick={openCreate}>İlk notu oluştur</button>}</div> :
      <div className="notes-grid">
        {notes.map(note=><article className="notes-card" key={note.id}>
          <div className="notes-card-top"><time>{dateLabel(note.updatedAt)}</time><span className="notes-private-label"><span aria-hidden="true">◉</span> Özel</span></div>
          <button type="button" className="notes-card-main" onClick={()=>openEdit(note)} disabled={!canUpdate} aria-label={note.title+' notunu aç'}>
            <strong>{note.title}</strong><p>{note.body.trim()?note.body:'Bu notta henüz metin yok.'}</p>
          </button>
          {note.tags.length>0&&<div className="notes-tags">{note.tags.map(tag=><span key={tag}>{tag}</span>)}</div>}
          <div className="notes-card-footer">
            <span>{[note.projectName?('Proje · '+note.projectName):'',note.taskTitle?('Görev · '+note.taskTitle):''].filter(Boolean).join(' · ')||'Bağlantı yok'}</span>
            {view==='active'&&canDelete?<button type="button" className="notes-card-action" onClick={()=>void archive(note)} disabled={saving}>Arşivle</button>:null}
            {view==='archived'&&canUpdate?<button type="button" className="notes-card-action" onClick={()=>void archive(note,true)} disabled={saving}>Geri yükle</button>:null}
          </div>
        </article>)}
      </div>}
    <Drawer isOpen={drawerOpen} onClose={()=>setDrawerOpen(false)} size="lg" title={editing?'Notu düzenle':'Yeni not'} subtitle="Bu not yalnızca sizin hesabınızda görünür." ariaLabelledBy="notes-editor-title"
      footer={<><button type="button" className="secondary-button" onClick={()=>setDrawerOpen(false)} disabled={saving}>Vazgeç</button><button type="submit" form="notes-editor-form" className="primary-button" disabled={Boolean(saving||(!editing&&!canCreate)||(editing&&!canUpdate))}>{saving?'Kaydediliyor…':'Kaydet'}</button></>}>
      <form id="notes-editor-form" className="notes-editor" onSubmit={save}>
        <label><span>Başlık</span><input value={draft.title} onChange={event=>setDraft(current=>({...current,title:event.target.value}))} maxLength={160} required autoFocus placeholder="Not başlığını yazın…"/></label>
        <label><span>Not</span><textarea value={draft.body} onChange={event=>setDraft(current=>({...current,body:event.target.value}))} rows={12} maxLength={20000} placeholder="Notunuzu yazın…"/></label>
        <label><span>Etiketler</span><input value={draft.tags} onChange={event=>setDraft(current=>({...current,tags:event.target.value}))} placeholder="Örn. saha, toplantı, takip (virgülle ayırın)"/><small>En fazla 12 etiket, her biri en fazla 32 karakter.</small></label>
        <label><span>İlgili proje</span><select value={draft.projectId} onChange={event=>setDraft(current=>({...current,projectId:event.target.value}))}><option value="">Proje seçmeden kaydet</option>{visibleProjects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select><small>Yalnızca erişim yetkiniz olan projeler listelenir.</small></label>
        {canViewTasks&&<label><span>İlgili görev</span><select value={draft.taskId} onChange={event=>{
          const task=taskOptions.find(item=>item.id===event.target.value);
          setDraft(current=>({...current,taskId:event.target.value,projectId:task?.projectId??''}));
        }}><option value="">Göreve bağlamadan kaydet</option>{taskOptions.map(task=><option key={task.id} value={task.id}>{task.title}{task.projectName?' · '+task.projectName:''}</option>)}</select><small>Yalnızca erişim yetkiniz olan görevler listelenir; görev seçimi proje bağlantısını otomatik günceller.</small></label>}
        {formError&&<p className="auth-error" role="alert">{formError}</p>}
      </form>
    </Drawer>
  </section>;
}
