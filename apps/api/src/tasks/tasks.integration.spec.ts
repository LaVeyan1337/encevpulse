import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { ApplicationModule } from '../application.module.js';
import { PasswordHasher } from '../auth/password-hasher.js';

const ORIGIN = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
interface Client { cookie: string; csrf: string }

test('görev API: gerçek oturum, proje üyeliği, CRUD, sürüm ve arşiv yetkisi', async (t) => {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1', port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'encev_pulse_dev', user: process.env.DB_USER ?? 'encev_dev',
    password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 3000, application_name: 'encev-pulse-task-tests',
  });
  const suffix = randomBytes(5).toString('hex');
  const names = [`ta${suffix}`, `tb${suffix}`, `tc${suffix}`];
  const upcomingDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const overdueDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const hasher = new PasswordHasher();
  const hash = await hasher.hash('Yerel-Gorev-Test-Parolasi-2026!');
  const userIds: string[] = [];
  const taskIds: string[] = [];
  const projectIds: string[] = [];
  let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

  async function api(base: string, client: Client, path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${base}/api/${path}`, {
      method, headers: {
        Origin: ORIGIN, Cookie: client.cookie,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': client.csrf }),
      }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  }

  async function signIn(base: string, username: string): Promise<Client> {
    const challengeResponse = await fetch(`${base}/api/auth/csrf`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}' });
    const challenge = await challengeResponse.json() as { csrfToken: string };
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrfToken },
      body: JSON.stringify({ identifier: username, password: 'Yerel-Gorev-Test-Parolasi-2026!' }),
    });
    const result = await response.json() as { csrfToken: string };
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0], csrf: result.csrfToken };
  }

  try {
    const role = await pool.query<{ id: string }>("SELECT id FROM roles WHERE code = 'employee'");
    assert.ok(role.rowCount, 'Authentication migration must be applied before task tests.');
    for (const username of names) {
      const user = await pool.query<{ id: string }>(
        'INSERT INTO users (username,email,display_name,password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
        [username, `${username}@encev.com.tr`, `Task fixture ${username}`, hash],
      );
      userIds.push(user.rows[0].id);
      await pool.query('INSERT INTO user_role_assignments (user_id,role_id,assigned_by) VALUES ($1,$2,$1)', [userIds.at(-1), role.rows[0].id]);
    }
    app = await NestFactory.create(ApplicationModule, { logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const [alice, bob, outsider] = await Promise.all(names.map((name) => signIn(base, name)));

    await t.test('görev oluşturma ve kişisel erişim', async () => {
      const created = await api(base, alice, 'tasks', 'POST', {
        title: 'Yerel görev testi', description: 'fixture', assigneeId: userIds[0], priority: 'high', dueOn: upcomingDate,
      });
      assert.equal(created.response.status, 201);
      taskIds.push(created.data.task.id);
      const visible = await api(base, alice, 'tasks');
      assert.ok(visible.data.tasks.some((task: { id: string }) => task.id === created.data.task.id));
      const hidden = await api(base, outsider, `tasks/${created.data.task.id}`);
      assert.equal(hidden.response.status, 404);
      const noCsrf = await fetch(`${base}/api/tasks`, { method: 'POST', headers: { Origin: ORIGIN, Cookie: alice.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'CSRF yok' }) });
      assert.equal(noCsrf.status, 403);
      const overview = await api(base, alice, 'tasks/summary');
      assert.equal(overview.response.status, 200);
      assert.equal(overview.data.summary.open, 1);
      assert.equal(overview.data.summary.completed, 0);
      assert.equal(overview.data.summary.upcoming, 1);
      assert.equal(overview.data.summary.assignedTotal, 1);

      const specificActivity = await api(base, alice, `tasks/${created.data.task.id}/activity`);
      assert.equal(specificActivity.response.status, 200);
      assert.ok(specificActivity.data.activity.length >= 1);
      assert.equal(specificActivity.data.activity[0].action, 'created');

      const outsiderSpecificActivity = await api(base, outsider, `tasks/${created.data.task.id}/activity`);
      assert.equal(outsiderSpecificActivity.response.status, 404);
    });

    await t.test('Genel Bakış görev kısayolları tarih ve açık iş kapsamını doğru filtreler', async () => {
      const overdueTask = await api(base, alice, 'tasks', 'POST', {
        title: 'Geciken kişisel görev filtresi', assigneeId: userIds[0], dueOn: overdueDate,
      });
      assert.equal(overdueTask.response.status, 201);
      taskIds.push(overdueTask.data.task.id);

      const inProgressTask = await api(base, alice, 'tasks', 'POST', {
        title: 'Devam eden kişisel görev filtresi', assigneeId: userIds[0], status: 'in_progress',
      });
      assert.equal(inProgressTask.response.status, 201);
      taskIds.push(inProgressTask.data.task.id);

      const completedTask = await api(base, alice, 'tasks', 'POST', {
        title: 'Tamamlanmış kişisel görev filtresi', assigneeId: userIds[0], status: 'done',
      });
      assert.equal(completedTask.response.status, 201);
      taskIds.push(completedTask.data.task.id);

      const upcoming = await api(base, alice, 'tasks?view=assigned&due=upcoming');
      assert.ok(upcoming.data.tasks.some((task: { id: string }) => task.id === taskIds[0]));
      assert.ok(!upcoming.data.tasks.some((task: { id: string }) => task.id === overdueTask.data.task.id));

      const overdue = await api(base, alice, 'tasks?view=assigned&due=overdue');
      assert.ok(overdue.data.tasks.some((task: { id: string }) => task.id === overdueTask.data.task.id));
      assert.ok(!overdue.data.tasks.some((task: { id: string }) => task.id === taskIds[0]));

      const unfinished = await api(base, alice, 'tasks?view=assigned&status=active');
      assert.ok(unfinished.data.tasks.some((task: { id: string }) => task.id === taskIds[0]));
      assert.ok(unfinished.data.tasks.some((task: { id: string }) => task.id === inProgressTask.data.task.id));
      assert.ok(!unfinished.data.tasks.some((task: { id: string }) => task.id === completedTask.data.task.id));

      const invalidDue = await api(base, alice, 'tasks?view=assigned&due=next-month');
      assert.equal(invalidDue.response.status, 400);
    });

    await t.test('proje üyeliği ve sorumlu görünürlüğü', async () => {
      const projectResult = await api(base, alice, 'tasks/projects', 'POST', { name: 'Task fixture project', memberIds: [userIds[1]] });
      assert.equal(projectResult.response.status, 201);
      const projectId = projectResult.data.project.id as string;
      projectIds.push(projectId);
      const created = await api(base, alice, 'tasks', 'POST', { title: 'Üyeye atanan görev', assigneeId: userIds[1], projectId });
      assert.equal(created.response.status, 201);
      taskIds.push(created.data.task.id);
      const visible = await api(base, bob, 'tasks');
      assert.ok(visible.data.tasks.some((task: { id: string }) => task.id === created.data.task.id));
      const inbox = await api(base, bob, 'notifications');
      assert.equal(inbox.data.unreadCount, 1);
      assert.equal(inbox.data.notifications[0].taskId, created.data.task.id);
      const aliceInbox = await api(base, alice, 'notifications');
      assert.equal(aliceInbox.data.unreadCount, 0);
      const outsiderInbox = await api(base, outsider, 'notifications');
      assert.equal(outsiderInbox.data.unreadCount, 0);
      assert.equal(outsiderInbox.data.notifications.length, 0);
      const activity = await api(base, alice, 'tasks/activity');
      assert.ok(activity.data.activity.some((item: { taskId: string; action: string }) => item.taskId === created.data.task.id && item.action === 'created'));
      const hiddenActivity = await api(base, outsider, 'tasks/activity');
      assert.equal(hiddenActivity.data.activity.length, 0);
      const cannotReadOthersNotification = await api(base, alice, `notifications/${inbox.data.notifications[0].id}/read`, 'POST', {});
      assert.equal(cannotReadOthersNotification.response.status, 404);
      const read = await api(base, bob, `notifications/${inbox.data.notifications[0].id}/read`, 'POST', {});
      assert.equal(read.response.status, 204);
      const readInbox = await api(base, bob, 'notifications');
      assert.equal(readInbox.data.unreadCount, 0);
      const outsidersCannotJoin = await api(base, outsider, 'tasks', 'POST', { title: 'Yetkisiz proje görevi', assigneeId: userIds[2], projectId });
      assert.equal(outsidersCannotJoin.response.status, 403);
      const firstPage = await api(base, alice, 'tasks?view=all&limit=1&offset=0');
      assert.equal(firstPage.data.tasks.length, 1);
      assert.equal(firstPage.data.page.hasMore, true);
      const secondPage = await api(base, alice, 'tasks?view=all&limit=1&offset=1');
      assert.equal(secondPage.data.tasks.length, 1);
      assert.equal(secondPage.data.page.hasMore, false);
      const highPriority = await api(base, alice, 'tasks?view=all&priority=high');
      assert.ok(highPriority.data.tasks.some((task: { id: string }) => task.id === taskIds[0]));
      const search = await api(base, alice, 'tasks?view=all&q=yerel%20g%C3%B6rev');
      assert.ok(search.data.tasks.some((task: { id: string }) => task.id === taskIds[0]));
      const invalidPage = await api(base, alice, 'tasks?view=all&limit=201');
      assert.equal(invalidPage.response.status, 400);
    });

    await t.test('proje çalışma alanı: detay, durum, tarih, üyelik, sürüm ve arşiv', async () => {
      const created = await api(base, alice, 'projects', 'POST', {
        name: 'Project workspace fixture',
        description: 'Project detail integration coverage',
        status: 'planning',
        startsOn: '2026-11-04',
        targetOn: '2026-12-31',
        memberIds: [userIds[1]],
      });
      assert.equal(created.response.status, 201, JSON.stringify(created.data));
      const projectId = created.data.project.id as string;
      projectIds.push(projectId);
      assert.equal(created.data.project.ownerId, userIds[0]);
      assert.equal(created.data.project.startsOn, '2026-11-04');
      assert.equal(created.data.project.targetOn, '2026-12-31');

      const detail = await api(base, alice, `projects/${projectId}`);
      assert.equal(detail.response.status, 200);
      assert.equal(detail.data.project.status, 'planning');
      assert.equal(detail.data.members.length, 2);
      assert.ok(detail.data.members.some((member: { id: string; isOwner: boolean }) => member.id === userIds[0] && member.isOwner));
      assert.ok(detail.data.activity.some((event: { eventType: string }) => event.eventType === 'created'));

      const hidden = await api(base, outsider, `projects/${projectId}`);
      assert.equal(hidden.response.status, 404);

      const updated = await api(base, alice, `projects/${projectId}`, 'PATCH', {
        version: detail.data.project.version,
        name: 'Project workspace revised',
        status: 'active',
        memberIds: [userIds[2]],
      });
      assert.equal(updated.response.status, 200, JSON.stringify(updated.data));
      assert.equal(updated.data.project.name, 'Project workspace revised');
      assert.equal(updated.data.project.status, 'active');
      assert.equal(updated.data.members.length, 2);
      assert.ok(updated.data.members.some((member: { id: string }) => member.id === userIds[2]));

      const stale = await api(base, alice, `projects/${projectId}`, 'PATCH', {
        version: detail.data.project.version,
        name: 'Stale overwrite',
      });
      assert.equal(stale.response.status, 409);

      const removedMember = await api(base, bob, `projects/${projectId}`);
      assert.equal(removedMember.response.status, 404);
      const newMember = await api(base, outsider, `projects/${projectId}`, 'PATCH', {
        version: updated.data.project.version,
        description: 'Unauthorized metadata edit',
      });
      assert.equal(newMember.response.status, 403);

      const activeList = await api(base, alice, 'projects');
      assert.ok(activeList.data.projects.some((project: { id: string }) => project.id === projectId));
      const archived = await api(base, alice, `projects/${projectId}/archive`, 'POST', { version: updated.data.project.version });
      assert.equal(archived.response.status, 204);
      const hiddenFromActive = await api(base, alice, 'projects');
      assert.ok(!hiddenFromActive.data.projects.some((project: { id: string }) => project.id === projectId));
      const archivedList = await api(base, alice, 'projects?view=archived');
      assert.ok(archivedList.data.projects.some((project: { id: string }) => project.id === projectId));

      const restored = await api(base, alice, `projects/${projectId}/restore`, 'POST', { version: updated.data.project.version + 1 });
      assert.equal(restored.response.status, 204);
      const restoredDetail = await api(base, alice, `projects/${projectId}`);
      assert.equal(restoredDetail.response.status, 200);
      assert.equal(restoredDetail.data.project.status, 'active');
      assert.ok(restoredDetail.data.activity.some((event: { eventType: string }) => event.eventType === 'restored'));

      const archivedAgain = await api(base, alice, `projects/${projectId}/archive`, 'POST', {
        version: restoredDetail.data.project.version,
      });
      assert.equal(archivedAgain.response.status, 204);
      const legacyDetail = await api(base, alice, `projects/${projectId}`);
      assert.equal(legacyDetail.data.project.statusBeforeArchive, 'active');

      // Simulate a legacy archived row that predates status_before_archive.
      await pool.query('UPDATE projects SET status_before_archive = NULL WHERE id = $1', [projectId]);
      const noRestoreChoice = await api(base, alice, `projects/${projectId}/restore`, 'POST', {
        version: legacyDetail.data.project.version,
      });
      assert.equal(noRestoreChoice.response.status, 400);

      const explicitRestore = await api(base, alice, `projects/${projectId}/restore`, 'POST', {
        version: legacyDetail.data.project.version,
        restoreStatus: 'on_hold',
      });
      assert.equal(explicitRestore.response.status, 204);
      const restoredLegacy = await api(base, alice, `projects/${projectId}`);
      assert.equal(restoredLegacy.data.project.status, 'on_hold');
    });

    await t.test('görev yorumları: yetki, düzenleme, silme, sürüm ve bildirim', async () => {
      const taskResult = await api(base, alice, 'tasks', 'POST', {
        title: 'Comment fixture task', assigneeId: userIds[1],
      });
      assert.equal(taskResult.response.status, 201);
      const taskId = taskResult.data.task.id as string;
      taskIds.push(taskId);

      const created = await api(base, bob, `tasks/${taskId}/comments`, 'POST', { body: 'İlk görev yorumu' });
      assert.equal(created.response.status, 201, JSON.stringify(created.data));
      assert.equal(created.data.comment.authorName, `Task fixture ${names[1]}`);
      assert.equal(created.data.comment.version, 1);

      const outsiderRead = await api(base, outsider, `tasks/${taskId}/comments`);
      assert.equal(outsiderRead.response.status, 404);
      const otherUserEdit = await api(base, alice, `tasks/${taskId}/comments/${created.data.comment.id}`, 'PATCH', {
        body: 'Başkasının yorumu', version: 1,
      });
      assert.equal(otherUserEdit.response.status, 403);

      const edited = await api(base, bob, `tasks/${taskId}/comments/${created.data.comment.id}`, 'PATCH', {
        body: 'Düzenlenmiş görev yorumu', version: 1,
      });
      assert.equal(edited.response.status, 200);
      assert.equal(edited.data.comment.body, 'Düzenlenmiş görev yorumu');
      assert.equal(edited.data.comment.version, 2);

      const staleDelete = await api(base, bob, `tasks/${taskId}/comments/${created.data.comment.id}`, 'DELETE', { version: 1 });
      assert.equal(staleDelete.response.status, 409);

      const deleted = await api(base, bob, `tasks/${taskId}/comments/${created.data.comment.id}`, 'DELETE', { version: 2 });
      assert.equal(deleted.response.status, 204);
      const listed = await api(base, alice, `tasks/${taskId}/comments`);
      assert.equal(listed.response.status, 200);
      assert.equal(listed.data.comments.length, 1);
      assert.equal(listed.data.comments[0].body, '');
      assert.ok(listed.data.comments[0].deletedAt);

      const inbox = await api(base, alice, 'notifications');
      assert.ok(inbox.data.notifications.some((notification: { taskId: string; eventType: string }) =>
        notification.taskId === taskId && notification.eventType === 'task.comment',
      ));
    });

    await t.test('sürüm çakışması, durum güncelleme, arşiv ve geri yükleme', async () => {
      const taskId = taskIds[0];
      const initial = await api(base, alice, `tasks/${taskId}`);
      const changed = await api(base, alice, `tasks/${taskId}`, 'PATCH', { version: initial.data.task.version, status: 'in_progress' });
      assert.equal(changed.response.status, 200);
      const stale = await api(base, alice, `tasks/${taskId}`, 'PATCH', { version: initial.data.task.version, title: 'Eski sürüm' });
      assert.equal(stale.response.status, 409);
      const archived = await api(base, alice, `tasks/${taskId}/archive`, 'POST', { version: changed.data.task.version });
      assert.equal(archived.response.status, 204);
      const hidden = await api(base, alice, 'tasks');
      assert.ok(!hidden.data.tasks.some((task: { id: string }) => task.id === taskId));
      const listed = await api(base, alice, 'tasks?view=archived');
      assert.ok(listed.data.tasks.some((task: { id: string }) => task.id === taskId));
      const restored = await api(base, alice, `tasks/${taskId}/restore`, 'POST', { version: changed.data.task.version + 1 });
      assert.equal(restored.response.status, 204);
    });

    await t.test('tarih ve metin doğrulaması', async () => {
      const invalidDate = await api(base, alice, 'tasks', 'POST', { title: 'Hatalı tarih', startsOn: '2026-12-02', dueOn: '2026-12-01' });
      assert.equal(invalidDate.response.status, 400);
      const invalidTitle = await api(base, alice, 'tasks', 'POST', { title: '   ' });
      assert.equal(invalidTitle.response.status, 400);
    });
  } finally {
    if (app) await app.close();
    if (userIds.length) {
      const cleanup = await pool.connect();
      try {
        await cleanup.query('BEGIN');
        await cleanup.query('ALTER TABLE task_audit_events DISABLE TRIGGER task_audit_events_append_only');
        await cleanup.query('ALTER TABLE task_comment_events DISABLE TRIGGER task_comment_events_append_only');
        await cleanup.query('ALTER TABLE project_audit_events DISABLE TRIGGER project_audit_events_append_only');
        await cleanup.query('DELETE FROM notifications WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('DELETE FROM task_comment_events WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('DELETE FROM task_comments WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('DELETE FROM task_audit_events WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('DELETE FROM ced_institution_opinions WHERE project_id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM project_audit_events WHERE project_id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM project_members WHERE project_id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM auth_audit_events WHERE actor_user_id = ANY($1::uuid[]) OR target_user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('ALTER TABLE task_comment_events ENABLE TRIGGER task_comment_events_append_only');
        await cleanup.query('ALTER TABLE task_audit_events ENABLE TRIGGER task_audit_events_append_only');
        await cleanup.query('ALTER TABLE project_audit_events ENABLE TRIGGER project_audit_events_append_only');
        await cleanup.query('COMMIT');
      } catch (error) {
        await cleanup.query('ROLLBACK');
        throw error;
      } finally { cleanup.release(); }
    }
    await pool.end();
  }
});
