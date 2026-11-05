import { useCallback, useEffect, useMemo, useState } from 'react';

type Contact = {
  id:string;
  institutionName:string;
  contactPerson:string;
  title:string;
  department:string;
  phone:string;
  email:string;
  address:string;
  projectCount:number;
  updatedAt:string;
};

export function InstitutionGuideWorkspace({
  request,onOpenOpinions,canOpenOpinions,
}:{
  request:(path:string,method?:string,data?:unknown)=>Promise<Record<string,any>>;
  onOpenOpinions:()=>void;
  canOpenOpinions:boolean;
}) {
  const [contacts,setContacts]=useState<Contact[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [refreshKey,setRefreshKey]=useState(0);

  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try {
      const result=await request('ced/contacts');
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
      contact.institutionName,contact.contactPerson,contact.title,contact.department,
      contact.phone,contact.email,contact.address,
    ].join(' ').toLocaleLowerCase('tr-TR').includes(needle));
  },[contacts,query]);

  function updatedLabel(value:string) {
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return 'Tarih bilinmiyor';
    return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeZone:'Europe/Istanbul'}).format(date);
  }

  return <section className="institution-guide-workspace" aria-label="Kurum rehberi">
    <header className="institution-guide-heading">
      <div>
        <span className="institution-guide-eyebrow">KURUMSAL İLETİŞİM</span>
        <h2>Kurum Rehberi</h2>
        <p>Görüntüleme yetkiniz olan projelerdeki kurum yazışmalarından oluşan ortak iletişim kayıtları.</p>
      </div>
      <div className="institution-guide-actions">
        <button type="button" className="secondary-button" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading}>↻ Yenile</button>
        {canOpenOpinions&&<button type="button" className="primary-button" onClick={onOpenOpinions}>Kurum Görüşleri</button>}
      </div>
    </header>
    <div className="institution-guide-summary">
      <strong>{contacts.length}</strong>
      <span>erişilebilir kurum kaydı</span>
      <span className="institution-guide-scope">Proje yetkisiyle sınırlandırılmıştır</span>
    </div>
    <label className="institution-guide-search">
      <span aria-hidden="true">⌕</span>
      <input aria-label="Kurum rehberinde ara" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Kurum, yetkili, birim, telefon veya e-posta ara…"/>
      {query&&<button type="button" aria-label="Aramayı temizle" onClick={()=>setQuery('')}>×</button>}
    </label>
    {error&&<div className="institution-guide-error" role="alert"><span>{error}</span><button type="button" onClick={()=>setRefreshKey(value=>value+1)}>Tekrar dene</button></div>}
    {loading?<div className="institution-guide-empty" role="status">Kurum kayıtları alınıyor…</div>
    :filtered.length===0?<div className="institution-guide-empty">
      <strong>{contacts.length?'Aramayla eşleşen kurum bulunamadı':'Henüz erişilebilir kurum rehberi kaydı yok'}</strong>
      <span>{contacts.length?'Arama ölçütünü değiştirin.':'Kurum iletişim bilgileri, erişiminiz olan projelerde Kurum Görüşü kaydı oluşturulurken kaydedilir.'}</span>
      {canOpenOpinions&&<button type="button" className="secondary-button" onClick={onOpenOpinions}>Kurum Görüşleri bölümüne git</button>}
    </div>
    :<div className="institution-guide-grid">
      {filtered.map(contact=><article className="institution-guide-card" key={contact.id}>
        <div className="institution-guide-card-top">
          <span className="institution-guide-icon" aria-hidden="true">⌂</span>
          <span>{contact.projectCount} proje</span>
        </div>
        <h3>{contact.institutionName}</h3>
        {contact.contactPerson||contact.title||contact.department?
          <div className="institution-guide-person">
            {contact.contactPerson&&<strong>{contact.contactPerson}</strong>}
            {contact.title&&<span>{contact.title}</span>}
            {contact.department&&<small>{contact.department}</small>}
          </div>:<p className="institution-guide-no-person">Yetkili kişi bilgisi henüz girilmemiş.</p>}
        <div className="institution-guide-contact-lines">
          {contact.phone&&<a href={'tel:'+contact.phone}>{contact.phone}</a>}
          {contact.email&&<a href={'mailto:'+contact.email}>{contact.email}</a>}
          {contact.address&&<p>{contact.address}</p>}
        </div>
        <footer>Son güncelleme · {updatedLabel(contact.updatedAt)}</footer>
      </article>)}
    </div>}
    <p className="institution-guide-note">İletişim kayıtlarının kaynağı kurum görüşleridir. Rehberde yalnızca proje erişim kapsamınızdaki kayıtlar listelenir.</p>
  </section>;
}
