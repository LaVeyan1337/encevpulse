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


test('Sayfa geçişleri ve gerçek veri yükleme durumları ghost skeleton gösterir', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const skeletons = await readFile(new URL('../app/components/skeletons.tsx', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../app/motion.css', import.meta.url), 'utf8');
  const root = await readFile(new URL('../app/root.tsx', import.meta.url), 'utf8');

  assert.match(root, /import '\.\/motion\.css'/);
  assert.match(workspace, /workspace-page-enter/);
  assert.match(workspace, /<OverviewSkeleton \/>/);
  assert.match(workspace, /<TaskBoardSkeleton layout=\{layout\} \/>/);
  assert.match(workspace, /<TimelineSkeleton \/>/);
  assert.match(workspace, /<CommentListSkeleton \/>/);
  assert.match(skeletons, /aria-busy="true"/);
  assert.match(skeletons, /Görev panosu yükleniyor/);
  assert.match(skeletons, /Genel bakış yükleniyor/);
  assert.match(motion, /@keyframes pageSettle/);
  assert.match(motion, /@keyframes ghostSweep/);
  assert.match(motion, /@keyframes drawerSettle/);
  assert.match(motion, /prefers-reduced-motion:reduce/);
});


test('Projeler çalışma alanı gerçek liste, detay, üyelik ve yaşam döngüsü uçlarını kullanır', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const skeletons = await readFile(new URL('../app/components/skeletons.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/projects.css', import.meta.url), 'utf8');
  const root = await readFile(new URL('../app/root.tsx', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../api/src/tasks/tasks.controller.ts', import.meta.url), 'utf8');

  assert.match(workspace, /<span>Projeler<\/span>/);
  assert.match(workspace, /projects\?view=\$\{nextView\}/);
  assert.match(workspace, /projects\/\$\{projectId\}/);
  assert.match(workspace, /projects\/\$\{projectDetail\.project\.id\}/);
  assert.match(workspace, /project-detail-title/);
  assert.match(workspace, /aria-selected=\{projectTab === 'tasks'\}/);
  assert.match(workspace, /aria-selected=\{projectTab === 'members'\}/);
  assert.match(workspace, /memberIds: form\.getAll\('members'\)/);
  assert.match(workspace, /Projeyi arşivle/);
  assert.match(workspace, /Arşiv öncesi durum kaydı bulunmuyor/);
  assert.match(workspace, /restoreStatus: projectRestoreStatus/);
  assert.match(workspace, /Proje sahibi/);
  assert.match(skeletons, /ProjectGridSkeleton/);
  assert.match(skeletons, /ProjectDetailSkeleton/);
  assert.match(root, /import '\.\/projects\.css'/);
  assert.match(styles, /\.project-card/);
  assert.match(styles, /\.project-detail-hero/);
  assert.match(styles, /\.project-tabs/);
  assert.match(api, /@Get\('projects'\)/);
  assert.match(api, /@Patch\('projects:\/id'\)|@Patch\('projects\/:id'\)/);
  assert.match(api, /@Post\('projects\/:id\/archive'\)/);
  assert.match(api, /@Post\('projects\/:id\/restore'\)/);
});


test('Çalışan rehberi ve üç panelli sohbet gerçek API uçlarına bağlanır', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const people = await readFile(new URL('../app/components/people-directory.tsx', import.meta.url), 'utf8');
  const avatars = await readFile(new URL('../app/components/avatars.tsx', import.meta.url), 'utf8');
  const chat = await readFile(new URL('../app/components/chat-workspace.tsx', import.meta.url), 'utf8');
  const authService = await readFile(new URL('../../api/src/auth/auth.service.ts', import.meta.url), 'utf8');
  const authController = await readFile(new URL('../../api/src/auth/auth.controller.ts', import.meta.url), 'utf8');
  const chatController = await readFile(new URL('../../api/src/chat/chat.controller.ts', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../../drizzle/0006_people_and_chat.sql', import.meta.url), 'utf8');

  assert.match(workspace, /<PeopleDirectory/);
  assert.match(workspace, /<ChatWorkspace/);
  assert.match(workspace, /setChatStartUserId\(person.id\)/);
  assert.match(people, /Çalışan rehberi/);
  assert.match(people, /Meslek|Birim/);
  assert.match(people, /Sohbet/);
  assert.match(avatars, /avatar-/);
  assert.match(chat, /chat-rail/);
  assert.match(chat, /chat-thread/);
  assert.match(chat, /chat-context/);
  assert.match(chat, /chat\/conversations/);
  assert.match(chat, /chat\/messages/);
  assert.match(chat, /clientRequestId/);
  assert.match(chat, /create-task/);
  assert.match(chat, /conversation_member/);
  assert.match(authService, /job_title/);
  assert.match(authService, /department/);
  assert.match(authService, /avatar_key/);
  assert.match(authService, /updateUserProfile/);
  assert.match(authController, /@Get\('people'\)/);
  assert.match(authController, /@Get\('roles'\)/);
  assert.match(authController, /@Patch\('users\/:id\/profile'\)/);
  assert.match(chatController, /@Patch\('conversations\/:id\/members\/:userId\/role'\)/);
  assert.match(chatController, /@Post\('messages\/:id\/create-task'\)/);
  assert.match(migration, /CREATE TABLE conversations/);
  assert.match(migration, /CREATE TABLE messages/);
  assert.match(migration, /CREATE TABLE message_reactions/);
  assert.match(migration, /CREATE TABLE conversation_read_cursors/);
});
