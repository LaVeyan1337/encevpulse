import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('giriş ve çalışma alanı kurumsal marka adını ve doğal ürün dilini kullanır', async () => {
  const source = await readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const userInterface = source + workspace;

  assert.match(userInterface, /E-posta veya kullanıcı adı/);
  assert.match(userInterface, /Giriş yap/);
  assert.match(workspace, /sidebar-caption">ENÇEV ENERJİ/);
  assert.match(source, /<footer className="auth-footer">ENÇEV ENERJİ<\/footer>/);
  assert.doesNotMatch(
    userInterface,
    /EnÇev Çevre Mühendisliği|<footer className="auth-footer">EnÇev<\/footer>/,
  );
  assert.doesNotMatch(
    userInterface,
    /İşleriniz için tek bir merkez|Güvenli çalışma alanınız|Daha akıllı çalışın|Verimliliğinizi artırın|Her şey tek yerde|Çalışma alanınız hazırlanıyor|İşlerinizi bir üst seviyeye taşıyın|Yapay zekâ destekli deneyim|Yerel geliştirme|PostgreSQL|Kimlik sağlayıcısı yapılandırılmadı|İlk geliştirme aşaması|\/api\/health\//i,
  );
});
