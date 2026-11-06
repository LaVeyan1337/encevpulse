import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Drawer } from './drawer';

type Request = (path: string, method?: string, data?: unknown) => Promise<Record<string, any>>;
type Status = 'draft' | 'requested' | 'waiting' | 'responded' | 'revision_requested' | 'closed' | 'positive' | 'negative' | 'revision' | 'other_request';
type DeadlineBasis = 'manual' | 'rule_calculated';
type ProjectOption={id:string;name:string;status:string};
type Draft={
  institutionName:string;subject:string;status:Status;requestDate:string;deadlineDate:string;
  deadlineBasis:DeadlineBasis;deadlineRuleVersionId:string;deadlineStartDate:string;deadlineStartEventLabel:string;deadlineReason:string;
  responseDate:string;outgoingLetterNo:string;incomingLetterNo:string;contactPerson:string;
  contactTitle:string;contactDepartment:string;contactPhone:string;contactEmail:string;contactAddress:string;notes:string;
};
const emptyDraft=():Draft=>({
  institutionName:'',subject:'',status:'waiting',requestDate:'',deadlineDate:'',
  deadlineBasis:'manual',deadlineRuleVersionId:'',deadlineStartDate:'',deadlineStartEventLabel:'',deadlineReason:'',
  responseDate:'',outgoingLetterNo:'',incomingLetterNo:'',contactPerson:'',contactTitle:'',
  contactDepartment:'',contactPhone:'',contactEmail:'',contactAddress:'',notes:'',
});
type Row = {
  id:string;caseId:string|null;projectId:string;projectName:string;fileNumber:string;
  ecedReference:string;projectOwnerName:string|null;institutionName:string;subject:string;status:Status;
  requestDate:string|null;deadlineDate:string|null;deadlineBasis:DeadlineBasis;
  deadlineRuleVersionId:string|null;deadlineStartDate:string|null;deadlineStartEventLabel:string;deadlineCalculatedAt:string|null;
  deadlineReason:string;deadlineRuleVersion:number|null;deadlineRuleName:string|null;
  responseDate:string|null;outgoingLetterNo:string;incomingLetterNo:string;contactPerson:string;
  contactTitle:string|null;contactDepartment:string|null;contactPhone:string|null;contactEmail:string|null;
  contactAddress:string|null;notes:string;version:number;updatedAt:string;
};
type DeadlineRule={
  id:string;name:string;description:string;currentVersionId:string|null;currentVersion:number|null;
  currentDayCount:number|null;currentDayType:'calendar_days'|'business_days'|null;currentStartEventLabel:string|null;
  currentIncludeStartDay:boolean|null;currentDueDateAdjustment:string|null;
  currentWeekendDays:number[]|null;currentHolidayDates:string[]|null;
  currentCalendarName:string|null;currentCalendarSourceLabel:string|null;
  currentCalendarSourceReference:string|null;currentCalendarVerifiedAt:string|null;
  currentLegalReference:string|null;currentRuleSourceLabel:string|null;currentRuleSourceReference:string|null;
  currentRuleNotes:string|null;currentApprovedAt:string|null;currentApprovedBy:string|null;
  draftVersionId:string|null;draftVersion:number|null;draftStatus:'draft'|null;
};
type DeadlineRuleForm={
  name:string;description:string;dayCount:string;dayType:'calendar_days'|'business_days';
  includeStartDay:boolean;dueDateAdjustment:'none'|'next_business_day'|'previous_business_day';
  weekendDays:number[];holidayDatesText:string;startEventLabel:string;calendarName:string;calendarSourceLabel:string;
  calendarSourceReference:string;calendarVerifiedAt:string;legalReference:string;
  ruleSourceLabel:string;ruleSourceReference:string;ruleNotes:string;
};
type RuleVersion={
  id:string;version:number;status:'draft'|'approved';dayCount:number;dayType:'calendar_days'|'business_days';
  includeStartDay:boolean;dueDateAdjustment:'none'|'next_business_day'|'previous_business_day';
  startEventLabel:string;weekendDays:number[];holidayDates:string[];calendarName:string;calendarSourceLabel:string;
  calendarSourceReference:string;calendarVerifiedAt:string|null;legalReference:string;
  ruleSourceLabel:string;ruleSourceReference:string;ruleNotes:string;
};
const emptyRuleForm=():DeadlineRuleForm=>({
  name:'',description:'',dayCount:'',dayType:'business_days',includeStartDay:false,dueDateAdjustment:'none',
  weekendDays:[0,6],holidayDatesText:'',startEventLabel:'',calendarName:'',calendarSourceLabel:'',
  calendarSourceReference:'',calendarVerifiedAt:'',legalReference:'',ruleSourceLabel:'',
  ruleSourceReference:'',ruleNotes:'',
});
const weekdayOptions=[{value:1,label:'Pazartesi'},{value:2,label:'Salı'},{value:3,label:'Çarşamba'},
  {value:4,label:'Perşembe'},{value:5,label:'Cuma'},{value:6,label:'Cumartesi'},{value:0,label:'Pazar'}];
const labels: Record<Status,string> = {
  waiting:'Görüş bekleniyor',positive:'Olumlu',negative:'Olumsuz',revision:'Revize',other_request:'Farklı talep var',
  draft:'Taslak kurum — henüz gönderilmedi',requested:'Gönderildi (eski kayıt)',responded:'Yanıt geldi (eski kayıt)',
  revision_requested:'Revize (eski kayıt)',closed:'Kapandı',
};
const statusOptions:Array<{value:Status;label:string}>=[
  {value:'draft',label:'Taslak / gönderilmedi'},
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
function dateTimeText(value:string|null):string {
  if(!value)return '—';
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '—';
  return new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(date);
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
function holidayList(value:string):string[]{
  return value.split(/[\n,;]+/).map(item=>item.trim()).filter(Boolean);
}
function toRuleForm(value:any,name='',description=''):DeadlineRuleForm{
  return {
    name,description,dayCount:String(value.dayCount??''),dayType:value.dayType??'business_days',
    includeStartDay:Boolean(value.includeStartDay),dueDateAdjustment:value.dueDateAdjustment??'none',
    weekendDays:Array.isArray(value.weekendDays)?value.weekendDays.map(Number):[],
    startEventLabel:value.startEventLabel??'',
    holidayDatesText:Array.isArray(value.holidayDates)?value.holidayDates.join('\n'):'',
    calendarName:value.calendarName??'',calendarSourceLabel:value.calendarSourceLabel??'',
    calendarSourceReference:value.calendarSourceReference??'',calendarVerifiedAt:value.calendarVerifiedAt??'',
    legalReference:value.legalReference??'',ruleSourceLabel:value.ruleSourceLabel??'',
    ruleSourceReference:value.ruleSourceReference??'',ruleNotes:value.ruleNotes??'',
  };
}
export function InstitutionOpinionsWorkspace({
  request,canOpenProject,onOpenProject,projects=[],projectId,canCreate=false,canUpdate=false,canDelete=false,canManageRules=false,
}:{
  request:Request;canOpenProject:boolean;onOpenProject:(id:string)=>void;projects?:ProjectOption[];projectId?:string;
  canCreate?:boolean;canUpdate?:boolean;canDelete?:boolean;canManageRules?:boolean;
}){
  const [rows,setRows]=useState<Row[]>([]);
  const [rules,setRules]=useState<DeadlineRule[]>([]);
  const [contacts,setContacts]=useState<Array<{id:string;institutionName:string;contactPerson:string;title:string;department:string;phone:string;email:string;address:string;projectCount:number}>>([]);
  const [view,setView]=useState<'opinions'|'directory'>('opinions');
  const [contactsLoading,setContactsLoading]=useState(false);
  const [notice,setNotice]=useState('');
  const [deletingId,setDeletingId]=useState<string|null>(null);
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
  const [deadlinePreview,setDeadlinePreview]=useState<{deadlineDate:string;calendarDaysElapsed:number;dayCount:number;dayType:string;startEventLabel:string}|null>(null);
  const [deadlinePreviewLoading,setDeadlinePreviewLoading]=useState(false);
  const [deadlinePreviewError,setDeadlinePreviewError]=useState('');

  const [ruleEditorOpen,setRuleEditorOpen]=useState(false);
  const [ruleEditorId,setRuleEditorId]=useState<string|null>(null);
  const [ruleEditorVersionId,setRuleEditorVersionId]=useState<string|null>(null);
  const [ruleForm,setRuleForm]=useState<DeadlineRuleForm>(()=>emptyRuleForm());
  const [ruleBusy,setRuleBusy]=useState(false);
  const [ruleError,setRuleError]=useState('');
  const [ruleNotice,setRuleNotice]=useState('');

  const currentRules=useMemo(()=>rules.filter(rule=>rule.currentVersionId),[rules]);
  const load=useCallback(async()=>{
    setLoading(true);setError('');
    try{
      const [opinionResult,ruleResult]=await Promise.all([
        request('ced/opinions'),
        request('ced/deadline-rules'),
      ]);
      setRows(Array.isArray(opinionResult.opinions)?opinionResult.opinions as Row[]:[]);
      setRules(Array.isArray(ruleResult.rules)?ruleResult.rules as DeadlineRule[]:[]);
    }catch(cause){setError(cause instanceof Error?cause.message:'Kurum görüşleri yüklenemedi.');}
    finally{setLoading(false);}
  },[request]);
  const loadContacts=useCallback(async()=>{
    setContactsLoading(true);
    try{const result=await request('ced/contacts');setContacts(Array.isArray(result.contacts)?result.contacts:[]);}
    catch(cause){setError(cause instanceof Error?cause.message:'Kurum rehberi yüklenemedi.');}
    finally{setContactsLoading(false);}
  },[request]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(projectId)setSelectedProjectId(projectId);},[projectId]);
  useEffect(()=>{
    let active=true;
    if(draft.deadlineBasis!=='rule_calculated'||!draft.deadlineRuleVersionId||!draft.deadlineStartDate){
      setDeadlinePreview(null);setDeadlinePreviewError('');setDeadlinePreviewLoading(false);
      return ()=>{active=false;};
    }
    setDeadlinePreview(null);setDeadlinePreviewError('');setDeadlinePreviewLoading(true);
    request('ced/deadline-rule-versions/'+draft.deadlineRuleVersionId+'/preview?startDate='+encodeURIComponent(draft.deadlineStartDate))
      .then(result=>{if(active)setDeadlinePreview(result.preview?{...result.preview,startEventLabel:result.rule?.startEventLabel??''}:null);})
      .catch(cause=>{if(active)setDeadlinePreviewError(cause instanceof Error?cause.message:'Süre önizlemesi alınamadı.');})
      .finally(()=>{if(active)setDeadlinePreviewLoading(false);});
    return ()=>{active=false;};
  },[draft.deadlineBasis,draft.deadlineRuleVersionId,draft.deadlineStartDate,request]);

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
  const deadlineNeedsReason=Boolean(editing&&(
    editing.deadlineBasis!==draft.deadlineBasis||
    (draft.deadlineBasis==='manual'&&editing.deadlineDate!==(draft.deadlineDate||null))||
    (draft.deadlineBasis==='rule_calculated'&&(
      editing.deadlineRuleVersionId!==draft.deadlineRuleVersionId||
      editing.deadlineStartDate!==draft.deadlineStartDate
    ))
  ));

  function openCreate(){
    const firstProject=projectId??projects.find(item=>item.status!=='archived')?.id??'';
    setEditing(null);setDraft(emptyDraft());setSelectedProjectId(firstProject);setFormError('');setEditorOpen(true);
  }
  function openEdit(row:Row){
    setEditing(row);setSelectedProjectId(row.projectId);setFormError('');
    setDraft({
      institutionName:row.institutionName,subject:row.subject,status:row.status,
      requestDate:row.requestDate??'',deadlineDate:row.deadlineDate??'',
      deadlineBasis:row.deadlineBasis??'manual',deadlineRuleVersionId:row.deadlineRuleVersionId??'',
      deadlineStartDate:row.deadlineStartDate??'',deadlineStartEventLabel:row.deadlineStartEventLabel??'',deadlineReason:row.deadlineReason??'',
      responseDate:row.responseDate??'',outgoingLetterNo:row.outgoingLetterNo??'',
      incomingLetterNo:row.incomingLetterNo??'',contactPerson:row.contactPerson??'',
      contactTitle:row.contactTitle??'',contactDepartment:row.contactDepartment??'',
      contactPhone:row.contactPhone??'',contactEmail:row.contactEmail??'',
      contactAddress:row.contactAddress??'',notes:row.notes??'',
    });
    setDeadlinePreview(null);setEditorOpen(true);
  }
  async function addDefaultDrafts(){
    if(!canCreate||!projectId||saving)return;
    setSaving(true);setError('');setNotice('');
    try{
      const result=await request('ced/projects/'+projectId+'/opinions/defaults','POST',{});
      setNotice((result.createdCount??0)+' eksik varsayılan kurum taslağı eklendi.');
      await load();
    }catch(cause){setError(cause instanceof Error?cause.message:'Varsayılan kurumlar eklenemedi.');}
    finally{setSaving(false);}
  }
  async function archiveOpinion(row:Row){
    if(!canDelete||deletingId)return;
    if(!window.confirm(row.institutionName+' kurum görüşü kaydını kaldırmak istiyor musunuz? Kayıt silinmez, arşivlenir.'))return;
    setDeletingId(row.id);setError('');
    try{await request('ced/opinions/'+row.id,'DELETE',{});setNotice('Kurum görüşü taslağı listeden kaldırıldı.');await load();}
    catch(cause){setError(cause instanceof Error?cause.message:'Kurum görüşü kaldırılamadı.');}
    finally{setDeletingId(null);}
  }

  function buildRulePayload(includeFamily:boolean){
    const holidays=holidayList(ruleForm.holidayDatesText);
    const payload:Record<string,unknown>={
      dayCount:Number(ruleForm.dayCount),dayType:ruleForm.dayType,includeStartDay:ruleForm.includeStartDay,
      dueDateAdjustment:ruleForm.dueDateAdjustment,weekendDays:ruleForm.weekendDays,holidayDates:holidays,
      startEventLabel:ruleForm.startEventLabel,
      calendarName:ruleForm.calendarName,calendarSourceLabel:ruleForm.calendarSourceLabel,
      calendarSourceReference:ruleForm.calendarSourceReference,calendarVerifiedAt:ruleForm.calendarVerifiedAt||null,
      legalReference:ruleForm.legalReference,ruleSourceLabel:ruleForm.ruleSourceLabel,
      ruleSourceReference:ruleForm.ruleSourceReference,ruleNotes:ruleForm.ruleNotes,
    };
    if(includeFamily){payload.name=ruleForm.name;payload.description=ruleForm.description;}
    return payload;
  }
  function openNewRule(){
    setRuleEditorId(null);setRuleEditorVersionId(null);setRuleForm(emptyRuleForm());
    setRuleError('');setRuleEditorOpen(true);
  }
  async function openRuleDraft(rule:DeadlineRule){
    if(!rule.draftVersionId)return;
    setRuleBusy(true);setRuleError('');
    try{
      const result=await request('ced/deadline-rules/'+rule.id+'/versions');
      const version=(result.versions??[]).find((item:RuleVersion)=>item.id===rule.draftVersionId) as RuleVersion|undefined;
      if(!version)throw new Error('Bekleyen kural taslağı bulunamadı.');
      setRuleEditorId(rule.id);setRuleEditorVersionId(version.id);
      setRuleForm(toRuleForm(version,rule.name,rule.description));
      setRuleEditorOpen(true);
    }catch(cause){setRuleError(cause instanceof Error?cause.message:'Kural taslağı alınamadı.');}
    finally{setRuleBusy(false);}
  }
  function openNewRuleVersion(rule:DeadlineRule){
    if(!rule.currentVersionId)return;
    setRuleEditorId(rule.id);setRuleEditorVersionId(null);
    setRuleForm(toRuleForm({
      dayCount:rule.currentDayCount,dayType:rule.currentDayType,
      includeStartDay:rule.currentIncludeStartDay,dueDateAdjustment:rule.currentDueDateAdjustment,
      weekendDays:rule.currentWeekendDays,holidayDates:rule.currentHolidayDates,
      startEventLabel:rule.currentStartEventLabel,
      calendarName:rule.currentCalendarName,calendarSourceLabel:rule.currentCalendarSourceLabel,
      calendarSourceReference:rule.currentCalendarSourceReference,calendarVerifiedAt:rule.currentCalendarVerifiedAt,
      legalReference:rule.currentLegalReference,ruleSourceLabel:rule.currentRuleSourceLabel,
      ruleSourceReference:rule.currentRuleSourceReference,ruleNotes:rule.currentRuleNotes,
    },rule.name,rule.description));
    setRuleError('');setRuleEditorOpen(true);
  }
  async function saveRule(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canManageRules||ruleBusy)return;
    if(!Number.isInteger(Number(ruleForm.dayCount))||Number(ruleForm.dayCount)<1||Number(ruleForm.dayCount)>3650){
      setRuleError('Süre 1 ile 3650 gün arasında olmalıdır.');return;
    }
    setRuleBusy(true);setRuleError('');setRuleNotice('');
    try{
      const includeFamily=!ruleEditorId||Boolean(ruleEditorVersionId);
      const payload=buildRulePayload(includeFamily);
      if(!ruleEditorId){
        await request('ced/deadline-rules','POST',payload);
        setRuleNotice('Süre kuralı taslak olarak kaydedildi. Hesaplamada kullanılabilmesi için onaylanması gerekir.');
      }else if(ruleEditorVersionId){
        await request('ced/deadline-rules/'+ruleEditorId+'/versions/'+ruleEditorVersionId,'PATCH',payload);
        setRuleNotice('Kural taslağı güncellendi. Onaylanana kadar hesaplamada kullanılamaz.');
      }else{
        await request('ced/deadline-rules/'+ruleEditorId+'/versions','POST',payload);
        setRuleNotice('Yeni kural sürümü taslak olarak kaydedildi. Eski onaylı sürüm yürürlükte kalır.');
      }
      setRuleEditorOpen(false);setRuleEditorId(null);setRuleEditorVersionId(null);
      await load();
    }catch(cause){setRuleError(cause instanceof Error?cause.message:'Süre kuralı kaydedilemedi.');}
    finally{setRuleBusy(false);}
  }
  async function approveRule(rule:DeadlineRule){
    if(!canManageRules||ruleBusy||!rule.draftVersionId)return;
    if(!window.confirm('Bu kural sürümünü ve çalışma takvimi kaynağını kontrol edip onaylıyor musunuz? Onaylanan sürüm değiştirilemez; yeni değişiklik ayrı sürüm olur.'))return;
    setRuleBusy(true);setRuleError('');setRuleNotice('');
    try{
      await request('ced/deadline-rules/'+rule.id+'/versions/'+rule.draftVersionId+'/approve','POST',{});
      setRuleNotice('Süre kuralı onaylandı ve yeni görüşlerde kullanılabilir hale geldi.');
      await load();
    }catch(cause){setRuleError(cause instanceof Error?cause.message:'Süre kuralı onaylanamadı.');}
    finally{setRuleBusy(false);}
  }

  function setField(key:keyof Draft,value:string){
    setDraft(current=>({...current,[key]:value}));
  }
  function toggleWeekendDay(day:number){
    setRuleForm(current=>({...current,weekendDays:current.weekendDays.includes(day)
      ?current.weekendDays.filter(value=>value!==day):[...current.weekendDays,day]}));
  }
  function switchDeadlineBasis(basis:DeadlineBasis){
    setDraft(current=>{
      if(basis==='manual')return {...current,deadlineBasis:basis,deadlineRuleVersionId:'',deadlineStartDate:'',deadlineStartEventLabel:''};
      const rule=currentRules.find(item=>item.currentVersionId===(current.deadlineRuleVersionId||currentRules[0]?.currentVersionId));
      return {...current,deadlineBasis:basis,deadlineDate:'',deadlineRuleVersionId:current.deadlineRuleVersionId||currentRules[0]?.currentVersionId||'',
        deadlineStartDate:current.deadlineStartDate||current.requestDate,deadlineStartEventLabel:rule?.currentStartEventLabel??current.deadlineStartEventLabel};
    });
  }

  async function saveOpinion(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!canCreate&&!editing)return;
    if(editing&&!canUpdate)return;
    const targetProject=projectId??selectedProjectId;
    if(!targetProject){setFormError('Önce bir proje seçin.');return;}
    if(draft.institutionName.trim().length<2||draft.subject.trim().length<2){setFormError('Kurum adı ve görüş konusu en az 2 karakter olmalıdır.');return;}
    if(draft.deadlineBasis==='rule_calculated'&&(!draft.deadlineRuleVersionId||!draft.deadlineStartDate)){
      setFormError('Onaylı süre kuralı ve başlangıç tarihi seçin.');return;
    }
    if(draft.deadlineBasis==='rule_calculated'&&!deadlinePreview){
      setFormError('Son tarih önizlemesi alınmadan kayıt yapılamaz. Kuralı ve başlangıç tarihini kontrol edin.');return;
    }
    if(deadlineNeedsReason&&!draft.deadlineReason.trim()){
      setFormError('Son tarih değişikliği için gerekçe yazın.');return;
    }
    setSaving(true);setFormError('');
    const payload:Record<string,unknown>={
      institutionName:draft.institutionName.trim(),subject:draft.subject.trim(),status:draft.status,
      requestDate:draft.requestDate||null,deadlineBasis:draft.deadlineBasis,
      deadlineRuleVersionId:draft.deadlineBasis==='rule_calculated'?draft.deadlineRuleVersionId:null,
      deadlineStartDate:draft.deadlineBasis==='rule_calculated'?draft.deadlineStartDate:null,
      deadlineStartEventLabel:draft.deadlineBasis==='rule_calculated'?draft.deadlineStartEventLabel:'',
      deadlineReason:draft.deadlineReason.trim(),responseDate:draft.responseDate||null,
      outgoingLetterNo:draft.outgoingLetterNo,incomingLetterNo:draft.incomingLetterNo,
      contactPerson:draft.contactPerson,contactTitle:draft.contactTitle,contactDepartment:draft.contactDepartment,
      contactPhone:draft.contactPhone,contactEmail:draft.contactEmail,contactAddress:draft.contactAddress,notes:draft.notes,
    };
    if(draft.deadlineBasis==='manual')payload.deadlineDate=draft.deadlineDate||null;
    try{
      if(editing)await request('ced/opinions/'+editing.id,'PATCH',{...payload,version:editing.version});
      else await request('ced/projects/'+targetProject+'/opinions','POST',payload);
      setEditorOpen(false);setEditing(null);await Promise.all([load(),loadContacts()]);
      setNotice('Kurum görüşü kaydedildi.');
    }catch(cause){setFormError(cause instanceof Error?cause.message:'Kurum görüşü kaydedilemedi.');}
    finally{setSaving(false);}
  }

  const selectedRule=currentRules.find(rule=>rule.currentVersionId===draft.deadlineRuleVersionId);
  const selectedLegacyRule=editing?.deadlineBasis==='rule_calculated'&&editing.deadlineRuleVersionId===draft.deadlineRuleVersionId
    ?editing:null;

  return <section className="institution-opinions-workspace" aria-label="Kurum görüşleri">
    <header className="opinions-page-intro">
      <div><span className="opinions-eyebrow">{projectId?'PROJE YAZIŞMALARI':'KURUMSAL SÜREÇ TAKİBİ'}</span><h2>Kurum Görüşleri</h2>
        <p>{projectId?'Bu projeye ait tüm kurum yazışmalarını ve farklı görüş turlarını takip edin.':'Projeler arasındaki tüm kurum görüşlerini tek listeden yönetin.'}</p></div>
      <div className="opinions-header-actions">
        {canCreate&&projectId&&<button type="button" className="opinions-defaults-button" onClick={()=>void addDefaultDrafts()} disabled={saving}>Eksik varsayılanları ekle</button>}
        {canCreate&&<button type="button" className="opinions-add-button" onClick={openCreate}>＋ <span>Yeni görüş ekle</span></button>}
        <button type="button" className="opinions-refresh-button" onClick={()=>void load()} disabled={loading}>↻ <span>{loading?'Yükleniyor…':'Yenile'}</span></button>
      </div>
    </header>
    {ruleNotice&&<div className="opinions-notice" role="status">{ruleNotice}<button type="button" onClick={()=>setRuleNotice('')} aria-label="Bildirimi kapat">×</button></div>}
    {ruleError&&<div className="opinions-error" role="alert"><span>{ruleError}</span><button type="button" onClick={()=>setRuleError('')}>Kapat</button></div>}
    {(canManageRules||rules.length>0)&&<section className="opinions-rule-panel" aria-label="Süre kuralı ve takvim yönetimi">
      <header className="opinions-rule-heading">
        <div><span className="opinions-eyebrow">SÜRE HESAPLAMA</span><h3>Onaylı süre kuralları</h3>
          <p>Mevzuat süresi ancak yetkili süreç sahibinin dayanağını ve takvimini kontrol edip onayladığı sürümle hesaplanır.</p></div>
        {canManageRules&&<button type="button" className="opinions-add-button" onClick={openNewRule} disabled={ruleBusy}>＋ Yeni kural</button>}
      </header>
      {rules.length===0?<div className="opinions-rule-empty">Henüz onaylı süre kuralı yok. Mevcut elle girilmiş tarihler manuel olarak kalır.</div>
      :<div className="opinions-rule-list">{rules.map(rule=><article className="opinions-rule-card" key={rule.id}>
        <div className="opinions-rule-main">
          <strong>{rule.name}</strong><span>{rule.description||'Açıklama girilmedi'}</span>
          {rule.currentVersionId
            ?<small>Yürürlükte v{rule.currentVersion} · {rule.currentDayCount} {rule.currentDayType==='business_days'?'iş günü':'takvim günü'} · Başlangıç olayı: {rule.currentStartEventLabel||'—'} · Onay: {rule.currentApprovedBy||'—'} · {dateTimeText(rule.currentApprovedAt)}</small>
            :<small className="opinions-rule-pending">Henüz onaylı sürüm yok; yeni kayıtlarda kullanılamaz.</small>}
        </div>
        <div className="opinions-rule-actions">
          {rule.draftVersionId&&canManageRules&&<>
            <span className="opinions-rule-draft">v{rule.draftVersion} taslak</span>
            <button type="button" className="opinions-edit-button" onClick={()=>void openRuleDraft(rule)} disabled={ruleBusy}>Taslağı düzenle</button>
            <button type="button" className="opinions-add-button" onClick={()=>void approveRule(rule)} disabled={ruleBusy}>Onayla</button>
          </>}
          {rule.currentVersionId&&canManageRules&&!rule.draftVersionId&&
            <button type="button" className="opinions-edit-button" onClick={()=>openNewRuleVersion(rule)} disabled={ruleBusy}>Yeni sürüm</button>}
        </div>
      </article>)}</div>}
      {ruleEditorOpen&&canManageRules&&<form className="opinions-rule-editor" onSubmit={event=>void saveRule(event)}>
        <div className="opinions-rule-editor-heading"><div><strong>{!ruleEditorId?'Yeni süre kuralı':ruleEditorVersionId?'Kural taslağını düzenle':'Yeni kural sürümü'}</strong>
          <span>Kaydedilen taslak, süreç sahibi onaylayana kadar hesaplamada kullanılmaz.</span></div>
          <button type="button" className="opinions-text-button" onClick={()=>setRuleEditorOpen(false)} disabled={ruleBusy}>Kapat</button>
        </div>
        <div className="opinions-rule-form-grid">
          <label><span>Kural adı</span><input value={ruleForm.name} onChange={event=>setRuleForm(current=>({...current,name:event.target.value}))} minLength={2} maxLength={180} required/></label>
          <label><span>Açıklama</span><input value={ruleForm.description} onChange={event=>setRuleForm(current=>({...current,description:event.target.value}))} maxLength={1200}/></label>
          <label className="opinions-rule-field-wide"><span>Süreyi başlatan olay</span><input value={ruleForm.startEventLabel} onChange={event=>setRuleForm(current=>({...current,startEventLabel:event.target.value}))} maxLength={240} placeholder="Kurum yazısının evrak kayıt tarihi" required/></label>
          <label><span>Süre</span><input type="number" min={1} max={3650} value={ruleForm.dayCount} onChange={event=>setRuleForm(current=>({...current,dayCount:event.target.value}))} required/></label>
          <label><span>Gün türü</span><select value={ruleForm.dayType} onChange={event=>setRuleForm(current=>({...current,dayType:event.target.value as DeadlineRuleForm['dayType']}))}>
            <option value="business_days">İş günü</option><option value="calendar_days">Takvim günü</option>
          </select></label>
          <label><span>Son gün çalışma dışıysa</span><select value={ruleForm.dueDateAdjustment} onChange={event=>setRuleForm(current=>({...current,dueDateAdjustment:event.target.value as DeadlineRuleForm['dueDateAdjustment']}))}>
            <option value="none">Düzeltme yapma</option><option value="next_business_day">Sonraki iş gününe al</option><option value="previous_business_day">Önceki iş gününe al</option>
          </select></label>
          <label className="opinions-rule-check"><input type="checkbox" checked={ruleForm.includeStartDay} onChange={event=>setRuleForm(current=>({...current,includeStartDay:event.target.checked}))}/><span>Başlangıç gününü süreye dahil et</span></label>
          {(ruleForm.dayType==='business_days'||ruleForm.dueDateAdjustment!=='none')&&<>
            <div className="opinions-weekend-picker"><span>Çalışma dışı hafta günleri</span><div>{weekdayOptions.map(day=><label key={day.value}><input type="checkbox" checked={ruleForm.weekendDays.includes(day.value)} onChange={()=>toggleWeekendDay(day.value)}/>{day.label}</label>)}</div></div>
            <label><span>Çalışma takvimi adı</span><input value={ruleForm.calendarName} onChange={event=>setRuleForm(current=>({...current,calendarName:event.target.value}))} maxLength={180} required/></label>
            <label><span>Takvim kaynağı</span><input value={ruleForm.calendarSourceLabel} onChange={event=>setRuleForm(current=>({...current,calendarSourceLabel:event.target.value}))} maxLength={180} required/></label>
            <label><span>Takvim kaynak referansı</span><input value={ruleForm.calendarSourceReference} onChange={event=>setRuleForm(current=>({...current,calendarSourceReference:event.target.value}))} maxLength={1200} required/></label>
            <label><span>Takvim teyit tarihi</span><input type="date" value={ruleForm.calendarVerifiedAt} onChange={event=>setRuleForm(current=>({...current,calendarVerifiedAt:event.target.value}))} required/></label>
            <label className="opinions-rule-field-wide"><span>Resmî tatiller (her satıra YYYY-AA-GG)</span><textarea rows={3} value={ruleForm.holidayDatesText} onChange={event=>setRuleForm(current=>({...current,holidayDatesText:event.target.value}))} placeholder="2026-01-01&#10;2026-04-23"/></label>
          </>}
          <label className="opinions-rule-field-wide"><span>Mevzuat / kural dayanağı</span><textarea rows={2} value={ruleForm.legalReference} onChange={event=>setRuleForm(current=>({...current,legalReference:event.target.value}))} maxLength={600} required/></label>
          <label><span>Kural kaynağı</span><input value={ruleForm.ruleSourceLabel} onChange={event=>setRuleForm(current=>({...current,ruleSourceLabel:event.target.value}))} maxLength={180} required/></label>
          <label><span>Kural kaynak referansı</span><input value={ruleForm.ruleSourceReference} onChange={event=>setRuleForm(current=>({...current,ruleSourceReference:event.target.value}))} maxLength={1200} required/></label>
          <label className="opinions-rule-field-wide"><span>Hesaplama / uygulama notu</span><textarea rows={2} value={ruleForm.ruleNotes} onChange={event=>setRuleForm(current=>({...current,ruleNotes:event.target.value}))} maxLength={3000}/></label>
        </div>
        {ruleError&&<p className="auth-error" role="alert">{ruleError}</p>}
        <div className="opinions-rule-submit"><span>Onay, girilen dayanağın ve takvim kaynağının süreç sahibi tarafından kontrol edildiği anlamına gelir. Sistem mevzuat metnini kendisi yorumlamaz.</span>
          <button type="submit" className="opinions-add-button" disabled={ruleBusy}>{ruleBusy?'Kaydediliyor…':ruleEditorVersionId?'Taslağı kaydet':ruleEditorId?'Yeni sürümü oluştur':'Kural taslağını oluştur'}</button>
        </div>
      </form>}
    </section>}
    <nav className="opinions-view-tabs" aria-label="Kurum görüşü bölümleri">
      <button type="button" aria-pressed={view==='opinions'} onClick={()=>setView('opinions')}>Kurum görüşleri <span>{visibleRows.length}</span></button>
      <button type="button" aria-pressed={view==='directory'} onClick={()=>{setView('directory');void loadContacts();}}>Kurum rehberi <span>{contacts.length}</span></button>
    </nav>
    {notice&&<div className="opinions-notice" role="status">{notice}<button type="button" onClick={()=>setNotice('')} aria-label="Bildirimi kapat">×</button></div>}
    <div className="opinions-metrics" aria-label="Kurum görüşü özeti" style={{display:view==='opinions'?'grid':'none'}}>
      <article><span>Açık kayıt</span><strong>{openCount}</strong></article>
      <article className={lateCount?'is-overdue':''}><span>Süresi geçen</span><strong>{lateCount}</strong></article>
      <article><span>Yanıtlanan</span><strong>{answered}</strong></article>
    </div>
    {view==='opinions'&&error&&<div className="opinions-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void load()}>Tekrar dene</button></div>}
    <div className="opinions-toolbar" style={{display:view==='opinions'?'flex':'none'}}>
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
    <div style={{display:view==='opinions'?'block':'none'}}>
    {loading&&rows.length===0?<div className="opinions-empty">Kurum görüşleri yükleniyor…</div>
    :filtered.length===0?<div className="opinions-empty"><strong>{rows.length===0?'Henüz kurum görüşü kaydı yok':'Aramayla eşleşen kayıt bulunamadı'}</strong>
      <span>{rows.length===0?'Yeni bir görüş ekleyerek bu projenin yazışma geçmişini başlatabilirsiniz.':'Arama metnini veya durum filtresini değiştirin.'}</span>
      {rows.length===0&&canCreate&&<button type="button" className="opinions-add-button" onClick={openCreate}>＋ Yeni görüş ekle</button>}</div>
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
        <td><div className="opinions-deadline-stack"><span className={'opinions-deadline deadline-'+deadline.tone}>{deadline.label}</span>
          <small>{row.deadlineBasis==='rule_calculated'?'Kural v'+row.deadlineRuleVersion+' · '+(row.deadlineRuleName??'Onaylı kural')+' · '+(row.deadlineStartEventLabel??'Başlangıç olayı belirtilmedi'):'Manuel tarih'}</small></div></td><td>{dateText(row.responseDate)}</td>
        <td className="opinions-row-actions">
          {canUpdate&&<button type="button" className="opinions-edit-button" onClick={()=>openEdit(row)}>Düzenle</button>}
          {canDelete&&<button type="button" className="opinions-delete-button" onClick={()=>void archiveOpinion(row)} disabled={deletingId===row.id}>{deletingId===row.id?'Kaldırılıyor…':'Kaldır'}</button>}
          {canOpenProject&&<button type="button" className="opinions-open-button" onClick={()=>onOpenProject(row.projectId)}>Projeyi aç</button>}
          {!canUpdate&&!canOpenProject&&<span className="opinions-no-action">—</span>}
        </td>
      </tr>;
    })}</tbody></table></div>}
    <p className="opinions-footnote">“Kural vN” etiketi, kaydın hangi onaylı kural sürümüyle hesaplandığını gösterir. Kuralın mevzuat dayanağı ve çalışma takvimi onayı süreç sahibinin sorumluluğundadır. Geri sayım günleri takvim günü olarak gösterilir; hesaplanan son tarih ise kayıtlı kuralın iş günü/tatil ayarlarını kullanır. Manuel tarihler otomatik mevzuat hesabı sayılmaz.</p>
    </div>
    {view==='directory'&&error&&<div className="opinions-error" role="alert"><span>{error}</span><button type="button" onClick={()=>void loadContacts()}>Tekrar dene</button></div>}
    {view==='directory'&&<section className="institution-directory" aria-label="Kurum rehberi">
      <header><div><h3>Kurum ve ilgili kişi kayıtları</h3><p>Kurum görüşü kaydına girilen iletişim bilgileri burada otomatik toplanır.</p></div><span>{contacts.length} kişi</span></header>
      {contactsLoading?<div className="opinions-empty">Kurum rehberi yükleniyor…</div>
      :contacts.length===0?<div className="opinions-empty"><strong>Henüz iletişim kaydı yok</strong><span>Bir kurum görüşünü düzenleyip ilgili kişi, telefon veya e-posta bilgisi eklediğinizde rehber otomatik oluşur.</span></div>
      :<div className="institution-directory-grid">{contacts.map(contact=><article className="institution-contact-card" key={contact.id}>
        <div><span className="institution-contact-kicker">{contact.institutionName}</span><h4>{contact.contactPerson||'İlgili kişi belirtilmedi'}</h4>{contact.title&&<p>{contact.title}{contact.department?' · '+contact.department:''}</p>}</div>
        <div className="institution-contact-links">
          {contact.phone&&<a href={'tel:'+contact.phone}>{contact.phone}</a>}
          {contact.email&&<a href={'mailto:'+contact.email}>{contact.email}</a>}
          {contact.address&&<span>{contact.address}</span>}
        </div>
        <footer>{contact.projectCount} projede kayıtlı</footer>
      </article>)}</div>}
    </section>}
    <Drawer
      isOpen={editorOpen}
      onClose={()=>{setEditorOpen(false);setEditing(null);setFormError('');}}
      size="lg"
      title={editing?'Kurum görüşünü düzenle':'Yeni kurum görüşü'}
      subtitle={editing?'Bu yazışmanın durumunu ve tarihlerini güncelleyin.':'Aynı proje için gerektiği kadar ayrı görüş ve yazışma kaydı oluşturabilirsiniz.'}
      ariaLabelledBy="institution-opinion-editor-title"
      footer={<>
        <button type="button" className="secondary-button" onClick={()=>{setEditorOpen(false);setEditing(null);}} disabled={saving}>Vazgeç</button>
        <button type="submit" form="institution-opinion-form" className="primary-button" disabled={saving}>{saving?'Kaydediliyor…':editing?'Değişiklikleri kaydet':'Görüşü kaydet'}</button>
      </>}
    >
      <form id="institution-opinion-form" className="drawer-form opinions-editor-form" onSubmit={saveOpinion}>
        {!projectId&&<div className="form-group">
          <label htmlFor="opinion-project">İlgili proje</label>
          <select id="opinion-project" value={selectedProjectId} onChange={event=>setSelectedProjectId(event.target.value)} required>
            <option value="">Proje seçin</option>
            {projects.filter(item=>item.status!=='archived').map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>}
        {projectId&&<div className="opinions-fixed-project"><span>İlgili proje</span><strong>{projects.find(item=>item.id===projectId)?.name??rows.find(item=>item.projectId===projectId)?.projectName??'Seçili proje'}</strong></div>}
        <div className="opinions-editor-grid">
          <div className="form-group"><label htmlFor="opinion-institution">Kurum adı</label><input id="opinion-institution" value={draft.institutionName} maxLength={180} onChange={event=>setField('institutionName',event.target.value)} required/></div>
          <div className="form-group"><label htmlFor="opinion-subject">Görüş / yazışma konusu</label><input id="opinion-subject" value={draft.subject} maxLength={240} onChange={event=>setField('subject',event.target.value)} required/></div>
          <div className="form-group"><label htmlFor="opinion-status">Durum</label><select id="opinion-status" value={draft.status} onChange={event=>setField('status',event.target.value as Status)}>
            {statusOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
            {editing&&!statusOptions.some(option=>option.value===editing.status)&&<option value={editing.status}>{labels[editing.status]??editing.status}</option>}
          </select></div>
          <div className="form-group"><label htmlFor="opinion-contact">İlgili kişi (isteğe bağlı)</label><input id="opinion-contact" value={draft.contactPerson} maxLength={160} onChange={event=>setField('contactPerson',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-contact-title">Unvan</label><input id="opinion-contact-title" value={draft.contactTitle} maxLength={120} onChange={event=>setField('contactTitle',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-contact-department">Birim / departman</label><input id="opinion-contact-department" value={draft.contactDepartment} maxLength={120} onChange={event=>setField('contactDepartment',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-contact-phone">Telefon</label><input id="opinion-contact-phone" type="tel" autoComplete="tel" value={draft.contactPhone} maxLength={60} onChange={event=>setField('contactPhone',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-contact-email">E-posta</label><input id="opinion-contact-email" type="email" autoComplete="email" value={draft.contactEmail} maxLength={254} onChange={event=>setField('contactEmail',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-contact-address">Adres</label><input id="opinion-contact-address" value={draft.contactAddress} maxLength={400} onChange={event=>setField('contactAddress',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-request-date">Talep / gönderim tarihi</label><input id="opinion-request-date" type="date" value={draft.requestDate} onChange={event=>setField('requestDate',event.target.value)}/></div>
        </div>
        <section className="opinions-deadline-editor" aria-label="Son tarih hesabı">
          <div className="opinions-deadline-mode"><label htmlFor="opinion-deadline-basis">Son tarih yöntemi</label>
            <select id="opinion-deadline-basis" value={draft.deadlineBasis} onChange={event=>switchDeadlineBasis(event.target.value as DeadlineBasis)}>
              <option value="manual">Manuel tarih</option><option value="rule_calculated">Onaylı süre kuralı</option>
            </select>
          </div>
          {draft.deadlineBasis==='manual'
            ?<div className="opinions-editor-grid">
              <div className="form-group"><label htmlFor="opinion-deadline">Yanıt için son tarih</label><input id="opinion-deadline" type="date" value={draft.deadlineDate} onChange={event=>setField('deadlineDate',event.target.value)}/></div>
              {deadlineNeedsReason&&<div className="form-group opinions-deadline-reason"><label htmlFor="opinion-deadline-reason">Son tarih değişiklik gerekçesi *</label><textarea id="opinion-deadline-reason" rows={2} maxLength={1000} value={draft.deadlineReason} onChange={event=>setField('deadlineReason',event.target.value)} required/></div>}
              {!deadlineNeedsReason&&editing?.deadlineBasis==='rule_calculated'&&<p className="opinions-deadline-warning">Hesaplanan tarihten manuel tarihe geçiyorsunuz. Kaydetmeden önce gerekçe girmeniz gerekecek.</p>}
            </div>
            :<div className="opinions-rule-calculation-form">
              <label><span>Onaylı süre kuralı</span><select value={draft.deadlineRuleVersionId} onChange={event=>{
                const id=event.target.value;
                const rule=currentRules.find(item=>item.currentVersionId===id);
                setDraft(current=>({...current,deadlineRuleVersionId:id,deadlineStartEventLabel:rule?.currentStartEventLabel??(selectedLegacyRule?.deadlineRuleVersionId===id?selectedLegacyRule.deadlineStartEventLabel:'')}));
              }} required>
                <option value="">Kural seçin</option>
                {currentRules.map(rule=><option key={rule.currentVersionId??rule.id} value={rule.currentVersionId??''}>{rule.name} · v{rule.currentVersion} · {rule.currentDayCount} {rule.currentDayType==='business_days'?'iş günü':'takvim günü'}</option>)}
                {selectedLegacyRule&&!currentRules.some(rule=>rule.currentVersionId===draft.deadlineRuleVersionId)&&
                  <option value={selectedLegacyRule.deadlineRuleVersionId??''}>{selectedLegacyRule.deadlineRuleName??'Önceki kural'} · v{selectedLegacyRule.deadlineRuleVersion} (kayıtlı sürüm)</option>}
              </select></label>
              <div className="opinions-rule-event-note"><strong>Süreyi başlatan olay</strong><span>{deadlinePreview?.startEventLabel||draft.deadlineStartEventLabel||selectedRule?.currentStartEventLabel||selectedLegacyRule?.deadlineStartEventLabel||'Kural olay bilgisi yükleniyor…'}</span></div>
              <label><span>Bu olayın gerçekleştiği tarih</span><input type="date" value={draft.deadlineStartDate} onChange={event=>setField('deadlineStartDate',event.target.value)} required/></label>
              <div className="opinions-deadline-preview" role="status">
                {deadlinePreviewLoading?<span>Son tarih hesaplanıyor…</span>
                :deadlinePreviewError?<span className="opinions-rule-error">{deadlinePreviewError}</span>
                :deadlinePreview?<><strong>Hesaplanan son tarih: {dateText(deadlinePreview.deadlineDate)}</strong>
                  <span>{deadlinePreview.dayCount} {deadlinePreview.dayType==='business_days'?'iş günü':'takvim günü'} · {deadlinePreview.startEventLabel} · {dateText(draft.deadlineStartDate)}</span></>
                :<span>Hesaplama için kural ve başlangıç tarihi seçin.</span>}
              </div>
              {deadlineNeedsReason&&<label className="opinions-rule-field-wide"><span>Kural / başlangıç değişiklik gerekçesi *</span><textarea rows={2} maxLength={1000} value={draft.deadlineReason} onChange={event=>setField('deadlineReason',event.target.value)} required/></label>}
              <p>Önizleme aynı sunucu hesaplayıcısıyla üretilir. Kuralın kaynağı ve çalışma takviminin doğruluğu süreç sahibinin sorumluluğundadır.</p>
            </div>}
        </section>
        <div className="opinions-editor-grid">
          <div className="form-group"><label htmlFor="opinion-response-date">Yanıt tarihi</label><input id="opinion-response-date" type="date" value={draft.responseDate} onChange={event=>setField('responseDate',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-outgoing">Giden yazı numarası</label><input id="opinion-outgoing" value={draft.outgoingLetterNo} maxLength={100} onChange={event=>setField('outgoingLetterNo',event.target.value)}/></div>
          <div className="form-group"><label htmlFor="opinion-incoming">Gelen yazı numarası</label><input id="opinion-incoming" value={draft.incomingLetterNo} maxLength={100} onChange={event=>setField('incomingLetterNo',event.target.value)}/></div>
        </div>
        <div className="form-group"><label htmlFor="opinion-notes">Açıklama / yazışma notu</label><textarea id="opinion-notes" rows={4} maxLength={4000} value={draft.notes} onChange={event=>setField('notes',event.target.value)}/></div>
        {formError&&<p className="auth-error" role="alert">{formError}</p>}
      </form>
    </Drawer>
  </section>;
}
