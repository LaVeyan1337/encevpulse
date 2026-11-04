import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Dilekçeler web sürümü yalnızca tarayıcı içindeki DOCX şablonundan kopya üretir', async () => {
  const [component, styles, workspace, root] = await Promise.all([
    readFile(new URL('../app/components/petitions-workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/petitions.css', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/root.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(workspace, /<PetitionsWorkspace/);
  assert.match(workspace, /hasModulePermission\('petitions'\)/);
  assert.match(component, /indexedDB\.open/);
  assert.match(component, /MAX_TEMPLATE_BYTES/);
  assert.match(component, /new Blob\(\[record\.bytes\]/);
  assert.match(component, /Şablonun özgün baytları değiştirilmeden kopya olarak indirildi/);
  assert.match(component, /Tarayıcı verileri temizlenirse bu yerel kopya kaybolabilir/);
  assert.match(component, /https:\/\/raw\.githubusercontent\.com\/LaVeyan1337\/12312/);
  assert.doesNotMatch(component, /fetch\(/);
  assert.match(component, /Ortak Word kilidi ve bekleme sırası web’e aktarılmadı/);
  assert.match(styles, /\.petition-template-panel/);
  assert.match(root, /import '\.\/petitions\.css';/);
});
