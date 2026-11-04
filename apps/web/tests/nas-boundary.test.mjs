import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('Dilekçeler web akışı NAS/SMB erişiminden bağımsız kalır', async () => {
  const [component, policy, design, webPackage] = await Promise.all([
    read('../app/components/petitions-workspace.tsx'),
    read('../../../docs/SAFE_NAS_BOUNDARY.md'),
    read('../../../docs/PETITION_LOCK_OFFLINE_DESIGN.md'),
    read('../package.json'),
  ]);

  assert.match(policy, /NAS'a veya şirket paylaşımına bağlanamaz/);
  assert.match(policy, /açık ve ayrı bir yetki/);
  assert.match(design, /NAS paylaşımına bağlanmaz/);
  assert.match(design, /fiziksel olarak kilitlendiğini \*\*garanti etmez\*\*/);
  assert.match(design, /yardımcı servis kurulmaz, başlatılmaz veya paketlenmez/);

  assert.match(component, /indexedDB\.open/);
  assert.match(component, /downloadDocx\(record\.bytes,chosen\)/);
  assert.match(component, /Sunucuya veya şirket NAS'ına aktarılmaz/);
  assert.match(component, /Bu web sürümünde NAS erişimi kapalıdır/);
  assert.doesNotMatch(component, /fetch\(|smb:\/\/|file:\/\/|child_process|openfiles\.exe|NetFileEnum/i);
  assert.doesNotMatch(webPackage, /smb2|node-smb|child_process/);
});
