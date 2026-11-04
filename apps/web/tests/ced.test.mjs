import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('ÇED workspace exposes the five required document milestones and workflow panels', async () => {
  const [component, workspace, styles, migration, service] = await Promise.all([
    readFile(new URL('../app/components/ced-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/ced.css', import.meta.url), 'utf8'),
    readFile(new URL('../../../drizzle/0012_ced_process_tracking.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/ced/ced.service.ts', import.meta.url), 'utf8'),
  ]);
  for (const milestone of ['ÇBD YÜKLENDİ', 'PTD YÜKLENDİ', 'ÇED RAPORU YÜKLENDİ', 'NİHAİ RAPOR YÜKLENDİ', 'SON NİHAİ RAPOR YÜKLENDİ']) {
    assert.ok(component.includes(milestone), 'Missing milestone: ' + milestone);
  }
  for (const feature of ['Ara adım ekle', 'Kurum görüşleri', 'İDK toplantıları ve kararlar', 'sourceReference']) {
    assert.ok(component.includes(feature), 'Missing workflow feature: ' + feature);
  }
  assert.doesNotMatch(workspace, /<CedWorkspace/);
  assert.match(workspace, /projectTab === 'opinions'/);
  assert.match(workspace, /<InstitutionOpinionsWorkspace/);
  assert.match(workspace, /hasModulePermission\('eced'\)/);
  assert.match(styles, /\.ced-timeline/);
  assert.match(styles, /data-theme='light'/);
  assert.match(migration, /CREATE TABLE ced_cases/);
  assert.match(migration, /CREATE TABLE ced_case_stages/);
  assert.match(migration, /CREATE TABLE ced_documents/);
  assert.match(service, /calendarMilestones/);
  assert.match(service, /assertProjectAccess/);
});

test('calendar workspace distinguishes CED stages, institution deadlines and IDK meetings', async () => {
  const calendar = await readFile(new URL('../app/components/calendar-workspace.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../api/src/calendar/calendar.controller.ts', import.meta.url), 'utf8');
  assert.match(calendar, /project_ced_stage_due/);
  assert.match(calendar, /project_institution_opinion_due/);
  assert.match(calendar, /project_idk_meeting/);
  assert.match(api, /institution_opinions/);
});


test('Kurum Görüşleri ekranı ayrı yetkili listeyi ve proje kapsamını kullanır', async () => {
  const [component, workspace, controller, service, styles, brand] = await Promise.all([
    readFile(new URL('../app/components/institution-opinions-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/ced/ced.controller.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../api/src/ced/ced.service.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/institution-opinions.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/brand.css', import.meta.url), 'utf8'),
  ]);
  assert.match(controller, /@Get\('opinions'\)/);
  assert.match(controller, /institution_opinions', 'view'/);
  assert.match(service, /async listInstitutionOpinions/);
  assert.match(service, /project_members pm/);
  assert.match(service, /p\.status<>'archived'/);
  assert.match(component, /request\('ced\/opinions'\)/);
  assert.match(component, /mevzuattaki iş günü veya resmî tatil hesabı değildir/);
  assert.match(workspace, /hasModulePermission\('institution_opinions'\)/);
  assert.match(workspace, /projectTab === 'opinions'/);
  assert.doesNotMatch(workspace, /projectTab === 'ced'/);
  assert.match(styles, /\.opinions-table/);
  assert.match(styles, /border-strong/);
  assert.doesNotMatch(brand, /#c88f73|#a96f56|#b97e61/i);
  assert.match(brand, /--accent:#91a3ff/);
});
