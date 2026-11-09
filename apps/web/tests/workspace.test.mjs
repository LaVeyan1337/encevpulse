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
  assert.match(workspace, /due=\$\{dueFilter\}/);
  assert.match(workspace, /openAssignedTasks\(\{ due: 'overdue' \}\)/);
  assert.match(workspace, /openAssignedTasks\(\{ due: 'upcoming' \}\)/);
  assert.match(workspace, /openAssignedTasks\(\{ status: 'active' \}\)/);
  assert.match(workspace, /aria-label="Teslim tarihi filtresi"/);
  assert.match(workspace, /Takip ettiklerim/);
  assert.match(workspace, /name="followerIds"/);
  assert.match(workspace, /task-followers-section/);
  assert.match(workspace, /task.followed/);
  assert.match(workspace, /task.updated/);
  assert.match(workspace, /taskChangeSummary/);
  assert.match(workspace, /timeline-change-summary/);
  assert.match(workspace, /selected\.canManage/);
  assert.match(workspace, /name="attachments"/);
  assert.match(workspace, /tasks\/\$\{taskId\}\/attachments/);
  assert.match(workspace, /tasks\/attachments\/\$\{attachment\.id\}\/download/);
  assert.match(workspace, /removeTaskAttachment/);

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
  const migration = await readFile(new URL('../../../drizzle/0006_people_and_chat.sql', import.meta.url), 'utf8');

  assert.match(workspace, /<PeopleDirectory/);
  assert.match(workspace, /<ChatWorkspace/);
  assert.match(workspace, /hasModulePermission\('chat'\)/);
  assert.match(workspace, /if\(!snapshot\)return false/);
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


test('Çalışan rehberi gerçek kişi verisini kartlarda gösterir ve sohbet başlatır', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const directory = await readFile(new URL('../app/components/people-directory.tsx', import.meta.url), 'utf8');
  const avatars = await readFile(new URL('../app/components/avatars.tsx', import.meta.url), 'utf8');
  const admin = await readFile(new URL('../app/routes/home.tsx', import.meta.url), 'utf8');

  assert.match(workspace, /<PeopleDirectory/);
  assert.match(workspace, /<ChatWorkspace/);
  assert.match(workspace, /hasModulePermission\('chat'\)/);
  assert.match(workspace, /if\(!snapshot\)return false/);
  assert.match(workspace, /setChatStartUserId\(person\.id\)/);
  assert.match(directory, /Çalışan rehberi/);
  assert.match(directory, /Birim filtresi/);
  assert.match(directory, /onMessage\(person\)/);
  assert.match(directory, /jobTitle/);
  assert.match(directory, /department/);
  assert.match(avatars, /panda/);
  assert.match(avatars, /penguin/);
  assert.match(admin, /new-job-title/);
  assert.match(admin, /new-department/);
  assert.match(admin, /Sistem rolleri/);
  assert.match(admin, /users\/\$\{editingUserId\}\/profile/);
  assert.match(admin, /Rol \/ İşlem İzinleri/);
  assert.match(admin, /Modül Durumu/);
  assert.match(admin, /api\/auth\/permissions\//);
});

test('Sohbet ekranı kalıcı mesaj API akışlarını ve üç panelli yapıyı kullanır', async () => {
  const chat = await readFile(new URL('../app/components/chat-workspace.tsx', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../app/people-chat.css', import.meta.url), 'utf8');
  const motion = await readFile(new URL('../app/motion.css', import.meta.url), 'utf8');
  const api = await readFile(new URL('../../api/src/chat/chat.controller.ts', import.meta.url), 'utf8');

  assert.match(chat, /chat\/conversations/);
  assert.match(chat, /chat\/search\?q=/);
  assert.match(chat, /replyToId/);
  assert.match(chat, /reactions/);
  assert.match(chat, /create-task/);
  assert.match(chat, /Mesajdan görev/);
  assert.match(chat, /taskDraftAssigneeId/);
  assert.match(chat, /taskDraftProjectId/);
  assert.match(chat, /Gruptan ayrıl/);
  assert.match(chat, /Sohbet sahibi/);
  assert.match(chat, /members\/(?:\$\{member\.id\}|'\s*\+\s*member\.id\s*\+\s*')\/role/);
  assert.match(chat, /new EventSource\('\/api\/chat\/events'\)/);
  assert.match(chat, /conversation\.updated/);
  assert.match(chat, /15000/);
  assert.match(chat, /Gönderim başarısız/);
  assert.match(chat, /Sohbet ekleri ve aramalar erişim yetkisiyle korunur/);
  assert.match(styles, /grid-template-columns:268px minmax\(360px,1fr\) 264px/);
  assert.match(styles, /\.people-card/);
  assert.match(motion, /@media\(prefers-reduced-motion:reduce\)\{[\s\S]*?\.chat-message/);
  assert.match(api, /@Post\('conversations\/\:id\/messages'\)/);
  assert.match(api, /@Patch\('messages\/\:id'\)/);
  assert.match(api, /@Post\('messages\/\:id\/create-task'\)/);
  assert.match(api, /@Patch\('conversations\/\:id\/members\/\:userId\/role'\)/);
});


test('Üst bildirim menüsü sohbet bildirimini okuyup doğru konuşmayı açar', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../../api/src/tasks/tasks.service.ts', import.meta.url), 'utf8');
  assert.match(workspace, /eventType === 'chat\.message'/);
  assert.match(workspace, /hasModulePermission\('notifications'\)/);
  assert.match(service, /includeChat/);
  assert.match(service, /includeTasks/);
  assert.match(workspace, /hasModulePermission\('notifications','update'\)/);
  assert.match(workspace, /setChatStartConversationId\(notification\.conversationId\)/);
  assert.match(workspace, /initialConversationId=\{chatStartConversationId\}/);
  assert.match(workspace, /notification\.preview/);
  assert.match(service, /'chat\.message'::text AS "eventType"/);
  assert.match(service, /UPDATE chat_notifications cn SET read_at/);
});

test('Takvim çalışma alanı navigasyonda yalnızca modül izniyle görünür', async () => {
  const workspace = await readFile(new URL('../app/components/workspace.tsx', import.meta.url), 'utf8');
  assert.match(workspace, /hasModulePermission\('calendar'\)/);
  assert.match(workspace, /setSection\('calendar'\)/);
  assert.match(workspace, /Takvim &amp; Yasal Süreçler/);
});
