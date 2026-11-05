import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('giriş ekranı doğal ürün dili kullanır ve geliştirme tanılamalarını göstermez', async () => {
  const source = await readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const userInterface = source + workspace;

  assert.match(userInterface, /E-posta veya kullanıcı adı/);
  assert.match(userInterface, /Giriş yap/);
  assert.doesNotMatch(
    userInterface,
    /İşleriniz için tek bir merkez|çalışma alanı hazırlanıyor|Yerel geliştirme|PostgreSQL|Kimlik sağlayıcısı yapılandırılmadı|İlk geliştirme aşaması|\/api\/health\//,
  );
});
