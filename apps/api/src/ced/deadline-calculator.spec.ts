import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateDeadline } from './deadline-calculator.js';

test('iş günü hesabı hafta sonunu ve onaylı tatil listesini atlar',()=>{
  const result=calculateDeadline('2026-11-06',{
    dayCount:2,dayType:'business_days',includeStartDay:false,dueDateAdjustment:'none',
    weekendDays:[0,6],holidayDates:['2026-11-09'],
  });
  assert.equal(result.deadlineDate,'2026-11-11');
  assert.equal(result.calendarDaysElapsed,5);
});

test('başlangıç gününün sayılıp sayılmaması açık kuraldır',()=>{
  const excluded=calculateDeadline('2026-11-02',{
    dayCount:3,dayType:'business_days',includeStartDay:false,dueDateAdjustment:'none',
    weekendDays:[0,6],holidayDates:[],
  });
  const included=calculateDeadline('2026-11-02',{
    dayCount:3,dayType:'business_days',includeStartDay:true,dueDateAdjustment:'none',
    weekendDays:[0,6],holidayDates:[],
  });
  assert.equal(excluded.deadlineDate,'2026-11-05');
  assert.equal(included.deadlineDate,'2026-11-04');
});

test('takvim gününde hafta sonuna gelen tarih bir sonraki iş gününe alınabilir',()=>{
  const result=calculateDeadline('2026-11-06',{
    dayCount:1,dayType:'calendar_days',includeStartDay:false,dueDateAdjustment:'next_business_day',
    weekendDays:[0,6],holidayDates:['2026-11-09'],
  });
  assert.equal(result.deadlineDate,'2026-11-10');
});

test('takvim gününde hafta sonuna gelen tarih önceki iş gününe alınabilir',()=>{
  const result=calculateDeadline('2026-11-06',{
    dayCount:1,dayType:'calendar_days',includeStartDay:false,dueDateAdjustment:'previous_business_day',
    weekendDays:[0,6],holidayDates:[],
  });
  assert.equal(result.deadlineDate,'2026-11-06');
});

test('artık yıl, tarih doğrulaması ve çalışma takvimi hataları güvenlidir',()=>{
  const leap=calculateDeadline('2028-02-28',{
    dayCount:1,dayType:'calendar_days',includeStartDay:false,dueDateAdjustment:'none',
    weekendDays:[],holidayDates:[],
  });
  assert.equal(leap.deadlineDate,'2028-02-29');
  assert.throws(()=>calculateDeadline('2026-02-30',{
    dayCount:1,dayType:'calendar_days',includeStartDay:false,dueDateAdjustment:'none',weekendDays:[],holidayDates:[],
  }),/geçerli bir gün/);
  assert.throws(()=>calculateDeadline('2026-11-06',{
    dayCount:3,dayType:'business_days',includeStartDay:false,dueDateAdjustment:'none',weekendDays:[],holidayDates:[],
  }),/çalışma dışı gün takvimi/);
  assert.throws(()=>calculateDeadline('2026-11-06',{
    dayCount:0,dayType:'calendar_days',includeStartDay:false,dueDateAdjustment:'none',weekendDays:[],holidayDates:[],
  }),/1 ile 3650/);
});
