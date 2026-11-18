import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Dilekçeler ortak Word şablonlarını ve proje bağlantılı belge akışını kullanır',async()=>{
  const [component,styles,workspace,root,migration,service,controller,guard]=await Promise.all([
    readFile(new URL('../app/components/petitions-workspace.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/petitions.css',import.meta.url),'utf8'),
    readFile(new URL('../app/components/workspace.tsx',import.meta.url),'utf8'),
    readFile(new URL('../app/root.tsx',import.meta.url),'utf8'),
    readFile(new URL('../../../drizzle/0024_petition_docx_workflow.sql',import.meta.url),'utf8'),
    readFile(new URL('../../api/src/petitions/petitions.service.ts',import.meta.url),'utf8'),
    readFile(new URL('../../api/src/petitions/petitions.controller.ts',import.meta.url),'utf8'),
    readFile(new URL('../../api/src/petitions/petition-upload.guard.ts',import.meta.url),'utf8'),
  ]);
  assert.match(workspace,/<PetitionsWorkspace/);
  assert.match(workspace,/canManageTemplates=\{hasModulePermission\('petitions','manage'\)\}/);
  assert.match(workspace,/request=\{request\}/);
  assert.match(component,/request\('petitions\/templates'\)/);
  assert.match(component,/request\('petitions\/documents\?status=active/);
  assert.match(component,/new FormData\(\)/);
  assert.match(component,/form\.append\('file',templateFile\)/);
  assert.match(component,/templateVersionId:selectedTemplate\.versionId/);
  assert.match(component,/fields:fieldValues/);
  assert.match(component,/Belge metin önizlemesi/);
  assert.match(component,/previewText/);
  assert.match(component,/api\/petitions\/documents\/.*\/download/);
  assert.match(component,/in_review/);
  assert.match(component,/approved/);
  assert.match(component,/sent/);
  assert.match(component,/Elektronik imza veya otomatik gönderim yapılmaz/);
  assert.doesNotMatch(component,/indexedDB|localStorage|raw\.githubusercontent\.com|SAMPLE_URL|Şablonun birebir kopyası/);
  assert.match(styles,/\.petition-template-upload/);
  assert.match(styles,/\.petition-fields-grid/);
  assert.match(styles,/\.petition-document-list/);
  assert.match(styles,/@media\(max-width:720px\)/);
  assert.match(root,/import '\.\/petitions\.css'/);
  assert.match(migration,/CREATE TABLE petition_template_versions/);
  assert.match(migration,/CREATE TABLE petition_documents/);
  assert.match(migration,/petition_document_audit_events_append_only/);
  assert.match(migration,/UPDATE app_modules SET is_enabled = true WHERE module_key = 'petitions'/);
  assert.match(service,/inspectDocxTemplate/);
  assert.match(service,/renderDocxTemplate/);
  assert.match(service,/INSTITUTION_NAME/);
  assert.match(service,/assertProjectAccess|p\.created_by=\$2/);
  assert.match(service,/PETITION_STATUS_TRANSITION_DENIED/);
  assert.match(service,/PETITION_DOCUMENT_VERSION_CONFLICT/);
  assert.match(controller,/@Get\('templates'\)/);
  assert.match(controller,/@Post\('templates'\)/);
  assert.match(controller,/@Post\('documents'\)/);
  assert.match(controller,/@Get\('documents\/:documentId\/download'\)/);
  assert.match(controller,/StreamableFile/);
  assert.match(guard,/authorizeRequest\(request,true,'multipart'\)/);
  assert.match(guard,/assertPermission\(user,'petitions','manage'\)/);
  assert.doesNotMatch(component,/192\.168\.1\.55|smb:\/\/|file:\/\//i);
});
