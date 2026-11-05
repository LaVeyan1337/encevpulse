import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Dilekçeler web sürümü yalnızca tarayıcı içindeki DOCX şablonundan kopya üretir', async () => {
  const [component, styles, workspace, root, migration] = await Promise.all([
    readFile(new URL('../app/components/petitions-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/petitions.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/root.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../../drizzle/0021_notes_and_module_activation.sql', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /<PetitionsWorkspace/);
  assert.match(workspace, /hasModulePermission\('petitions'\)/);
  assert.match(component, /indexedDB\.open/);
  assert.match(component, /MAX_TEMPLATE_BYTES/);
  assert.match(component, /new Blob\(\[bytes\]/);
  assert.match(component, /Şablonun özgün baytları değiştirilmeden kopya olarak indirildi/);
  assert.match(component, /Tarayıcı verileri temizlenirse bu yerel kopya kaybolabilir/);
  assert.match(component, /https:\/\/raw\.githubusercontent\.com\/LaVeyan1337\/12312/);
  assert.doesNotMatch(component, /fetch\(/);
  assert.match(component, /globalThis\.crypto\?\.subtle/);
  assert.match(component, /digest\('SHA-256'/);
  assert.match(component, /record\.sha256&&actualHash&&record\.sha256!==actualHash/);
  assert.match(component, /async function downloadTemplateBackup/);
  assert.match(component, /Sablon_Yedegi_/);
  assert.match(component, /downloadDocx\(record\.bytes,chosen\)/);
  assert.match(styles, /\.petition-export-button/);
  assert.match(styles, /\.petition-template-buttons/);
  assert.doesNotMatch(component, /192\.168\.1\.55|file:\/\/|fetch\(/);
  assert.match(component, /Ortak Word kilidi ve bekleme sırası web’e aktarılmadı/);
  assert.match(styles, /\.petition-template-panel/);
  assert.match(root, /import '\.\/petitions\.css';/);
});
