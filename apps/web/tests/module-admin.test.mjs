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
  assert.match(page,/adminTab==='modules'/);
  assert.match(page,/PUT',credentials:'same-origin'/);
  assert.match(page,/blocked\\[moduleKey\\]/);
  assert.match(page,/drive:'Şirket dosya alanına erişim/);
  assert.match(page,/institution_guide:'Bağımsız kurum ekleme/);
  assert.match(page,/petitions:'Onaylı ortak şablon/);
  assert.match(controller,/@Put\\('modules\\/:moduleKey'\\)/);
  assert.match(controller,/this\\.assertSystemAdmin\\(user\\)/);
  assert.match(access,/CORE_MODULE_REQUIRED/);
  assert.match(access,/MODULE_NOT_READY/);
  for(const key of ['calendar','institution_opinions','eced','institution_guide','petitions','notes','settings']) {
    assert.match(activationMigration,new RegExp("'"+key+"'"));
    assert.match(activationMigration,/SET is_enabled = true/);
  }
  assert.match(notReadyMigration,/SET is_enabled = false/);
  assert.match(notReadyMigration,/institution_guide','petitions/);
  assert.ok(access.includes("const lockedOff=['drive','institution_guide','petitions'];"));
  assert.match(page,/petitions:'Mevcut taslak yalnızca tarayıcıda saklanan DOCX dosyasının değiştirilmemiş kopyasını indirir/);
  assert.doesNotMatch(activationMigration,/UPDATE app_modules[^;]*'drive'/);
  assert.match(access,/'drive'/);
  assert.match(workspace,/Sistem Yönetimi/);
  assert.match(workspace,/hasModulePermission\\('notes'\\)/);
});
