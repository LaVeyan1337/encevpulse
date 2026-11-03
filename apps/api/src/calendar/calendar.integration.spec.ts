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

test('takvim API: kişisel, ortak ve proje etkinlikleri; kapsam, tarih izdüşümleri ve sürüm denetimi', async () => {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'encev_pulse_dev',
    user: process.env.DB_USER ?? 'encev_dev',
    password: process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 3000,
    application_name: 'encev-pulse-calendar-tests',
  });
  const suffix = randomBytes(5).toString('hex');
  const names = [`ca${suffix}`, `cb${suffix}`, `cc${suffix}`];
  const hasher = new PasswordHasher();
  const hash = await hasher.hash('Yerel-Takvim-Test-Parolasi-2026!');
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const taskIds: string[] = [];
  const eventIds: string[] = [];
  let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

  async function api(base: string, client: Client, path: string, method = 'GET', body?: unknown) {
    const response = await fetch(`${base}/api/${path}`, {
      method,
      headers: {
        Origin: ORIGIN,
        Cookie: client.cookie,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-Token': client.csrf }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  }

  async function signIn(base: string, username: string): Promise<Client> {
    const challengeResponse = await fetch(`${base}/api/auth/csrf`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: '{}',
    });
    const challenge = await challengeResponse.json() as { csrfToken: string };
    const response = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrfToken },
      body: JSON.stringify({ identifier: username, password: 'Yerel-Takvim-Test-Parolasi-2026!' }),
    });
    const result = await response.json() as { csrfToken: string };
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0], csrf: result.csrfToken };
  }

  try {
    const roles = await pool.query<{ id: string; code: string }>(
      "SELECT id,code FROM roles WHERE code = ANY($1::text[])",
      [['project_manager','employee']],
    );
    const roleByCode = new Map(roles.rows.map((row) => [row.code, row.id]));
    assert.ok(roleByCode.has('project_manager'));
    assert.ok(roleByCode.has('employee'));
    for (const username of names) {
      const user = await pool.query<{ id: string }>(
        'INSERT INTO users (username,email,display_name,password_hash) VALUES ($1,$2,$3,$4) RETURNING id',
        [username, `${username}@encev.com.tr`, `Calendar fixture ${username}`, hash],
      );
      userIds.push(user.rows[0].id);
      const roleId = username === names[2] ? roleByCode.get('employee') : roleByCode.get('project_manager');
      await pool.query(
        'INSERT INTO user_role_assignments (user_id,role_id,assigned_by) VALUES ($1,$2,$1)',
        [userIds.at(-1), roleId],
      );
    }

    app = await NestFactory.create(ApplicationModule, { logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const [alice, bob, employee] = await Promise.all(names.map((name) => signIn(base, name)));

    const denied = await api(base, employee, 'calendar?from=2026-12-01&to=2027-01-01');
    assert.equal(denied.response.status, 403);

    const projectResult = await api(base, alice, 'projects', 'POST', {
      name: 'Calendar fixture project',
      description: 'Takvim entegrasyon testi',
      status: 'active',
      startsOn: '2026-12-08',
      targetOn: '2026-12-18',
      memberIds: [userIds[1]],
    });
    assert.equal(projectResult.response.status, 201, JSON.stringify(projectResult.data));
    const projectId = projectResult.data.project.id as string;
    projectIds.push(projectId);

    const taskResult = await api(base, alice, 'tasks', 'POST', {
      title: 'Takvimde gösterilecek görev',
      description: 'Takvim tarih izdüşümü testi',
      assigneeId: userIds[1],
      projectId,
      startsOn: '2026-12-09',
      dueOn: '2026-12-15',
      priority: 'high',
    });
    assert.equal(taskResult.response.status, 201, JSON.stringify(taskResult.data));
    taskIds.push(taskResult.data.task.id as string);

    const projectEvent = await api(base, alice, 'calendar/events', 'POST', {
      title: 'Proje saha koordinasyonu',
      description: 'Proje ekibi toplantısı',
      eventType: 'meeting',
      visibility: 'project',
      projectId,
      allDay: true,
      startsOn: '2026-12-10',
      endsOn: '2026-12-10',
      startsAt: null,
      endsAt: null,
      location: 'Saha',
      attendeeIds: [userIds[1]],
    });
    assert.equal(projectEvent.response.status, 201, JSON.stringify(projectEvent.data));
    eventIds.push(projectEvent.data.event.id as string);
    assert.equal(projectEvent.data.event.allDay, true);
    assert.equal(projectEvent.data.event.attendees.length, 1);

    const sharedEvent = await api(base, alice, 'calendar/events', 'POST', {
      title: 'Ortak ekip toplantısı',
      description: '',
      eventType: 'meeting',
      visibility: 'shared',
      projectId: null,
      allDay: false,
      startsAt: '2026-12-11T09:00:00+03:00',
      endsAt: '2026-12-11T10:00:00+03:00',
      startsOn: null,
      endsOn: null,
      location: '',
      attendeeIds: [userIds[1]],
    });
    assert.equal(sharedEvent.response.status, 201);
    eventIds.push(sharedEvent.data.event.id as string);
    assert.equal(sharedEvent.data.event.startsAt, '2026-12-11T06:00:00.000Z');

    const personalEvent = await api(base, alice, 'calendar/events', 'POST', {
      title: 'Kişisel saha hazırlığı',
      description: '',
      eventType: 'reminder',
      visibility: 'personal',
      projectId: null,
      allDay: true,
      startsOn: '2026-12-12',
      endsOn: '2026-12-12',
      startsAt: null,
      endsAt: null,
      location: '',
      attendeeIds: [],
    });
    assert.equal(personalEvent.response.status, 201);
    eventIds.push(personalEvent.data.event.id as string);

    const bobCalendar = await api(base, bob, 'calendar?from=2026-12-01&to=2027-01-01');
    assert.equal(bobCalendar.response.status, 200, JSON.stringify(bobCalendar.data));
    const bobEventIds = bobCalendar.data.events.map((event: { id: string }) => event.id);
    assert.ok(bobEventIds.includes(eventIds[0]), 'Proje üyesi proje etkinliğini görebilmeli.');
    assert.ok(bobEventIds.includes(eventIds[1]), 'Ortak etkinlik diğer takvim kullanıcılarına görünmeli.');
    const memberCannotEdit = await api(base, bob, `calendar/events/${eventIds[0]}`, 'PATCH', {
      title: 'Üyenin izinsiz düzenlemesi',
      description: '',
      eventType: 'meeting',
      visibility: 'project',
      projectId,
      allDay: true,
      startsOn: '2026-12-10',
      endsOn: '2026-12-10',
      startsAt: null,
      endsAt: null,
      location: '',
      attendeeIds: [userIds[1]],
      version: 1,
    });
    assert.equal(memberCannotEdit.response.status, 403);
    assert.ok(!bobEventIds.includes(eventIds[2]), 'Kişisel etkinlik başka kullanıcıya görünmemeli.');
    assert.ok(bobCalendar.data.milestones.some((item: { kind: string; entityId: string }) => item.kind === 'task_start' && item.entityId === taskIds[0]));
    assert.ok(bobCalendar.data.milestones.some((item: { kind: string; entityId: string }) => item.kind === 'task_due' && item.entityId === taskIds[0]));
    assert.ok(bobCalendar.data.milestones.some((item: { kind: string; entityId: string }) => item.kind === 'project_target' && item.entityId === projectId));

    const initial = await api(base, alice, `calendar?from=2026-12-01&to=2027-01-01`);
    const currentEvent = initial.data.events.find((event: { id: string }) => event.id === eventIds[0]);
    const changed = await api(base, alice, `calendar/events/${eventIds[0]}`, 'PATCH', {
      title: 'Proje saha koordinasyonu güncellendi',
      description: 'Güncel açıklama',
      eventType: 'meeting',
      visibility: 'project',
      projectId,
      allDay: true,
      startsOn: '2026-12-10',
      endsOn: '2026-12-11',
      startsAt: null,
      endsAt: null,
      location: 'Saha ofisi',
      attendeeIds: [userIds[1]],
      version: currentEvent.version,
    });
    assert.equal(changed.response.status, 200, JSON.stringify(changed.data));
    assert.equal(changed.data.event.version, currentEvent.version + 1);
    const stale = await api(base, alice, `calendar/events/${eventIds[0]}`, 'PATCH', {
      title: 'Eski sürüm',
      description: '',
      eventType: 'meeting',
      visibility: 'project',
      projectId,
      allDay: true,
      startsOn: '2026-12-10',
      endsOn: '2026-12-10',
      startsAt: null,
      endsAt: null,
      location: '',
      attendeeIds: [userIds[1]],
      version: currentEvent.version,
    });
    assert.equal(stale.response.status, 409);

    const invalidRange = await api(base, alice, 'calendar?from=2026-12-20&to=2026-12-01');
    assert.equal(invalidRange.response.status, 400);
    const invalidPersonalInvite = await api(base, alice, 'calendar/events', 'POST', {
      title: 'Geçersiz kişisel etkinlik',
      eventType: 'event',
      visibility: 'personal',
      projectId: null,
      allDay: true,
      startsOn: '2026-12-10',
      endsOn: '2026-12-10',
      startsAt: null,
      endsAt: null,
      attendeeIds: [userIds[1]],
    });
    assert.equal(invalidPersonalInvite.response.status, 400);

    const archived = await api(base, alice, `calendar/events/${eventIds[0]}/archive`, 'POST', {
      version: changed.data.event.version,
    });
    assert.equal(archived.response.status, 204);
    const afterArchive = await api(base, alice, 'calendar?from=2026-12-01&to=2027-01-01');
    assert.ok(!afterArchive.data.events.some((event: { id: string }) => event.id === eventIds[0]));
  } finally {
    if (app) await app.close();
    const cleanup = await pool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('ALTER TABLE calendar_event_audit_events DISABLE TRIGGER calendar_event_audit_events_append_only');
      if (eventIds.length) {
        await cleanup.query('DELETE FROM calendar_event_attendees WHERE event_id = ANY($1::uuid[])', [eventIds]);
        await cleanup.query('DELETE FROM calendar_event_audit_events WHERE event_id = ANY($1::uuid[])', [eventIds]);
        await cleanup.query('DELETE FROM calendar_events WHERE id = ANY($1::uuid[])', [eventIds]);
      }
      if (taskIds.length) {
        await cleanup.query('DELETE FROM notifications WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('ALTER TABLE task_audit_events DISABLE TRIGGER task_audit_events_append_only');
        await cleanup.query('DELETE FROM task_audit_events WHERE task_id = ANY($1::uuid[])', [taskIds]);
        await cleanup.query('ALTER TABLE task_audit_events ENABLE TRIGGER task_audit_events_append_only');
        await cleanup.query('DELETE FROM tasks WHERE id = ANY($1::uuid[])', [taskIds]);
      }
      if (projectIds.length) {
        await cleanup.query('ALTER TABLE project_audit_events DISABLE TRIGGER project_audit_events_append_only');
        await cleanup.query('DELETE FROM project_audit_events WHERE project_id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM project_members WHERE project_id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM projects WHERE id = ANY($1::uuid[])', [projectIds]);
        await cleanup.query('ALTER TABLE project_audit_events ENABLE TRIGGER project_audit_events_append_only');
      }
      if (userIds.length) {
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM auth_audit_events WHERE actor_user_id = ANY($1::uuid[]) OR target_user_id = ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds]);
      }
      await cleanup.query('ALTER TABLE calendar_event_audit_events ENABLE TRIGGER calendar_event_audit_events_append_only');
      await cleanup.query('COMMIT');
    } catch (error) {
      await cleanup.query('ROLLBACK');
      throw error;
    } finally {
      cleanup.release();
      await pool.end();
    }
  }
});
