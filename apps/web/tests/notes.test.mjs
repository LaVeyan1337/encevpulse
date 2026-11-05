import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Notlarım gerçek API kullanır ve her sorguyu oturum sahibine sınırlar',async()=>{
  const [component,workspace,service,controller,migration,root]=await Promise.all([
    read('../app/components/notes-workspace.tsx'),
    read('../app/components/workspace.tsx'),
    read('../../api/src/notes/notes.service.ts'),
    read('../../api/src/notes/notes.controller.ts'),
    read('../../../drizzle/0021_notes_and_module_activation.sql'),
    read('../app/root.tsx'),
  ]);
  assert.match(workspace,/import \{ NotesWorkspace \}/);
  assert.match(workspace,/section === 'notes' && hasModulePermission\('notes'\)/);
  assert.match(workspace,/<NotesWorkspace/);
  assert.match(component,/request\('notes\?view='/);
  assert.match(component,/request\('notes\//);
  assert.match(component,/Notlar yalnızca hesabınıza görünür/);
  assert.match(service,/WHERE n\.owner_user_id=\$1/);
  assert.match(service,/WHERE n\.id=\$1 AND n\.owner_user_id=\$2/);
  assert.match(service,/owner_user_id=\$2/);
  assert.match(service,/user_note_audit_events/);
  assert.match(service,/NOTE_VERSION_CONFLICT/);
  assert.match(controller,/this\.access\.assertPermission/);
  assert.match(migration,/CREATE TABLE user_notes/);
  assert.match(migration,/CREATE TABLE user_note_audit_events/);
  assert.match(root,/import '\.\/notes\.css'/);
  assert.doesNotMatch(component,/192\.168\.1\.55|smb:\/\/|file:\/\//i);
});
