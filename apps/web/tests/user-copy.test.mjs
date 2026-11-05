import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';

async function collectTsx(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = new URL(entry.isDirectory() ? `${entry.name}/` : entry.name, directory);
    if (entry.isDirectory()) files.push(...await collectTsx(next));
    else if (entry.isFile() && entry.name.endsWith('.tsx')) files.push(next);
  }
  return files;
}

test('giriş ve tüm çalışma ekranları kurumsal marka adını ve doğal ürün dilini kullanır', async () => {
  const appRoot = new URL('../app/', import.meta.url);
  const [source, workspace, componentFiles] = await Promise.all([
    readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8'),
    collectTsx(appRoot),
  ]);
  const allScreens = (await Promise.all(componentFiles.map(file => readFile(file, 'utf8')))).join('\n');
  const userInterface = source + workspace + allScreens;

  assert.match(userInterface, /E-posta veya kullanıcı adı/);
  assert.match(userInterface, /Giriş yap/);
  assert.match(workspace, /sidebar-caption">ENÇEV ENERJİ/);
  assert.match(source, /<footer className="auth-footer">ENÇEV ENERJİ<\/footer>/);
  assert.doesNotMatch(
    userInterface,
    /EnÇev Çevre Mühendisliği|<footer className="auth-footer">EnÇev<\/footer>/,
  );

  const prohibitedCopy = [
    'İşleriniz için tek bir merkez',
    'Güvenli çalışma alanınız',
    'Daha akıllı çalışın',
    'Verimliliğinizi artırın',
    'Her şey tek yerde',
    'Çalışma alanınız hazırlanıyor',
    'İşlerinizi bir üst seviyeye taşıyın',
    'Yapay zekâ destekli deneyim',
    'Yerel geliştirme',
    'İlk geliştirme aşaması',
  ];
  for (const phrase of prohibitedCopy) {
    assert.ok(!userInterface.includes(phrase), `User-facing copy must not contain: ${phrase}`);
  }
  assert.doesNotMatch(userInterface, /127\.0\.0\.1|PostgreSQL bağlantısı|API bağlantısı|\/api\/health\//i);
});
