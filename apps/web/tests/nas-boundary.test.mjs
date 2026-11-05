import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read=(path)=>readFile(new URL(path,import.meta.url),'utf8');

test('Dilekçeler NAS/SMB erişimi olmadan PULSE veritabanında çalışır',async()=>{
  const [component,policy,design,webPackage,apiService,apiController,migration]=await Promise.all([
    read('../app/components/petitions-workspace.tsx'),
    read('../../../docs/SAFE_NAS_BOUNDARY.md'),
    read('../../../docs/PETITION_LOCK_OFFLINE_DESIGN.md'),
    read('../package.json'),
    read('../../api/src/petitions/petitions.service.ts'),
    read('../../api/src/petitions/petitions.controller.ts'),
    read('../../../drizzle/0024_petition_docx_workflow.sql'),
  ]);

  assert.match(policy,/NAS'a veya şirket paylaşımına bağlanamaz/);
  assert.match(policy,/açık ve ayrı bir yetki/);
  assert.match(design,/NAS'tan bağımsız sonraki geliştirme/);
  assert.match(design,/fiziksel olarak kilitlendiğini garanti etmez/);
  assert.match(design,/yardımcı servis kurulmaz, başlatılmaz veya paketlenmez/);

  assert.match(component,/request\('petitions\/templates'\)/);
  assert.match(component,/request\('petitions\/documents\?/);
  assert.match(component,/PULSE veritabanında/);
  assert.doesNotMatch(component,/indexedDB|localStorage|192\.168\.1\.55|smb:\/\/|file:\/\/|child_process|openfiles\.exe|NetFileEnum|raw\.githubusercontent\.com/i);
  assert.doesNotMatch(webPackage,/smb2|node-smb|child_process/i);
  assert.match(apiService,/FROM petition_documents/);
  assert.match(apiService,/INSERT INTO petition_documents/);
  assert.match(apiController,/StreamableFile/);
  assert.doesNotMatch(apiService+apiController,/192\.168\.1\.55|\\\\[^\s]+|smb:\/\/|file:\/\/|child_process|openfiles\.exe|NetFileEnum/i);
  assert.match(migration,/content bytea NOT NULL/);
  assert.doesNotMatch(migration,/192\.168\.1\.55|smb:\/\/|file:\/\//i);
});
