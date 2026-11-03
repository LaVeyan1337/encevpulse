import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('Workspace arayüzü Genel Bakış, Görev Geçmişi, Kanban ve arama gereksinimlerini karşılar', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');

  // Scope D: Genel Bakış gerçek metrikleri
  assert.match(workspace, /Bana atanan görevler/);
  assert.match(workspace, /Açık görevler/);
  assert.match(workspace, /Geciken/);
  assert.match(workspace, /7 gün içinde teslim/);
  assert.match(workspace, /Tamamlanan/);
  assert.match(workspace, /Yaklaşan görevler/);
  assert.match(workspace, /Son hareketler/);

  // Scope C: Görev Geçmişi (Temel Görev Geçmişi)
  assert.match(workspace, /Temel Görev Geçmişi/);
  assert.match(workspace, /tasks\/\$\{selected\.id\}\/activity/);
  assert.match(workspace, /task-timeline/);

  // Scope B: Üst arama alanı ve navigasyon
  assert.match(workspace, /topbar-search/);
  assert.match(workspace, /Görevlerde ara…/);
  assert.match(workspace, /Parolamı değiştir/);

  // Scope C: Kanban ve Liste görünümü
  assert.match(workspace, /kanban-board/);
  assert.match(workspace, /draggable/);
  assert.match(workspace, /task-table/);
  assert.match(workspace, /Devam ediyor/);
  assert.match(workspace, /Bekliyor/);

  // Scope C: Görev yorumları ve kullanıcıya ait yorum kontrolleri
  assert.match(workspace, /task-comments-section/);
  assert.match(workspace, /Yorum gönder/);
  assert.match(workspace, /Düzenle/);
  assert.match(workspace, /Bu yorum silindi/);
  assert.match(workspace, /tasks\/\$\{selected\.id\}\/comments/);

  // Doğal dil kontrolü: yasaklı sloganlar ve teknik sızıntılar bulunmamalı
  assert.doesNotMatch(
    workspace,
    /İşleriniz için tek bir merkez|Daha akıllı çalışın|Verimliliğinizi artırın|Her şey tek yerde|Çalışma alanınız hazırlanıyor|İşlerinizi bir üst seviyeye taşıyın|Yapay zekâ destekli deneyim|PostgreSQL|Yerel geliştirme/,
  );
});


test('Glass workspace görsel katmanı uygulama kabuğuna bağlı ve temel yüzeylere uygulanır', async () => {
  const root = await readFile(new URL('../app/root.tsx', import.meta.url), 'utf8');
  const glass = await readFile(new URL('../app/bitrix-glass.css', import.meta.url), 'utf8');
  assert.match(root, /import '\.\/bitrix-glass\.css'/);
  assert.match(glass, /backdrop-filter:blur\(24px\)/);
  assert.match(glass, /\.workspace-sidebar/);
  assert.match(glass, /\.summary-card/);
  assert.match(glass, /\.kanban-column/);
  assert.match(glass, /data-theme='light'/);
  assert.match(glass, /@supports not/);
});
