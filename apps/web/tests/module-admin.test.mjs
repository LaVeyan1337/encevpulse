import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Sistem yönetimi tamamlanmamış Drive modülünü kapalı tutar; Dilekçeler etkin ve yetki kontrollüdür',async()=>{
  const [page,controller,access,activationMigration,notReadyMigration,directoryMigration,petitionMigration,workspace]=await Promise.all([
    read('../app/routes/home.tsx'),
    read('../../api/src/auth/auth.controller.ts'),
    read('../../api/src/access-control/access-control.service.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../../../drizzle/0022_disable_incomplete_modules.sql'),
    read('../../../drizzle/0023_institution_directory_crud.sql'),
    read('../../../drizzle/0024_petition_docx_workflow.sql'),
    read('../app/components/workspace.tsx'),
  ]);
  assert.ok(page.includes("adminTab==='modules'"));
  assert.ok(page.includes("PUT',credentials:'same-origin'"));
  assert.ok(page.includes('blocked[moduleKey]'));
  assert.ok(page.includes("drive:'Şirket dosya alanına erişim"));
  assert.ok(page.includes("institution_guide:'Kurum kayıtları manuel kaynak bilgisiyle tutulur"));
  assert.ok(controller.includes("@Put('modules/:moduleKey')"));
  assert.ok(controller.includes('this.assertSystemAdmin(user)'));
  assert.ok(access.includes('CORE_MODULE_REQUIRED'));
  assert.ok(access.includes('MODULE_NOT_READY'));
  for(const key of ['calendar','institution_opinions','eced','institution_guide','petitions','notes','settings']) {
    assert.ok(activationMigration.includes("'"+key+"'"));
    assert.ok(activationMigration.includes('SET is_enabled = true'));
  }
  assert.ok(notReadyMigration.includes('SET is_enabled = false'));
  assert.ok(notReadyMigration.includes("institution_guide','petitions"));
  assert.ok(directoryMigration.includes("UPDATE app_modules SET is_enabled = true WHERE module_key = 'institution_guide'"));
  assert.ok(directoryMigration.includes("('employee','institution_guide','view')"));
  assert.ok(directoryMigration.includes("('process_owner','institution_guide','create')"));
  assert.ok(access.includes("const lockedOff=['drive'];"));
  assert.ok(petitionMigration.includes("UPDATE app_modules SET is_enabled = true WHERE module_key = 'petitions'"));
  assert.ok(petitionMigration.includes("('employee','petitions','create')"));
  assert.ok(petitionMigration.includes("('process_owner','petitions','manage')"));
  assert.ok(!/UPDATE app_modules[^;]*'drive'/.test(activationMigration));
  assert.ok(access.includes("'drive'"));
  assert.ok(workspace.includes('Sistem Yönetimi'));
  assert.ok(workspace.includes("hasModulePermission('notes')"));
});
