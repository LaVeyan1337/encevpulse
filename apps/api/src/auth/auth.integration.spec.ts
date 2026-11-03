import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { ApplicationModule } from '../application.module.js';
import { PasswordHasher } from './password-hasher.js';

const ORIGIN = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
const PASSWORD = 'Yerel-Auth-Test-Parolasi-2026!';

interface ApiResponse {
  response: Response;
  body: any;
}

function localPool(): Pool {
  const password = process.env.POSTGRES_PASSWORD;
  if (!password) throw new Error('Yerel test veritabanı yapılandırılmamış.');
  return new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'encev_pulse_dev',
    user: process.env.DB_USER ?? 'encev_dev',
    password,
    connectionTimeoutMillis: 3000,
    application_name: 'encev-pulse-auth-tests',
  });
}

async function api(baseUrl: string, path: string, init: RequestInit = {}): Promise<ApiResponse> {
  const headers = new Headers(init.headers);
  headers.set('Origin', ORIGIN);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${baseUrl}/api/auth/${path}`, { ...init, headers });
  const body = response.status === 204 ? null : await response.json();
  return { response, body };
}

async function getChallenge(baseUrl: string): Promise<string> {
  const result = await api(baseUrl, 'csrf', { method: 'POST', body: '{}' });
  assert.equal(result.response.status, 200);
  return result.body.csrfToken as string;
}

async function login(baseUrl: string, identifier: string, password: string): Promise<{ user: any; body: any; cookie: string; csrfToken: string; response: Response }> {
  const csrfToken = await getChallenge(baseUrl);
  const result = await api(baseUrl, 'login', {
    method: 'POST',
    headers: { 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ identifier, password }),
  });
  const setCookie = result.response.headers.get('set-cookie');
  return {
    body: result.body,
    user: result.body?.user,
    cookie: setCookie?.split(';', 1)[0] ?? '',
    csrfToken: result.body?.csrfToken,
    response: result.response,
  };
}

test('yerel auth akışı: e-posta/kullanıcı adı, CSRF, oturum, yönetici işlemleri ve rate limit', async (t) => {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const pool = localPool();
  const suffix = randomBytes(5).toString('hex');
  const username = `at${suffix}`;
  const email = `${username}@encev.com.tr`;
  const adminUsername = `ad${suffix}`;
  const adminEmail = `${adminUsername}@encev.com.tr`;
  const hasher = new PasswordHasher();
  const passwordHash = await hasher.hash(PASSWORD);
  let userId = '';
  let adminId = '';
  let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;
  const testStartedAt = new Date();
  const fixtureCutoff = new Date(Date.now() - 60 * 60 * 1000);
  const ip = '::ffff:127.0.0.1';

  try {
    const roles = await pool.query<{ id: string; code: string }>("SELECT id, code FROM roles WHERE code IN ('employee', 'system_admin')");
    const employeeRole = roles.rows.find((role) => role.code === 'employee')?.id;
    const adminRole = roles.rows.find((role) => role.code === 'system_admin')?.id;
    assert.ok(employeeRole && adminRole, 'Authentication migration must be applied before tests.');

    const account = await pool.query<{ id: string }>(
      `INSERT INTO users (username, email, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [username, email, 'Auth test user', passwordHash],
    );
    userId = account.rows[0].id;
    await pool.query('INSERT INTO user_role_assignments (user_id, role_id, assigned_by) VALUES ($1, $2, $1)', [userId, employeeRole]);

    const admin = await pool.query<{ id: string }>(
      `INSERT INTO users (username, email, display_name, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
      [adminUsername, adminEmail, 'Auth test admin', passwordHash],
    );
    adminId = admin.rows[0].id;
    await pool.query('INSERT INTO user_role_assignments (user_id, role_id, assigned_by) VALUES ($1, $2, $1), ($1, $3, $1)', [adminId, employeeRole, adminRole]);

    app = await NestFactory.create(ApplicationModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    await t.test('Origin ve CSRF challenge zorunlu', async () => {
      const noOrigin = await fetch(`${baseUrl}/api/auth/csrf`, { method: 'POST' });
      assert.equal(noOrigin.status, 403);
      const challenge = await getChallenge(baseUrl);
      const invalid = await api(baseUrl, 'login', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'invalid' },
        body: JSON.stringify({ identifier: email, password: PASSWORD }),
      });
      assert.equal(invalid.response.status, 403);
      assert.equal(invalid.body.code, 'CSRF_INVALID');
      assert.ok(challenge.length >= 32);
    });

    await t.test('yanlış parola ve olmayan kullanıcı aynı genel hatayı verir', async () => {
      const wrong = await login(baseUrl, email, 'Yanlis-Parola-123!');
      const missing = await login(baseUrl, `yok${suffix}`, 'Yanlis-Parola-123!');
      assert.equal(wrong.response.status, 401);
      assert.equal(missing.response.status, 401);
      assert.deepEqual(wrong.body, missing.body);
      assert.equal(wrong.body.code, 'INVALID_CREDENTIALS');
    });

    await t.test('aynı hesap e-posta ve kullanıcı adı ile açılır', async () => {
      const byEmail = await login(baseUrl, email.toUpperCase(), PASSWORD);
      assert.equal(byEmail.response.status, 200);
      assert.equal(byEmail.user.id, userId);
      const unauthorizedCreate = await api(baseUrl, 'users', {
        method: 'POST',
        headers: { Cookie: byEmail.cookie, 'X-CSRF-Token': byEmail.csrfToken },
        body: JSON.stringify({ username: `no${suffix}`, email: `no${suffix}@encev.com.tr`, displayName: 'Denied test user' }),
      });
      assert.equal(unauthorizedCreate.response.status, 403);
      const byUsername = await login(baseUrl, username.toUpperCase(), PASSWORD);
      assert.equal(byUsername.response.status, 200);
      assert.equal(byUsername.user.id, userId);
      assert.equal(byUsername.cookie.startsWith('pulse_session='), true);
      const cookieHeader = byUsername.response.headers.get('set-cookie') ?? '';
      assert.match(cookieHeader, /HttpOnly/i);
      assert.match(cookieHeader, /SameSite=Lax/i);
    });

    await t.test('süresi dolan oturum geçersiz kabul edilir', async () => {
      const session = await login(baseUrl, username, PASSWORD);
      assert.equal(session.response.status, 200);
      const token = session.cookie.split('=', 2)[1];
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await pool.query(`UPDATE auth_sessions
        SET idle_expires_at = now() - interval '2 seconds', expires_at = now() - interval '1 second'
        WHERE session_token_hash = $1`, [tokenHash]);
      const result = await api(baseUrl, 'session', { headers: { Cookie: session.cookie } });
      assert.equal(result.response.status, 200);
      assert.equal(result.body.authenticated, false);
    });

    await t.test('çıkış oturumu veritabanında iptal eder', async () => {
      const session = await login(baseUrl, username, PASSWORD);
      assert.equal(session.response.status, 200);
      const result = await api(baseUrl, 'logout', {
        method: 'POST',
        headers: { Cookie: session.cookie, 'X-CSRF-Token': session.csrfToken, 'Content-Type': 'application/json' },
      });
      assert.equal(result.response.status, 204);
      const current = await api(baseUrl, 'session', { headers: { Cookie: session.cookie } });
      assert.equal(current.body.authenticated, false);
    });

    await t.test('yönetici kullanıcı oluşturur, geçici parola ilk kullanımda değişir ve reset oturumları iptal eder', async () => {
      const adminSession = await login(baseUrl, adminEmail, PASSWORD);
      assert.equal(adminSession.response.status, 200);
      const selfDisable = await api(baseUrl, `users/${adminId}/disable`, {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(selfDisable.response.status, 409);
      const created = await api(baseUrl, 'users', {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: `US${suffix}`, email: `NEW${suffix}@ENCEV.COM.TR`,
          displayName: 'Yeni test hesabı', jobTitle: 'Biyolog', department: 'Flora-Fauna',
          avatarKey: 'panda', roleCodes: ['team_lead'],
        }),
      });
      assert.equal(created.response.status, 201);
      assert.equal(created.body.user.username, `us${suffix}`);
      assert.equal(created.body.user.email, `new${suffix}@encev.com.tr`);
      assert.equal(created.body.user.mustChangePassword, true);
      assert.equal(created.body.user.jobTitle, 'Biyolog');
      assert.equal(created.body.user.department, 'Flora-Fauna');
      assert.equal(created.body.user.avatarKey, 'panda');
      assert.deepEqual([...created.body.user.roles].sort(), ['team_lead']);
      assert.equal(typeof created.body.temporaryPassword, 'string');

      const matrix = await api(baseUrl, 'permissions', { headers: { Cookie: adminSession.cookie } });
      assert.equal(matrix.response.status,200);
      assert.ok(matrix.body.roles.some((role:any)=>role.code==='auditor'));
      assert.ok(matrix.body.modules.some((module:any)=>module.moduleKey==='chat'&&module.enabled));

      const employeeSession=await login(baseUrl,email,PASSWORD);
      const myPermissions=await api(baseUrl,'permissions/me',{headers:{Cookie:employeeSession.cookie}});
      assert.equal(myPermissions.response.status,200);
      assert.ok(myPermissions.body.modules.find((module:any)=>module.moduleKey==='tasks').actions.includes('view'));
      const forbiddenMatrix=await api(baseUrl,'permissions',{headers:{Cookie:employeeSession.cookie}});
      assert.equal(forbiddenMatrix.response.status,403);

      const lockedAdmin=await api(baseUrl,'permissions/system_admin/permissions',{
        method:'PUT',headers:{Cookie:adminSession.cookie,'X-CSRF-Token':adminSession.csrfToken},
        body:JSON.stringify({actions:['view']}),
      });
      assert.equal(lockedAdmin.response.status,409);
      assert.equal(lockedAdmin.body.code,'SYSTEM_ADMIN_POLICY_LOCKED');

      const revokedChat=await api(baseUrl,'permissions/employee/chat',{
        method:'PUT',headers:{Cookie:adminSession.cookie,'X-CSRF-Token':adminSession.csrfToken},
        body:JSON.stringify({actions:[]}),
      });
      assert.equal(revokedChat.response.status,200);
      try {
        const blockedChat=await fetch(`${baseUrl}/api/chat/conversations`,{headers:{Origin:ORIGIN,Cookie:employeeSession.cookie}});
        assert.equal(blockedChat.status,403);
        assert.equal((await blockedChat.json()).code,'MODULE_PERMISSION_DENIED');
      } finally {
        const restoredChat=await api(baseUrl,'permissions/employee/chat',{
          method:'PUT',headers:{Cookie:adminSession.cookie,'X-CSRF-Token':adminSession.csrfToken},
          body:JSON.stringify({actions:['view','create','update','delete']}),
        });
        assert.equal(restoredChat.response.status,200);
      }

      const legacyCreated=await api(baseUrl,'users',{
        method:'POST',
        headers:{Cookie:adminSession.cookie,'X-CSRF-Token':adminSession.csrfToken},
        body:JSON.stringify({username:`lg${suffix}`,email:`legacy${suffix}@encev.com.tr`,displayName:'Legacy default role'}),
      });
      assert.equal(legacyCreated.response.status,201);
      assert.deepEqual(legacyCreated.body.user.roles,['employee']);

      const roles = await api(baseUrl, 'roles', { headers: { Cookie: adminSession.cookie } });
      assert.equal(roles.response.status, 200);
      assert.ok(roles.body.roles.some((role: any) => role.code === 'team_lead'));

      const directory = await api(baseUrl, 'people', { headers: { Cookie: adminSession.cookie } });
      assert.equal(directory.response.status, 200);
      const directoryUser = directory.body.people.find((person: any) => person.id === created.body.user.id);
      assert.equal(directoryUser.jobTitle, 'Biyolog');
      assert.equal(directoryUser.department, 'Flora-Fauna');
      assert.equal(directoryUser.avatarKey, 'panda');

      const profile = await api(baseUrl, `users/${created.body.user.id}/profile`, {
        method: 'PATCH',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken },
        body: JSON.stringify({
          jobTitle: 'ÇED Uzmanı', department: 'ÇED', avatarKey: 'fox', roleCodes: ['auditor'],
        }),
      });
      assert.equal(profile.response.status, 200);
      assert.equal(profile.body.user.jobTitle, 'ÇED Uzmanı');
      assert.equal(profile.body.user.department, 'ÇED');
      assert.equal(profile.body.user.avatarKey, 'fox');
      assert.deepEqual([...profile.body.user.roles].sort(), ['auditor']);
      await assert.rejects(
        pool.query(`UPDATE auth_audit_events SET action = 'tampered'
          WHERE target_user_id = $1 AND action = 'user.created'`, [created.body.user.id]),
        /append-only/,
      );

      const duplicateUsername = await api(baseUrl, 'users', {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken },
        body: JSON.stringify({ username: `us${suffix}`, email: `other${suffix}@encev.com.tr`, displayName: 'Duplicate username', roleCodes:['employee'] }),
      });
      assert.equal(duplicateUsername.response.status, 409);

      const duplicateEmail = await api(baseUrl, 'users', {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken },
        body: JSON.stringify({ username: `ot${suffix}`, email: `NEW${suffix}@ENCEV.COM.TR`, displayName: 'Duplicate email', roleCodes:['employee'] }),
      });
      assert.equal(duplicateEmail.response.status, 409);

      const newSession = await login(baseUrl, `us${suffix}`, created.body.temporaryPassword);
      assert.equal(newSession.response.status, 200);
      assert.equal(newSession.user.mustChangePassword, true);
      const blockedBusinessAccess = await fetch(`${baseUrl}/api/tasks`, { headers: { Origin: ORIGIN, Cookie: newSession.cookie } });
      assert.equal(blockedBusinessAccess.status, 403);
      assert.equal((await blockedBusinessAccess.json()).code, 'PASSWORD_CHANGE_REQUIRED');
      const changed = await api(baseUrl, 'password', {
        method: 'POST',
        headers: { Cookie: newSession.cookie, 'X-CSRF-Token': newSession.csrfToken },
        body: JSON.stringify({ currentPassword: created.body.temporaryPassword, newPassword: PASSWORD }),
      });
      assert.equal(changed.response.status, 200);
      assert.equal(changed.body.user.mustChangePassword, false);
      const newCookie = changed.response.headers.get('set-cookie')?.split(';', 1)[0] ?? '';
      const auditorTasks=await fetch(`${baseUrl}/api/tasks`,{headers:{Origin:ORIGIN,Cookie:newCookie}});
      assert.equal(auditorTasks.status,200,'auditor role keeps read access to permitted task records');
      const auditorChat=await fetch(`${baseUrl}/api/chat/conversations`,{headers:{Origin:ORIGIN,Cookie:newCookie}});
      assert.equal(auditorChat.status,403,'auditor role must not inherit employee chat permissions');

      const reset = await api(baseUrl, `users/${created.body.user.id}/reset-password`, {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken, 'Content-Type': 'application/json' },
      });
      assert.equal(reset.response.status, 200);
      assert.equal(typeof reset.body.temporaryPassword, 'string');
      const revoked = await api(baseUrl, 'session', { headers: { Cookie: newCookie } });
      assert.equal(revoked.body.authenticated, false);

      const users = await api(baseUrl, 'users', { headers: { Cookie: adminSession.cookie } });
      assert.equal(users.response.status, 200);
      assert.equal(users.body.users.some((item: any) => item.id === created.body.user.id), true);
      const resetSession = await login(baseUrl, `us${suffix}`, reset.body.temporaryPassword);
      assert.equal(resetSession.response.status, 200);
      const disabled = await api(baseUrl, `users/${created.body.user.id}/disable`, {
        method: 'POST',
        headers: { Cookie: adminSession.cookie, 'X-CSRF-Token': adminSession.csrfToken, 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(disabled.response.status, 204);
      const disabledSession = await api(baseUrl, 'session', { headers: { Cookie: resetSession.cookie } });
      assert.equal(disabledSession.body.authenticated, false);
    });

    await t.test('rate limit giriş denemelerini sınırlar', async () => {
      const limitedIdentifier = `limit${suffix}`;
      let last: ApiResponse | undefined;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        last = await login(baseUrl, limitedIdentifier, 'Yanlis-Parola-123!');
      }
      assert.equal(last?.response.status, 429);
      assert.equal(last?.body.code, 'LOGIN_RATE_LIMITED');
    });
  } catch (error) {
    process.stderr.write(`Auth integration assertion failed: ${error instanceof Error ? error.stack : 'unknown error'}\n`);
    throw error;
  } finally {
    if (app) {
      try {
        app.getHttpServer().closeAllConnections();
        await app.close();
      } catch {
        // Continue cleaning DB fixtures even if a test connection outlived the server.
      }
    }
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const generatedFixtures = await client.query<{ id: string }>(
        `SELECT id FROM users
         WHERE display_name IN ('Auth test user', 'Auth test admin')
           AND username ~ '^(at|ad)[a-f0-9]{10}$'
           AND created_at >= $1`,
        [fixtureCutoff],
        );
        const candidateIds = generatedFixtures.rows.map((row) => row.id);
        const adminCreated = adminId
          ? await client.query<{ id: string }>("SELECT id FROM users WHERE username = ANY($1::text[])", [[`us${suffix}`,`lg${suffix}`]])
          : { rows: [] as { id: string }[] };
        const cleanupIds = [...adminCreated.rows.map((row) => row.id), ...candidateIds, ...(userId ? [userId] : []), ...(adminId ? [adminId] : [])];
        if (cleanupIds.length) {
          await client.query('LOCK TABLE auth_audit_events IN ACCESS EXCLUSIVE MODE');
          await client.query('ALTER TABLE auth_audit_events DISABLE TRIGGER auth_audit_events_append_only');
          await client.query('DELETE FROM auth_audit_events WHERE actor_user_id = ANY($1::uuid[]) OR target_user_id = ANY($1::uuid[])', [cleanupIds]);
          await client.query('ALTER TABLE auth_audit_events ENABLE TRIGGER auth_audit_events_append_only');
          await client.query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [cleanupIds]);
          await client.query('DELETE FROM user_role_assignments WHERE user_id = ANY($1::uuid[])', [cleanupIds]);
          await client.query('UPDATE users SET created_by = NULL WHERE created_by = ANY($1::uuid[])', [cleanupIds]);
          await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [cleanupIds]);
        }

        const secret = process.env.AUTH_RATE_LIMIT_SECRET ?? '';
        const loginHashes = [
          email.toLowerCase(), username.toLowerCase(), adminEmail.toLowerCase(), adminUsername.toLowerCase(),
          `yok${suffix}`, `limit${suffix}`, `us${suffix}`, `new${suffix}@encev.com.tr`,
        ].map((identifier) => createHmac('sha256', secret).update(`login-id:${identifier}`).digest('hex'));
        await client.query('DELETE FROM auth_rate_limit_buckets WHERE dimension_hash = ANY($1::char(64)[])', [loginHashes]);
        const ipHashes = ['127.0.0.1', ip].flatMap((address) => [
          createHmac('sha256', secret).update(`csrf-ip:${address}`).digest('hex'),
          createHmac('sha256', secret).update(`login-ip:${address}`).digest('hex'),
        ]);
        await client.query('DELETE FROM auth_rate_limit_buckets WHERE dimension_hash = ANY($1::char(64)[])', [ipHashes]);
        await client.query('DELETE FROM auth_csrf_challenges WHERE created_at >= $1', [testStartedAt]);
        await client.query('COMMIT');
      } catch (error) {
        process.stderr.write(`Auth test cleanup failed: ${error instanceof Error ? error.message : 'unknown error'}\n`);
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } finally {
      await pool.end();
    }
  }
});
