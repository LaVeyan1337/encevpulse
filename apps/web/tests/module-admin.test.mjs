import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Sistem yönetimi hazır modülleri yönetir; NAS bağlantısı kapalı tutulur',async()=>{
  const [page,controller,access,migration,workspace]=await Promise.all([
    read('../app/routes/home.tsx'),
    read('../../api/src/auth/auth.controller.ts'),
    read('../../api/src/access-control/access-control.service.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../app/components/workspace.tsx'),
  ]);
  assert.match(page,/adminTab==='modules'/);
  assert.match(page,/PUT',credentials:'same-origin'/);
  assert.match(page,/blocked\[moduleKey\]/);
  assert.match(page,/drive:'Ortak Drive/);
  assert.match(controller,/@Put\('modules\/:moduleKey'\)/);
  assert.match(controller,/this\.assertSystemAdmin\(user\)/);
  assert.match(access,/CORE_MODULE_REQUIRED/);
  assert.match(access,/MODULE_NOT_READY/);
  for(const key of ['calendar','institution_opinions','eced','institution_guide','petitions','notes','settings']) {
    assert.match(migration,new RegExp("'"+key+"'"));
    assert.match(migration,/SET is_enabled = true/);
  }
  assert.match(migration,/institution_guide/);
  assert.ok(access.includes("const lockedOff=['drive'];"));
  assert.match(migration,/calendar','institution_opinions','eced','institution_guide','petitions','notes','settings/);
  assert.match(page,/petitions:'Etkin: tarayıcıda DOCX şablonu saklama/);
  for(const key of ['drive']) {
    assert.doesNotMatch(migration,new RegExp("UPDATE app_modules[^;]*"+key));
    assert.match(access,new RegExp("'"+key+"'"));
  }
  assert.match(workspace,/Sistem Yönetimi/);
  assert.match(workspace,/hasModulePermission\('notes'\)/);
});
