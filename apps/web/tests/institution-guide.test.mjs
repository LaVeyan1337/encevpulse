import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Kurum Rehberi bağımsız, kaynak izli ve yetki kontrollü CRUD akışına sahiptir',async()=>{
  const [component,workspace,controller,service,activationMigration,disableMigration,directoryMigration,root,styles]=await Promise.all([
    read('../app/components/institution-guide-workspace.tsx'),
    read('../app/components/workspace.tsx'),
    read('../../api/src/ced/ced.controller.ts'),
    read('../../api/src/ced/ced.service.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../../../drizzle/0022_disable_incomplete_modules.sql'),
    read('../../../drizzle/0023_institution_directory_crud.sql'),
    read('../app/root.tsx'),
    read('../app/institution-guide.css'),
  ]);

  assert.match(workspace,/import \{ InstitutionGuideWorkspace \}/);
  assert.match(workspace,/section === 'institution_guide' && hasModulePermission\('institution_guide'\)/);
  assert.ok(workspace.includes("canCreate={hasModulePermission('institution_guide','create')}"));
  assert.ok(workspace.includes("canUpdate={hasModulePermission('institution_guide','update')}"));
  assert.ok(workspace.includes("canDelete={hasModulePermission('institution_guide','delete')}"));
  assert.ok(component.includes("request('ced/directory')"));
  assert.ok(component.includes("'ced/directory'"));
  assert.ok(component.includes("editing?'PATCH':'POST'"));
  assert.ok(component.includes("'DELETE'"));
  assert.ok(component.includes('expectedVersion:editing.version'));
  assert.ok(component.includes('contact.sourceLabel'));
  assert.ok(component.includes('contact.sourceReference'));
  assert.ok(component.includes('contact.verifiedAt'));
  assert.ok(component.includes('contact.directoryVisible'));
  assert.ok(component.includes('Teyit bekliyor'));
  assert.ok(component.includes('Kaynağı teyit et ve rehbere aktar'));
  assert.ok(component.includes('Kurum Görüşleri formundan gelen iletişim bilgileri'));
  assert.match(component,/Kayıt kaynağı/);
  assert.match(component,/otomatik doğrulamaz/);
  assert.match(component,/Arşivle/);

  assert.match(controller,/@Get\('directory'\)/);
  assert.match(controller,/@Post\('directory'\)/);
  assert.match(controller,/@Patch\('directory\/:contactId'\)/);
  assert.match(controller,/@Delete\('directory\/:contactId'\)/);
  assert.match(controller,/authorize\(request,'institution_guide','view'\)/);
  assert.match(controller,/authorize\(request,'institution_guide','create',true\)/);
  assert.match(controller,/authorize\(request,'institution_guide','update',true\)/);
  assert.match(controller,/authorize\(request,'institution_guide','delete',true\)/);

  assert.match(service,/contact\.directory_visible AS "directoryVisible"/);
  assert.match(service,/opinion\.contact_id=contact\.id/);
  assert.match(service,/directory_visible=true/);
  assert.match(service,/promoted_from_opinion/);
  assert.match(service,/await this\.assertProjectAccess\(client,linked\.rows\[0\]\.projectId,user\.id,true\)/);
  assert.match(service,/async createDirectoryContact/);
  assert.match(service,/async updateDirectoryContact/);
  assert.match(service,/async archiveDirectoryContact/);
  assert.match(service,/institution_directory_audit_events/);
  assert.match(service,/INSTITUTION_CONTACT_VERSION_CONFLICT/);
  assert.match(service,/function validateDirectoryContact/);
  assert.match(service,/url\.protocol/);
  assert.match(service,/if \(!contact\.directory_visible\)/);

  assert.match(directoryMigration,/directory_visible boolean NOT NULL DEFAULT false/);
  assert.match(directoryMigration,/source_label text NOT NULL/);
  assert.match(directoryMigration,/source_reference text NOT NULL/);
  assert.match(directoryMigration,/source_verified_at date/);
  assert.match(directoryMigration,/version integer NOT NULL DEFAULT 1/);
  assert.match(directoryMigration,/CREATE UNIQUE INDEX institution_directory_unique_contact/);
  assert.match(directoryMigration,/institution_directory_audit_events_append_only/);
  assert.match(directoryMigration,/UPDATE app_modules SET is_enabled = true WHERE module_key = 'institution_guide'/);
  assert.match(directoryMigration,/\('employee','institution_guide','view'\)/);
  assert.match(directoryMigration,/\('process_owner','institution_guide','create'\)/);
  assert.match(directoryMigration,/\('document_steward','institution_guide','delete'\)/);
  assert.match(disableMigration,/institution_guide/);
  assert.match(activationMigration,/institution_guide/);
  assert.match(root,/import '\.\/institution-guide\.css'/);
  assert.match(styles,/\.institution-guide-editor/);
  assert.match(styles,/\.institution-guide-form-grid/);
  assert.doesNotMatch(component,/192\.168\.1\.55|smb:\/\/|file:\/\//i);
});
