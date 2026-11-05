import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

test('giriş ekranı doğal ürün dili kullanır ve geliştirme tanılamalarını göstermez', async () => {
  const source = await readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8');
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const chat = await readFile(new URL('../app/components/chat-workspace.tsx', import.meta.url), 'utf8');
  const calendar = await readFile(new URL('../app/components/calendar-workspace.tsx', import.meta.url), 'utf8');
  const ced = await readFile(new URL('../app/components/ced-workspace.tsx', import.meta.url), 'utf8');
  const petitions = await readFile(new URL('../app/components/petitions-workspace.tsx', import.meta.url), 'utf8');
  const userInterface = source + workspace + chat + calendar + ced + petitions;

  assert.match(userInterface, /E-posta veya kullanıcı adı/);
  assert.match(userInterface, /Giriş yap/);
  assert.match(workspace, /sidebar-caption">ENÇEV ENERJİ</);
  assert.match(source, /auth-footer">ENÇEV ENERJİ</);
  assert.doesNotMatch(userInterface, /EnÇev Çevre Mühendisliği/);
  assert.doesNotMatch(
    userInterface,
    /İşleriniz için tek bir merkez|çalışma alanı hazırlanıyor|Yerel geliştirme|PostgreSQL|Kimlik sağlayıcısı yapılandırılmadı|İlk geliştirme aşaması|\/api\/health\/|Başvuru yolunu belirleyerek beş ana belge/,
  );
  assert.match(petitions, /Sunucuya veya şirket NAS'ına aktarılmaz/);
  assert.match(chat, /Sohbet ekleri ve aramalar erişim yetkisiyle korunur/);
});
