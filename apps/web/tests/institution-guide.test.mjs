import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Kurum Rehberi ayrı, salt-okunur ve proje erişimiyle sınırlandırılmıştır',async()=>{
  const [component,workspace,controller,service,migration,root,styles]=await Promise.all([
    read('../app/components/institution-guide-workspace.tsx'),
    read('../app/components/workspace.tsx'),
    read('../../api/src/ced/ced.controller.ts'),
    read('../../api/src/ced/ced.service.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../app/root.tsx'),
    read('../app/institution-guide.css'),
  ]);
  assert.match(workspace,/import \{ InstitutionGuideWorkspace \}/);
  assert.match(workspace,/section === 'institution_guide' && hasModulePermission\('institution_guide'\)/);
  assert.match(workspace,/<InstitutionGuideWorkspace/);
  assert.match(workspace,/hasModulePermission\('institution_guide'\)/);
  assert.ok(component.includes("request('ced/contacts')"));
  assert.ok(component.includes('contact.institutionName'));
  assert.ok(component.includes('contact.contactPerson'));
  assert.ok(component.includes('contact.department'));
  assert.ok(component.includes('contact.email'));
  assert.ok(component.includes('contact.phone'));

  assert.match(component,/mailto:/);
  assert.match(component,/tel:/);
  assert.match(component,/Kurum Görüşleri/);
  assert.match(controller,/hasPermission\(user,'institution_guide','view'\)/);
  assert.match(controller,/hasPermission\(user,'institution_opinions','view'\)/);
  assert.match(service,/JOIN ced_institution_opinions opinion ON opinion\.contact_id=contact\.id/);
  assert.match(service,/p\.created_by=\$1 OR p\.owner_user_id=\$1 OR EXISTS/);
  assert.match(migration,/UPDATE app_modules/);
  assert.match(migration,/institution_guide/);
  assert.match(migration,/SELECT r\.id,'institution_guide','view'/);
  assert.match(root,/import '\.\/institution-guide\.css'/);
  assert.match(styles,/\.institution-guide-grid/);
  assert.doesNotMatch(component,/192\.168\.1\.55|smb:\/\/|file:\/\//i);
});
