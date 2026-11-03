import { useMemo, useState, type CSSProperties } from 'react';
import { EmployeeAvatar } from './avatars';

export interface DirectoryPerson {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  avatarKey?: string;
  roles?: string[];
}

const roleLabels: Record<string,string> = {
  employee:'Çalışan',
  team_lead:'Ekip sorumlusu',
  project_manager:'Proje yöneticisi',
  process_owner:'Süreç sahibi',
  document_steward:'Belge sorumlusu',
  auditor:'Denetçi',
  system_admin:'Sistem yöneticisi',
};

export function PeopleDirectory({
  people,
  loading = false,
  onMessage,
}: {
  people: DirectoryPerson[];
  loading?: boolean;
  onMessage: (person: DirectoryPerson) => void;
}) {
  const [query,setQuery]=useState('');
  const [department,setDepartment]=useState('all');
  const departments=useMemo(
    ()=>[...new Set(people.map((person)=>person.department?.trim()).filter((value):value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,'tr')),
    [people],
  );
  const filtered=useMemo(()=>{
    const normalized=query.trim().toLocaleLowerCase('tr-TR');
    return people.filter((person)=>{
      const matchesDepartment=department==='all'||person.department===department;
      const haystack=[person.displayName,person.username,person.email,person.jobTitle,person.department].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
      return matchesDepartment&&(!normalized||haystack.includes(normalized));
    });
  },[people,query,department]);

  return (
    <section className="people-directory" aria-label="Çalışan rehberi">
      <header className="people-directory-header">
        <div>
          <p className="eyebrow">EKİP VE KİŞİLER</p>
          <h2>Çalışan rehberi</h2>
          <p>Şirket içindeki çalışanları birim ve görevlerine göre bulun.</p>
        </div>
        <div className="people-count">
          <strong>{filtered.length}</strong>
          <span>{filtered.length===1?'kişi':'kişi'}</span>
        </div>
      </header>
      <div className="people-toolbar">
        <label className="people-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="İsim, meslek veya birimde ara…" aria-label="Çalışan ara" />
        </label>
        <select value={department} onChange={(event)=>setDepartment(event.target.value)} aria-label="Birim filtresi">
          <option value="all">Tüm birimler</option>
          {departments.map((item)=><option key={item} value={item}>{item}</option>)}
        </select>
      </div>
      {loading ? (
        <div className="people-grid people-grid-skeleton" role="status" aria-busy="true" aria-label="Çalışanlar yükleniyor">
          {Array.from({length:6},(_,index)=><div className="people-card people-skeleton-card" key={index}><span/><i/><i/><i/></div>)}
        </div>
      ) : filtered.length===0 ? (
        <div className="people-empty">
          <span className="people-empty-symbol">⌕</span>
          <strong>{people.length===0?'Henüz çalışan kaydı bulunmuyor.':'Aramanızla eşleşen çalışan bulunamadı.'}</strong>
          <p>{people.length===0?'Sistem yöneticisi çalışan hesabı oluşturduğunda burada görünecek.':'Arama metnini veya birim filtresini değiştirebilirsiniz.'}</p>
        </div>
      ) : (
        <div className="people-grid">
          {filtered.map((person,index)=>(
            <article className="people-card" key={person.id} style={{'--people-index':index} as CSSProperties}>
              <div className="people-card-head">
                <EmployeeAvatar avatarKey={person.avatarKey} name={person.displayName} size="xl"/>
                <div className="people-card-identity">
                  <h3>{person.displayName}</h3>
                  <span>@{person.username}</span>
                </div>
                <span className="people-presence-dot" title="Etkin hesap"/>
              </div>
              <div className="people-card-role">
                <strong>{person.jobTitle||'Görev/unvan belirtilmedi'}</strong>
                <span>{person.department||'Birim belirtilmedi'}</span>
              </div>
              <div className="people-card-tags">
                {(person.roles??[]).filter((role)=>role!=='employee').map((role)=>
                  <span className="people-role-chip" key={role}>{roleLabels[role]??role}</span>
                )}
                {(!person.roles||person.roles.length===0||person.roles.every((role)=>role==='employee'))&&<span className="people-role-chip people-role-regular">Çalışan</span>}
              </div>
              <div className="people-card-footer">
                <span title={person.email||''}>{person.email||'E-posta yok'}</span>
                <button type="button" onClick={()=>onMessage(person)}>
                  <span aria-hidden="true">↗</span> Sohbet
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
