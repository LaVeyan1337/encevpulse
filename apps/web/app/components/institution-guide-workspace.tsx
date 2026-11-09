import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';

type Contact = {
  id:string;
  institutionName:string;
  institutionType:string;
  website:string;
  contactPerson:string;
  title:string;
  department:string;
  phone:string;
  email:string;
  address:string;
  sourceLabel:string;
  sourceReference:string;
  verifiedAt:string|null;
  directoryVisible:boolean;
  verifiedByName?:string|null;
  projectCount:number;
  version:number;
  createdAt:string;
  updatedAt:string;
};

type FormState = {
  institutionName:string;
  institutionType:string;
  website:string;
  contactPerson:string;
  title:string;
  department:string;
  phone:string;
  email:string;
  address:string;
  sourceLabel:string;
  sourceReference:string;
  verifiedAt:string;
};

const EMPTY_FORM:FormState={
  institutionName:'',institutionType:'',website:'',contactPerson:'',title:'',
  department:'',phone:'',email:'',address:'',sourceLabel:'',sourceReference:'',verifiedAt:'',
};

export function InstitutionGuideWorkspace({
  request,onOpenOpinions,canOpenOpinions,canCreate,canUpdate,canDelete,
}:{
  request:(path:string,method?:string,data?:unknown)=>Promise<Record<string,any>>;
  onOpenOpinions:()=>void;
  canOpenOpinions:boolean;
  canCreate:boolean;
  canUpdate:boolean;
  canDelete:boolean;
}) {
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);
  const [editorOpen,setEditorOpen]=useState(false);
  const [editing,setEditing]=useState<Contact|null>(null);
  const [form,setForm]=useState<FormState>(EMPTY_FORM);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await request('ced/directory');
      setContacts(Array.isArray(result.contacts)?result.contacts as Contact[]:[]);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Kurum rehberi yüklenemedi.');
    } finally {setLoading(false);}
  },[request]);

  useEffect(()=>{void load();},[load,refreshKey]);

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('tr-TR');
    if(!needle)return contacts;
    return contacts.filter(contact=>[
      contact.institutionName,contact.institutionType,contact.contactPerson,contact.title,
      contact.department,contact.phone,contact.email,contact.address,contact.sourceLabel,
      contact.sourceReference,
    ].join(' ').toLocaleLowerCase('tr-TR').includes(needle));
  },[contacts,query]);

  function updatedLabel(value:string) {
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return 'Tarih bilinmiyor';
    return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeZone:'Europe/Istanbul'}).format(date);
  }

  function beginCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setEditorOpen(true);
  }

  function beginEdit(contact:Contact) {
    setEditing(contact);
    setForm({
      institutionName:contact.institutionName,
      institutionType:contact.institutionType??'',
      website:contact.website??'',
      contactPerson:contact.contactPerson??'',
      title:contact.title??'',
      department:contact.department??'',
      phone:contact.phone??'',
      email:contact.email??'',
      address:contact.address??'',
      sourceLabel:contact.sourceLabel??'',
      sourceReference:contact.sourceReference??'',
      verifiedAt:contact.verifiedAt??'',
    });
    setError('');
    setEditorOpen(true);
  }

  function closeEditor() {
    if(saving)return;
    setEditorOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  }

  function setField<K extends keyof FormState>(key:K,value:FormState[K]) {
    setForm(current=>({...current,[key]:value}));
  }

  async function save(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(saving)return;
    setSaving(true);setError('');
    try {
      const payload={...form,verifiedAt:form.verifiedAt||null};
      await request(
        editing?('ced/directory/'+editing.id):'ced/directory',
        editing?'PATCH':'POST',
        editing?{...payload,expectedVersion:editing.version}:payload,
      );
      setEditorOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setRefreshKey(value=>value+1);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Kurum kaydı kaydedilemedi.');
    } finally {setSaving(false);}
  }

  async function archive(contact:Contact) {
    if(!canDelete||saving)return;
    if(!window.confirm(`“${contact.institutionName}” kurum rehberi kaydı arşivlensin mi? Bağlı Kurum Görüşü kayıtları korunur.`))return;
    setSaving(true);setError('');
    try {
      await request('ced/directory/'+contact.id,'DELETE');
      if(editing?.id===contact.id)closeEditor();
      setRefreshKey(value=>value+1);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Kurum kaydı arşivlenemedi.');
    } finally {setSaving(false);}
  }

  return <section className="institution-guide-workspace" aria-label="Kurum rehberi">
    <header className="institution-guide-heading">
      <div>
        <span className="institution-guide-eyebrow">DIŞ KURUM KAYITLARI</span>
        <h2>Kurum Rehberi</h2>
        <p>Kurum profilleri, iletişim kişileri ve kayıt kaynakları.</p>
      </div>
      <div className="institution-guide-actions">
        <button type="button" className="secondary-button" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading||saving}>Yenile</button>
        {canOpenOpinions&&<button type="button" className="secondary-button" onClick={onOpenOpinions}>Kurum Görüşleri</button>}
        {canCreate&&<button type="button" className="primary-button" onClick={beginCreate}>Kurum ekle</button>}
      </div>
    </header>

    <div className="institution-guide-summary">
      <strong>{contacts.length}</strong>
      <span>kurum ve ilgili kişi</span>
      {contacts.some(contact=>!contact.directoryVisible)&&
        <span className="institution-guide-review-count">{contacts.filter(contact=>!contact.directoryVisible).length} teyit bekliyor</span>}
      <span className="institution-guide-scope">Kaynağı kayıt üzerinde izlenir</span>
    </div>

    {editorOpen&&<form className="institution-guide-editor" onSubmit={event=>void save(event)}>
      <div className="institution-guide-editor-heading">
        <div>
          <span className="institution-guide-eyebrow">{editing?'KAYIT DÜZENLEME':'YENİ REHBER KAYDI'}</span>
          <h3>{editing?'Kurum kaydını düzenle':'Kurum ve iletişim bilgileri'}</h3>
        </div>
        <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>Vazgeç</button>
      </div>
      <div className="institution-guide-form-grid">
        <label className="institution-guide-field institution-guide-field-wide">
          <span>Kurum adı <b>*</b></span>
          <input value={form.institutionName} onChange={event=>setField('institutionName',event.target.value)} required minLength={2} maxLength={180} autoComplete="organization"/>
        </label>
        <label className="institution-guide-field">
          <span>Kurum türü</span>
          <input value={form.institutionType} onChange={event=>setField('institutionType',event.target.value)} maxLength={120} placeholder="Bakanlık, il müdürlüğü, belediye…"/>
        </label>
        <label className="institution-guide-field">
          <span>Web sitesi</span>
          <input type="url" value={form.website} onChange={event=>setField('website',event.target.value)} maxLength={300} placeholder="https://"/>
        </label>
        <label className="institution-guide-field">
          <span>İletişim kişisi</span>
          <input value={form.contactPerson} onChange={event=>setField('contactPerson',event.target.value)} maxLength={160}/>
        </label>
        <label className="institution-guide-field">
          <span>Unvan</span>
          <input value={form.title} onChange={event=>setField('title',event.target.value)} maxLength={120}/>
        </label>
        <label className="institution-guide-field">
          <span>Birim</span>
          <input value={form.department} onChange={event=>setField('department',event.target.value)} maxLength={120}/>
        </label>
        <label className="institution-guide-field">
          <span>Telefon</span>
          <input type="tel" value={form.phone} onChange={event=>setField('phone',event.target.value)} maxLength={60}/>
        </label>
        <label className="institution-guide-field">
          <span>E-posta</span>
          <input type="email" value={form.email} onChange={event=>setField('email',event.target.value)} maxLength={254}/>
        </label>
        <label className="institution-guide-field institution-guide-field-wide">
          <span>Adres</span>
          <textarea value={form.address} onChange={event=>setField('address',event.target.value)} maxLength={400} rows={2}/>
        </label>
        <label className="institution-guide-field">
          <span>Kayıt kaynağı <b>*</b></span>
          <input value={form.sourceLabel} onChange={event=>setField('sourceLabel',event.target.value)} required minLength={2} maxLength={180} placeholder="Resmî site, telefon teyidi, resmî yazı…"/>
        </label>
        <label className="institution-guide-field">
          <span>Kaynak referansı</span>
          <input value={form.sourceReference} onChange={event=>setField('sourceReference',event.target.value)} maxLength={500} placeholder="URL veya yazı / belge referansı"/>
        </label>
        <label className="institution-guide-field">
          <span>Kaynak teyit tarihi</span>
          <input type="date" value={form.verifiedAt} onChange={event=>setField('verifiedAt',event.target.value)}/>
        </label>
      </div>
      <p className="institution-guide-provenance">Kaynak ve teyit bilgileri kaydı giren kullanıcı tarafından sağlanır. Sistem dış kurum verisini otomatik doğrulamaz.</p>
      {error&&<div className="institution-guide-error" role="alert">{error}</div>}
      <div className="institution-guide-form-actions">
        <button type="button" className="secondary-button" onClick={closeEditor} disabled={saving}>İptal</button>
        <button type="submit" className="primary-button" disabled={saving}>{saving?'Kaydediliyor…':editing?'Değişiklikleri kaydet':'Kurum kaydını oluştur'}</button>
      </div>
    </form>}

    <label className="institution-guide-search">
      <span aria-hidden="true">⌕</span>
      <input aria-label="Kurum rehberinde ara" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Kurum, yetkili, birim, telefon veya e-posta ara…"/>
      {query&&<button type="button" aria-label="Aramayı temizle" onClick={()=>setQuery('')}>×</button>}
    </label>

    {error&&!editorOpen&&<div className="institution-guide-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>Tekrar dene</button></div>}
    {loading?<div className="institution-guide-empty" role="status">Kurum kayıtları alınıyor…</div>
    :filtered.length===0?<div className="institution-guide-empty">
      <strong>{contacts.length?'Aramayla eşleşen kurum bulunamadı':'Henüz kurum rehberi kaydı yok'}</strong>
      <span>{contacts.length?'Arama ölçütünü değiştirin.':'Yetkili kullanıcılar kurum ve kaynak bilgilerini buraya kaydedebilir.'}</span>
      {canCreate&&<button type="button" className="primary-button" onClick={beginCreate}>İlk kurum kaydını oluştur</button>}
      {canOpenOpinions&&<button type="button" className="secondary-button" onClick={onOpenOpinions}>Kurum Görüşleri</button>}
    </div>
    :<div className="institution-guide-grid">
      {filtered.map(contact=><article className="institution-guide-card" key={contact.id}>
        <div className="institution-guide-card-top">
          <span className="institution-guide-icon" aria-hidden="true">⌂</span>
          <span>{contact.institutionType||'Kurum'}</span>
          {!contact.directoryVisible&&<span className="institution-guide-review-state">Teyit bekliyor</span>}
        </div>
        <h3>{contact.institutionName}</h3>
        {contact.contactPerson||contact.title||contact.department?
          <div className="institution-guide-person">
            {contact.contactPerson&&<strong>{contact.contactPerson}</strong>}
            {contact.title&&<span>{contact.title}</span>}
            {contact.department&&<small>{contact.department}</small>}
          </div>:<p className="institution-guide-no-person">İletişim kişisi belirtilmemiş.</p>}
        <div className="institution-guide-contact-lines">
          {contact.phone&&<a href={'tel:'+contact.phone}>{contact.phone}</a>}
          {contact.email&&<a href={'mailto:'+contact.email}>{contact.email}</a>}
          {contact.website&&<a href={contact.website} target="_blank" rel="noreferrer">Kurumun web sitesi</a>}
          {contact.address&&<p>{contact.address}</p>}
        </div>
        <div className="institution-guide-source">
          <span>Kaynak</span>
          <strong>{contact.directoryVisible?(contact.sourceLabel||'Kaynak belirtilmedi'):'Proje kurum görüşü kaydından'}</strong>
          {contact.sourceReference&&<small>{contact.sourceReference}</small>}
          {!contact.directoryVisible&&<small>İletişim bilgisi proje yazışmasında girildi. Ortak rehbere aktarırken kaynağı belirtin.</small>}
          <small>{contact.verifiedAt?'Teyit tarihi: '+updatedLabel(contact.verifiedAt):'Teyit tarihi girilmedi'}</small>
        </div>
        <footer>
          <span>Güncelleme · {updatedLabel(contact.updatedAt)}</span>
          {contact.projectCount>0&&canOpenOpinions&&<button type="button" onClick={onOpenOpinions}>{contact.projectCount} proje ilişkisi</button>}
        </footer>
        {(canUpdate||(canDelete&&contact.directoryVisible))&&<div className="institution-guide-card-actions">
          {canUpdate&&<button type="button" className="secondary-button" onClick={()=>beginEdit(contact)}>{contact.directoryVisible?'Düzenle':'Kaynağı teyit et ve rehbere aktar'}</button>}
          {canDelete&&contact.directoryVisible&&<button type="button" className="secondary-button danger" onClick={()=>void archive(contact)} disabled={saving}>Arşivle</button>}
        </div>}
      </article>)}
    </div>}
    <p className="institution-guide-note">Kurum Görüşleri formundan gelen iletişim bilgileri burada teyit bekleyen kayıt olarak görünür. Yetkili kullanıcı kaynak bilgisini ekleyip kaydettiğinde ortak rehbere aktarılır. Kaynak ve teyit tarihi girilmemiş kayıtlar doğrulanmış resmî iletişim bilgisi sayılmaz.</p>
  </section>;
}
