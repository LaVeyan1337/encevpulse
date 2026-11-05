import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Sistem yönetimi hazır modülleri yönetir; tamamlanmamış modüller kapalı ve kilitlidir',async()=>{
  const [page,controller,access,activationMigration,notReadyMigration,workspace]=await Promise.all([
    read('../app/routes/home.tsx'),
    read('../../api/src/auth/auth.controller.ts'),
    read('../../api/src/access-control/access-control.service.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../../../drizzle/0022_disable_incomplete_modules.sql'),
    read('../app/components/workspace.tsx'),
  ]);
  assert.ok(page.includes("adminTab==='modules'"));
  assert.ok(page.includes("PUT',credentials:'same-origin'"));
  assert.ok(page.includes('blocked[moduleKey]'));
  assert.ok(page.includes("drive:'Şirket dosya alanına erişim"));
  assert.ok(page.includes("institution_guide:'Bağımsız kurum ekleme"));
  assert.ok(page.includes("petitions:'Onaylı ortak şablon"));
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
  assert.ok(access.includes("const lockedOff=['drive','institution_guide','petitions'];"));
  assert.ok(page.includes("petitions:'Mevcut taslak yalnızca tarayıcıda saklanan DOCX dosyasının değiştirilmemiş kopyasını indirir"));
  assert.ok(!/UPDATE app_modules[^;]*'drive'/.test(activationMigration));
  assert.ok(access.includes("'drive'"));
  assert.ok(workspace.includes('Sistem Yönetimi'));
  assert.ok(workspace.includes("hasModulePermission('notes')"));
});
