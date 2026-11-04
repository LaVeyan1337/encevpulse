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
type Client = { cookie: string; csrf: string };

test('ÇED API: route-specific milestones, document completion and project access', async () => {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const pool = new Pool({
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME ?? 'encev_pulse_dev',
    user: process.env.DB_USER ?? 'encev_dev',
    password: process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis: 3000,
    application_name: 'encev-pulse-ced-integration',
  });
  const suffix = randomBytes(5).toString('hex');
  const names = ['pm' + suffix, 'po' + suffix, 'em' + suffix];
  const hasher = new PasswordHasher();
  const hash = await hasher.hash('Yerel-CED-Test-Parolasi-2026!');
  const userIds: string[] = [];
  const projectIds: string[] = [];
  let caseId = '';
  let app: Awaited<ReturnType<typeof NestFactory.create>> | null = null;

  async function api(base: string, client: Client, path: string, method = 'GET', body?: unknown) {
    const response = await fetch(base + '/api/' + path, {
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
    const csrfResponse = await fetch(base + '/api/auth/csrf', {
      method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: '{}',
    });
    const challenge = await csrfResponse.json() as { csrfToken: string };
    const response = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-CSRF-Token': challenge.csrfToken },
      body: JSON.stringify({ identifier: username, password: 'Yerel-CED-Test-Parolasi-2026!' }),
    });
    const result = await response.json() as { csrfToken: string };
    assert.equal(response.status, 200);
    return { cookie: response.headers.get('set-cookie')!.split(';', 1)[0], csrf: result.csrfToken };
  }

  try {
    const roles = await pool.query<{ id: string; code: string }>(
      "SELECT id,code FROM roles WHERE code = ANY($1::text[])", [['project_manager', 'process_owner', 'employee']],
    );
    const roleIds = new Map(roles.rows.map((row) => [row.code, row.id]));
    assert.equal(roleIds.size, 3);
    const roleCodes = ['project_manager', 'process_owner', 'employee'];
    for (let i = 0; i < names.length; i += 1) {
      const user = await pool.query<{ id: string }>(
        'INSERT INTO users(username,email,display_name,password_hash) VALUES($1,$2,$3,$4) RETURNING id',
        [names[i], names[i] + '@encev.com.tr', 'CED test ' + names[i], hash],
      );
      userIds.push(user.rows[0].id);
      await pool.query(
        'INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$1)',
        [userIds[i], roleIds.get(roleCodes[i])],
      );
    }

    app = await NestFactory.create(ApplicationModule, { logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const base = 'http://127.0.0.1:' + (app.getHttpServer().address() as AddressInfo).port;
    const [projectManager, processOwner, employee] = await Promise.all(names.map((name) => signIn(base, name)));

    const denied = await api(base, employee, 'ced/projects/00000000-0000-4000-8000-000000000001');
    assert.equal(denied.response.status, 403);

    const project = await api(base, projectManager, 'projects', 'POST', {
      name: 'CED API test ' + suffix, status: 'active', memberIds: [userIds[1]],
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.data));
    const projectId = project.data.project.id as string;
    projectIds.push(projectId);

    const created = await api(base, processOwner, 'ced/projects/' + projectId, 'POST', {
      routeCode: 'ek1_cbd', fileNumber: 'CED-' + suffix,
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    caseId = created.data.caseId as string;

    const initial = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(initial.response.status, 200);
    const stages = initial.data.stages as Array<{id:string;stageKey:string;status:string;version:number}>;
    const cbd = stages.find((stage) => stage.stageKey === 'cbd_upload')!;
    const ptd = stages.find((stage) => stage.stageKey === 'ptd_upload')!;
    assert.equal(cbd.status, 'pending');
    assert.equal(ptd.status, 'not_applicable');

    const cannotUsePtd = await api(base, processOwner, 'ced/cases/' + caseId + '/documents', 'POST', {
      stageId: ptd.id, documentType: 'ptd', title: 'PTD not applicable',
      sourceType: 'eced_reference', sourceReference: 'N/A',
    });
    assert.equal(cannotUsePtd.response.status, 400);

    const fileReference = '\\\\\\\\192.168.1.55\\\\Genel Evrak\\\\CED Test\\\\CBD.pdf';
    const document = await api(base, processOwner, 'ced/cases/' + caseId + '/documents', 'POST', {
      stageId: cbd.id, documentType: 'cbd', title: 'ÇBD başvuru dosyası',
      sourceType: 'network_path', sourceReference: fileReference, versionLabel: 'Rev.00',
      documentDate: '2026-11-04',
    });
    assert.equal(document.response.status, 201, JSON.stringify(document.data));
    const after = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(after.data.stages.find((stage: {id:string}) => stage.id === cbd.id).status, 'completed');
    assert.ok(after.data.documents.some((item: {sourceReference:string}) => item.sourceReference === fileReference));

    const outsider = await api(base, employee, 'ced/projects/' + projectId);
    assert.equal(outsider.response.status, 404);
  } finally {
    if (app) await app.close();
    const cleanup = await pool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('ALTER TABLE ced_audit_events DISABLE TRIGGER ced_audit_events_append_only');
      if (caseId) {
        await cleanup.query('DELETE FROM ced_audit_events WHERE case_id=$1', [caseId]);
        await cleanup.query('DELETE FROM ced_documents WHERE case_id=$1', [caseId]);
        await cleanup.query('DELETE FROM ced_institution_opinions WHERE case_id=$1', [caseId]);
        await cleanup.query('DELETE FROM ced_idk_meetings WHERE case_id=$1', [caseId]);
        await cleanup.query('DELETE FROM ced_case_stages WHERE case_id=$1', [caseId]);
        await cleanup.query('DELETE FROM ced_cases WHERE id=$1', [caseId]);
      }
      await cleanup.query('ALTER TABLE ced_audit_events ENABLE TRIGGER ced_audit_events_append_only');
      if (projectIds.length) {
        await cleanup.query('ALTER TABLE project_audit_events DISABLE TRIGGER project_audit_events_append_only');
        await cleanup.query('DELETE FROM project_audit_events WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM project_members WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('ALTER TABLE project_audit_events ENABLE TRIGGER project_audit_events_append_only');
      }
      if (userIds.length) {
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])', [userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id=ANY($1::uuid[])', [userIds]);
        await cleanup.query(
          'DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::uuid[]) OR target_user_id=ANY($1::uuid[])',
          [userIds],
        );
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
      }
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
