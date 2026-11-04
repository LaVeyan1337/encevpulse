import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from './drawer';

type Request = (path: string, method?: string, data?: unknown) => Promise<Record<string, any>>;
type Status = 'draft' | 'requested' | 'waiting' | 'responded' | 'revision_requested' | 'closed' | 'positive' | 'negative' | 'revision' | 'other_request';
type ProjectOption={id:string;name:string;status:string};
type Draft={institutionName:string;subject:string;status:Status;requestDate:string;deadlineDate:string;responseDate:string;outgoingLetterNo:string;incomingLetterNo:string;contactPerson:string;notes:string};
const emptyDraft=():Draft=>({institutionName:'',subject:'',status:'waiting',requestDate:'',deadlineDate:'',responseDate:'',outgoingLetterNo:'',incomingLetterNo:'',contactPerson:'',notes:''});
type Row = {
  id: string; caseId: string; projectId: string; projectName: string; fileNumber: string;
  ecedReference: string; projectOwnerName: string | null; institutionName: string; subject: string;
  status: Status; requestDate: string | null; deadlineDate: string | null; responseDate: string | null;
  outgoingLetterNo: string; incomingLetterNo: string; contactPerson: string; notes: string;
  version: number; updatedAt: string;
};
const labels: Record<Status,string> = {
  waiting:'Görüş bekleniyor',positive:'Olumlu',negative:'Olumsuz',revision:'Revize',other_request:'Farklı talep var',
  draft:'Taslak (eski kayıt)',requested:'Gönderildi (eski kayıt)',responded:'Yanıt geldi (eski kayıt)',revision_requested:'Revize (eski kayıt)',closed:'Kapandı',
};
const statusOptions:Array<{value:Status;label:string}>=[
  {value:'waiting',label:'Görüş bekleniyor'},{value:'positive',label:'Olumlu'},
  {value:'negative',label:'Olumsuz'},{value:'revision',label:'Revize'},
  {value:'other_request',label:'Farklı talep var'},
];
const terminal = new Set<Status>(['responded','closed','positive','negative']);
function dateText(value:string|null):string {
  if(!value)return '—';
  return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})
    .format(new Date(value.slice(0,10)+'T12:00:00Z'));
}
function remaining(value:string|null):number|null {
  if(!value)return null;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return Math.round((Date.parse(value.slice(0,10)+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
}
function due(row:Row):{label:string;tone:string}{
  if(terminal.has(row.status))return {label:row.status==='positive'?'Olumlu':row.status==='negative'?'Olumsuz':row.status==='responded'?'Yanıtlandı':'Kapandı',tone:'done'};
  const days=remaining(row.deadlineDate);
  if(days===null)return {label:'Tarih girilmedi',tone:'neutral'};
  if(days<0)return {label:Math.abs(days)+' gün gecikti',tone:'late'};
  if(days===0)return {label:'Bugün son gün',tone:'today'};
  return {label:days+' gün kaldı',tone:days<=7?'soon':'normal'};
}
export function InstitutionOpinionsWorkspace({request,canOpenProject,onOpenProject,projects=[],projectId,canCreate=false,canUpdate=false}:{request:Request;canOpenProject:boolean;onOpenProject:(id:string)=>void;projects?:ProjectOption[];projectId?:string;canCreate?:boolean;canUpdate?:boolean}){
  const [rows,setRows]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState<'all'|Status>('all');
  const [editorOpen,setEditorOpen]=useState(false);
  const [editing,setEditing]=useState<Row|null>(null);
  const [draft,setDraft]=useState<Draft>(()=>emptyDraft());
  const [selectedProjectId,setSelectedProjectId]=useState(projectId??'');
  const [saving,setSaving]=useState(false);
  const [formError,setFormError]=useState('');
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{const result=await request('ced/opinions');setRows(Array.isArray(result.opinions)?result.opinions as Row[]:[]);}
    catch(cause){setError(cause instanceof Error?cause.message:'Kurum görüşleri yüklenemedi.');}
    finally{setLoading(false);}
  },[request]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(projectId)setSelectedProjectId(projectId);},[projectId]);
  const visibleRows=useMemo(()=>projectId?rows.filter(row=>row.projectId===projectId):rows,[rows,projectId]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase('tr-TR');
    return visibleRows.filter(row=>{
      if(filter!=='all'&&row.status!==filter)return false;
      if(!needle)return true;
      return [row.projectName,row.fileNumber,row.ecedReference,row.institutionName,row.subject,row.outgoingLetterNo,row.incomingLetterNo,row.projectOwnerName??'']
        .join(' ').toLocaleLowerCase('tr-TR').includes(needle);
    });
  },[visibleRows,query,filter]);
  const openCount=visibleRows.filter(row=>!terminal.has(row.status)).length;
  const lateCount=visibleRows.filter(row=>!terminal.has(row.status)&&(remaining(row.deadlineDate)??0)<0&&row.deadlineDate).length;
  const answered=visibleRows.filter(row=>['responded','positive','negative'].includes(row.status)).length;

  function openCreate(){
    const firstProject=projectId??projects.find(item=>item.status!=='archived')?.id??'';
    setEditing(null);setDraft(emptyDraft());setSelectedProjectId(firstProject);setFormError('');setEditorOpen(true);
  }
  function openEdit(row:Row){
    setEditing(row);setSelectedProjectId(row.projectId);setFormError('');
    setDraft({institutionName:row.institutionName,subject:row.subject,status:row.status,requestDate:row.requestDate??'',deadlineDate:row.deadlineDate??'',responseDate:row.responseDate??'',outgoingLetterNo:row.outgoingLetterNo??'',incomingLetterNo:row.incomingLetterNo??'',contactPerson:row.contactPerson??'',notes:row.notes??''});
    setEditorOpen(true);
  }
  async function saveOpinion(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canCreate&&!editing)return;
    if(editing&&!canUpdate)return;
    const targetProject=projectId??selectedProjectId;
    if(!targetProject){setFormError('Önce bir proje seçin.');return;}
    if(draft.institutionName.trim().length<2||draft.subject.trim().length<2){setFormError('Kurum adı ve görüş konusu en az 2 karakter olmalıdır.');return;}
    setSaving(true);setFormError('');
    const payload={...draft,institutionName:draft.institutionName.trim(),subject:draft.subject.trim(),requestDate:draft.requestDate||null,deadlineDate:draft.deadlineDate||null,responseDate:draft.responseDate||null};
    try{
      if(editing)await request('ced/opinions/'+editing.id,'PATCH',{...payload,version:editing.version});
      else await request('ced/projects/'+targetProject+'/opinions','POST',payload);
      setEditorOpen(false);setEditing(null);await load();
    }catch(cause){setFormError(cause instanceof Error?cause.message:'Kurum görüşü kaydedilemedi.');}
    finally{setSaving(false);}
  }

  return <section className="institution-opinions-workspace" aria-label="Kurum görüşleri">
    <header className="opinions-page-intro">
      <div><span className="opinions-eyebrow">PROJE YAZIŞMALARI</span><h2>Kurum Görüşleri</h2>
        <p>Görüş taleplerini, gelen yanıtları ve proje bazındaki son tarihleri takip edin.</p></div>
      <button type="button" className="opinions-refresh-button" onClick={()=>void load()} disabled={loading}>↻ <span>{loading?'Yükleniyor…':'Yenile'}</span></button>
    </header>
    <div className="opinions-metrics" aria-label="Kurum görüşü özeti">
      <article><span>Açık kayıt</span><strong>{openCount}</strong></article>
      <article className={lateCount?'is-overdue':''}><span>Süresi geçen</span><strong>{lateCount}</strong></article>
      <article><span>Yanıtlanan</span><strong>{answered}</strong></article>
    </div>
    {error&&<div className="opinions-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void load()}>Tekrar dene</button></div>}
    <div className="opinions-toolbar">
      <label className="opinions-search"><span aria-hidden="true">⌕</span>
        <input aria-label="Kurum görüşlerinde ara" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Proje, kurum, konu veya yazı numarası ara"/>
      </label>
      <label className="opinions-status-filter"><span>Durum</span>
        <select value={filter} onChange={event=>setFilter(event.target.value as 'all'|Status)}>
          <option value="all">Tüm durumlar</option>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <span className="opinions-result-count">{filtered.length} kayıt</span>
    </div>
    {loading&&rows.length===0?<div className="opinions-empty">Kurum görüşleri yükleniyor…</div>
    :filtered.length===0?<div className="opinions-empty"><strong>{rows.length===0?'Henüz kurum görüşü kaydı yok':'Aramayla eşleşen kayıt bulunamadı'}</strong>
      <span>{rows.length===0?'Kurum görüşleri, ilgili projenin ÇED Süreci bölümünden eklenir.':'Arama metnini veya durum filtresini değiştirin.'}</span></div>
    :<div className="opinions-table-wrap"><table className="opinions-table"><thead><tr>
      <th>Proje / Dosya</th><th>Kurum ve görüş konusu</th><th>Durum</th><th>Talep tarihi</th><th>Son tarih</th><th>Süre</th><th>Yanıt tarihi</th><th aria-label="İşlem"/>
    </tr></thead><tbody>{filtered.map(row=>{
      const deadline=due(row);
      return <tr key={row.id}>
        <td className="opinions-project-cell"><strong>{row.projectName}</strong><span>{row.fileNumber||'Dosya numarası yok'}</span>{row.ecedReference&&<small>e-ÇED: {row.ecedReference}</small>}</td>
        <td className="opinions-institution-cell"><strong>{row.institutionName}</strong><span>{row.subject}</span>
          {(row.outgoingLetterNo||row.incomingLetterNo)&&<small>{row.outgoingLetterNo?'Giden: '+row.outgoingLetterNo:''}{row.outgoingLetterNo&&row.incomingLetterNo?' · ':''}{row.incomingLetterNo?'Gelen: '+row.incomingLetterNo:''}</small>}
        </td>
        <td><span className={'opinions-status status-'+row.status}>{labels[row.status]??row.status}</span></td>
        <td>{dateText(row.requestDate)}</td><td>{dateText(row.deadlineDate)}</td>
        <td><span className={'opinions-deadline deadline-'+deadline.tone}>{deadline.label}</span></td><td>{dateText(row.responseDate)}</td>
        <td>{canOpenProject?<button type="button" className="opinions-open-button" onClick={()=>onOpenProject(row.projectId)}>Projeyi aç</button>:<span className="opinions-no-action">—</span>}</td>
      </tr>;
    })}</tbody></table></div>}
    <p className="opinions-footnote">Süre göstergesi yalnızca kayda girilmiş son tarihe göre hesaplanır; mevzuattaki iş günü veya resmî tatil hesabı değildir. Liste, erişim izniniz bulunan aktif projelerdeki en fazla 500 kaydı gösterir.</p>
  </section>;
}
