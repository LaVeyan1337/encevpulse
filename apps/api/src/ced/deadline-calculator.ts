export type DeadlineDayType='calendar_days'|'business_days';
export type DeadlineAdjustment='none'|'next_business_day'|'previous_business_day';

export interface DeadlineRule {
  dayCount:number;
  dayType:DeadlineDayType;
  includeStartDay:boolean;
  dueDateAdjustment:DeadlineAdjustment;
  weekendDays:number[];
  holidayDates:string[];
}

export interface DeadlineCalculation {
  startDate:string;
  deadlineDate:string;
  dayCount:number;
  dayType:DeadlineDayType;
  includeStartDay:boolean;
  dueDateAdjustment:DeadlineAdjustment;
  calendarDaysElapsed:number;
}

function parseDate(value:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Başlangıç tarihi YYYY-AA-GG biçiminde olmalıdır.');
  const date=new Date(value+'T00:00:00.000Z');
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) {
    throw new Error('Başlangıç tarihi takvimde geçerli bir gün olmalıdır.');
  }
  return date;
}
function dateKey(date:Date):string {
  return date.toISOString().slice(0,10);
}
function shiftDate(date:Date,days:number):Date {
  const next=new Date(date.getTime());
  next.setUTCDate(next.getUTCDate()+days);
  return next;
}
function normalizeCalendar(rule:DeadlineRule):{weekends:Set<number>;holidays:Set<string>} {
  if(!Array.isArray(rule.weekendDays)||rule.weekendDays.some(day=>!Number.isInteger(day)||day<0||day>6)||
    new Set(rule.weekendDays).size!==rule.weekendDays.length) {
    throw new Error('Hafta sonu günleri geçersiz.');
  }
  if(!Array.isArray(rule.holidayDates)||rule.holidayDates.length>1200)throw new Error('Resmî tatil listesi geçersiz.');
  const holidays=new Set<string>();
  for(const value of rule.holidayDates) {
    parseDate(value);
    holidays.add(value);
  }
  if(rule.dayType==='business_days'&&rule.weekendDays.length===0) {
    throw new Error('İş günü hesabı için çalışma dışı gün takvimi onaylanmalıdır.');
  }
  if(rule.dueDateAdjustment!=='none'&&rule.weekendDays.length===0) {
    throw new Error('Son gün düzeltmesi için çalışma takvimi gerekir.');
  }
  return {weekends:new Set(rule.weekendDays),holidays};
}
function isBusinessDay(date:Date,weekends:Set<number>,holidays:Set<string>):boolean {
  return !weekends.has(date.getUTCDay())&&!holidays.has(dateKey(date));
}

export function calculateDeadline(startDate:string,rule:DeadlineRule):DeadlineCalculation {
  const start=parseDate(startDate);
  if(!Number.isInteger(rule.dayCount)||rule.dayCount<1||rule.dayCount>3650) {
    throw new Error('Süre 1 ile 3650 gün arasında olmalıdır.');
  }
  if(!['calendar_days','business_days'].includes(rule.dayType))throw new Error('Süre türü geçersiz.');
  if(!['none','next_business_day','previous_business_day'].includes(rule.dueDateAdjustment)) {
    throw new Error('Son gün düzeltme kuralı geçersiz.');
  }
  const {weekends,holidays}=normalizeCalendar(rule);
  let due=new Date(start.getTime());
  if(rule.dayType==='calendar_days') {
    due=shiftDate(due,rule.dayCount-(rule.includeStartDay?1:0));
  } else {
    let remaining=rule.dayCount;
    if(rule.includeStartDay&&isBusinessDay(due,weekends,holidays))remaining-=1;
    while(remaining>0) {
      due=shiftDate(due,1);
      if(isBusinessDay(due,weekends,holidays))remaining-=1;
    }
  }
  if(rule.dueDateAdjustment!=='none') {
    const direction=rule.dueDateAdjustment==='next_business_day'?1:-1;
    let attempts=0;
    while(!isBusinessDay(due,weekends,holidays)) {
      due=shiftDate(due,direction);
      attempts+=1;
      if(attempts>370)throw new Error('Onaylı çalışma takvimi son günü düzeltemedi.');
    }
  }
  return {
    startDate:dateKey(start),
    deadlineDate:dateKey(due),
    dayCount:rule.dayCount,
    dayType:rule.dayType,
    includeStartDay:rule.includeStartDay,
    dueDateAdjustment:rule.dueDateAdjustment,
    calendarDaysElapsed:Math.round((due.getTime()-start.getTime())/86_400_000),
  };
}
