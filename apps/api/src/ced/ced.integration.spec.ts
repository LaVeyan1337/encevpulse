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
  const names = ['pm' + suffix, 'po' + suffix, 'px' + suffix, 'em' + suffix];
  const hasher = new PasswordHasher();
  const hash = await hasher.hash('Yerel-CED-Test-Parolasi-2026!');
  const userIds: string[] = [];
  const projectIds: string[] = [];
  let caseId = '';
  let ptdCaseId = '';
  let finalPtdCaseId = '';
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
    const roleCodes = ['project_manager', 'process_owner', 'project_manager', 'employee'];
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
    const [projectManager, processOwner, outsider, employee] = await Promise.all(names.map((name) => signIn(base, name)));

    const denied = await api(base, employee, 'ced/projects/00000000-0000-4000-8000-000000000001');
    assert.equal(denied.response.status, 403);

    const project = await api(base, projectManager, 'projects', 'POST', {
      name: 'CED API test ' + suffix, status: 'active', memberIds: [userIds[1]],
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.data));
    const projectId = project.data.project.id as string;
    projectIds.push(projectId);

    const mixedRoute = await api(base, processOwner, 'ced/projects/' + projectId, 'POST', { routeCode: 'combined' });
    assert.equal(mixedRoute.response.status, 400, 'Yeni süreçlerde karma rota kullanılamamalı.');

    const created = await api(base, processOwner, 'ced/projects/' + projectId, 'POST', {
      routeCode: 'ek1_cbd', fileNumber: 'CED-' + suffix,
      startedOn: '2026-03-01',
      applicationSubmittedOn: '2026-03-04',
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.data));
    caseId = created.data.caseId as string;

    const initial = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.data.case.applicationSubmittedOn, '2026-03-04');
    const changedApplicationDate = await api(base, processOwner, 'ced/cases/' + caseId, 'PATCH', {
      version: initial.data.case.version,
      applicationSubmittedOn: '2026-03-06',
    });
    assert.equal(changedApplicationDate.response.status, 200, JSON.stringify(changedApplicationDate.data));
    const afterApplicationDate = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(afterApplicationDate.data.case.applicationSubmittedOn, '2026-03-06');
    assert.equal(afterApplicationDate.data.case.routeCode, 'ek1_cbd', 'Başvuru tarihi değişimi mevcut Ek-1 rotasını otomatik değiştirmemeli.');
    const invalidApplicationDate = await api(base, processOwner, 'ced/cases/' + caseId, 'PATCH', {
      version: afterApplicationDate.data.case.version,
      applicationSubmittedOn: '2026-02-30',
    });
    assert.equal(invalidApplicationDate.response.status, 400);
    const stages = initial.data.stages as Array<{id:string;stageKey:string;status:string;version:number}>;
    const cbd = stages.find((stage) => stage.stageKey === 'cbd_upload')!;
    const ptd = stages.find((stage) => stage.stageKey === 'ptd_upload')!;
    assert.equal(cbd.status, 'pending');
    assert.equal(ptd.status, 'not_applicable');
    assert.equal(stages.find((stage) => stage.stageKey === 'initial_review')?.status, 'pending');

    const cannotUsePtd = await api(base, processOwner, 'ced/cases/' + caseId + '/documents', 'POST', {
      stageId: ptd.id, documentType: 'ptd', title: 'PTD not applicable',
      sourceType: 'eced_reference', sourceReference: 'N/A',
    });
    assert.equal(cannotUsePtd.response.status, 400);

    const fileReference = 'C:\\EncevPulseTest\\CED Test\\CBD.pdf';
    const document = await api(base, processOwner, 'ced/cases/' + caseId + '/documents', 'POST', {
      stageId: cbd.id, documentType: 'cbd', title: 'ÇBD başvuru dosyası',
      sourceType: 'network_path', sourceReference: fileReference, versionLabel: 'Rev.00',
      documentDate: '2026-11-04',
    });
    assert.equal(document.response.status, 201, JSON.stringify(document.data));
    const after = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(after.data.stages.find((stage: {id:string}) => stage.id === cbd.id).status, 'completed');
    assert.ok(after.data.documents.some((item: {sourceReference:string}) => item.sourceReference === fileReference));

    const deniedOpinionList = await api(base, employee, 'ced/opinions');
    assert.equal(deniedOpinionList.response.status, 403);

    const opinionCreated = await api(base, processOwner, 'ced/cases/' + caseId + '/opinions', 'POST', {
      institutionName: 'Ankara İl Müdürlüğü',
      subject: 'ÇED kapsamındaki kurum görüşü talebi',
      status: 'waiting',
      requestDate: '2026-11-04',
      deadlineDate: '2026-11-14',
      outgoingLetterNo: '2026/TEST-01',
      notes: 'Entegrasyon testi kaydı',
    });
    assert.equal(opinionCreated.response.status, 201, JSON.stringify(opinionCreated.data));
    const opinionList = await api(base, processOwner, 'ced/opinions');
    assert.equal(opinionList.response.status, 200);
    const listedOpinion = opinionList.data.opinions.find((item: { institutionName: string }) => item.institutionName === 'Ankara İl Müdürlüğü');
    assert.ok(listedOpinion, 'Yeni kurum görüşü genel listede görünmeli.');
    assert.equal(listedOpinion.projectId, projectId);
    assert.equal(listedOpinion.status, 'waiting');

    const opinionUpdated = await api(base, processOwner, 'ced/opinions/' + listedOpinion.id, 'PATCH', {
      version: listedOpinion.version,
      status: 'responded',
      responseDate: '2026-11-05',
      incomingLetterNo: '2026/TEST-02',
    });
    assert.equal(opinionUpdated.response.status, 200, JSON.stringify(opinionUpdated.data));
    const refreshedOpinions = await api(base, processOwner, 'ced/opinions');
    const refreshedOpinion = refreshedOpinions.data.opinions.find((item: { id: string }) => item.id === listedOpinion.id);
    assert.equal(refreshedOpinion.status, 'responded');

    // A second project starts without a ÇED case. Concurrent project-level opinions must
    // remain project-scoped and must not create a fake ÇED workflow record.
    const opinionOnlyProject = await api(base, projectManager, 'projects', 'POST', {
      name: 'CED opinion-only test ' + suffix, status: 'active', memberIds: [userIds[1]],
    });
    assert.equal(opinionOnlyProject.response.status, 201, JSON.stringify(opinionOnlyProject.data));
    const opinionOnlyProjectId = opinionOnlyProject.data.project.id as string;
    projectIds.push(opinionOnlyProjectId);

    const [directOpinionA,directOpinionB] = await Promise.all([
      api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId + '/opinions', 'POST', {
        institutionName: 'Ankara İl Müdürlüğü', subject: 'Format görüşü', status: 'positive',
        requestDate: '2026-11-04', responseDate: '2026-11-05', incomingLetterNo: 'FORMAT-' + suffix,
      }),
      api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId + '/opinions', 'POST', {
        institutionName: 'DKMP', subject: 'İDK görüşü', status: 'revision',
        requestDate: '2026-11-04', deadlineDate: '2026-11-20', outgoingLetterNo: 'IDK-' + suffix,
      }),
    ]);
    assert.equal(directOpinionA.response.status, 201, JSON.stringify(directOpinionA.data));
    assert.equal(directOpinionB.response.status, 201, JSON.stringify(directOpinionB.data));
    assert.equal(directOpinionA.data.caseId, null, 'Kurum görüşü ÇED dosyası olmadan projeye bağlanmalı.');
    assert.equal(directOpinionB.data.caseId, null, 'Eşzamanlı ikinci görüş de yapay ÇED dosyası oluşturmamalı.');
    assert.ok(directOpinionA.data.opinionId && directOpinionB.data.opinionId);
    const fakeCaseCheck = await pool.query('SELECT id FROM ced_cases WHERE project_id=$1', [opinionOnlyProjectId]);
    assert.equal(fakeCaseCheck.rowCount, 0, 'Kurum görüşleri boş bir ÇED dosyası üretmemeli.');
    const directOpinions = await api(base, processOwner, 'ced/opinions');
    const projectOpinions = directOpinions.data.opinions.filter((item: {projectId:string})=>item.projectId===opinionOnlyProjectId);
    assert.equal(projectOpinions.length,2,'Bir projede birden fazla kurum görüşü tutulabilmeli.');
    assert.deepEqual(new Set(projectOpinions.map((item: {status:string})=>item.status)),new Set(['positive','revision']));
    const projectOpinionToUpdate = projectOpinions[0] as {id:string;version:number;subject:string};
    const updatedProjectOpinion = await api(base, processOwner, 'ced/opinions/' + projectOpinionToUpdate.id, 'PATCH', {
      version: projectOpinionToUpdate.version, subject: projectOpinionToUpdate.subject + ' · güncellendi',
    });
    assert.equal(updatedProjectOpinion.response.status,200,JSON.stringify(updatedProjectOpinion.data));
    const beforeCase = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    assert.equal(beforeCase.data.case,null,'Kurum görüşü için gerçek süreç kaydı oluşana kadar ÇED dosyası olmamalı.');
    assert.equal(beforeCase.data.opinions.length,2,'ÇED dosyası olmadan proje görüşleri okunabilmeli.');
    const ptdCreated = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId, 'POST', {
      routeCode: 'ek2_ptd', fileNumber: 'PTD-' + suffix,
    });
    assert.equal(ptdCreated.response.status, 201, JSON.stringify(ptdCreated.data));
    ptdCaseId = ptdCreated.data.caseId as string;
    const customStageCreated = await api(base, processOwner, 'ced/cases/' + ptdCaseId + '/stages', 'POST', {
      title: 'PTD sonucu sonrası kontrol', sortOrder: 85,
    });
    assert.equal(customStageCreated.response.status, 201, JSON.stringify(customStageCreated.data));
    const ptdInitial = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    const ptdStages = ptdInitial.data.stages as Array<{id:string;stageKey:string;status:string;version:number;title:string;isCustom:boolean}>;
    assert.equal(ptdStages.find((stage)=>stage.stageKey==='cbd_upload')?.status,'not_applicable');
    assert.equal(ptdStages.find((stage)=>stage.stageKey==='ptd_upload')?.status,'pending');
    assert.equal(ptdStages.find((stage)=>stage.stageKey==='ptd_assessment')?.status,'pending');
    assert.equal(ptdStages.find((stage)=>stage.stageKey==='initial_review')?.status,'not_applicable');
    const customPtdStage = ptdStages.find((stage)=>stage.title==='PTD sonucu sonrası kontrol');
    assert.ok(customPtdStage);
    assert.equal(customPtdStage.status,'not_applicable');
    const blockedStageActivation = await api(base, processOwner, 'ced/stages/' + customPtdStage.id, 'PATCH', {
      version: customPtdStage.version, status: 'in_progress',
    });
    assert.equal(blockedStageActivation.response.status,400,'PTD kararı olmadan özel ÇED aşaması başlatılamamalı.');
    const blockedDocument = await api(base, processOwner, 'ced/cases/' + ptdCaseId + '/documents', 'POST', {
      stageId: customPtdStage.id, documentType: 'other', title: 'PTD öncesi belge',
      sourceType: 'other', sourceReference: 'PTD kararı bekleniyor',
    });
    assert.equal(blockedDocument.response.status,400,'PTD kararı olmadan sonraki aşamaya belge eklenememeli.');

    const activateFullCed = await api(base, processOwner, 'ced/cases/' + ptdCaseId, 'PATCH', {
      version: ptdInitial.data.case.version, decision: 'ced_report_required',
    });
    assert.equal(activateFullCed.response.status, 200, JSON.stringify(activateFullCed.data));
    const afterPtdRequired = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    assert.equal(afterPtdRequired.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='ptd_assessment').status,'completed');
    assert.equal(afterPtdRequired.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='initial_review').status,'pending');
    assert.equal(afterPtdRequired.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='ced_report_upload').status,'pending');
    assert.equal(afterPtdRequired.data.stages.find((stage: {title:string})=>stage.title==='PTD sonucu sonrası kontrol').status,'pending');

    const resetPtd = await api(base, processOwner, 'ced/cases/' + ptdCaseId, 'PATCH', {
      version: afterPtdRequired.data.case.version, decision: 'pending', closedOn: null,
    });
    assert.equal(resetPtd.response.status, 200, JSON.stringify(resetPtd.data));
    const afterReset = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    assert.equal(afterReset.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='initial_review').status,'not_applicable');
    assert.equal(afterReset.data.stages.find((stage: {title:string})=>stage.title==='PTD sonucu sonrası kontrol').status,'not_applicable');

    const positivePtd = await api(base, processOwner, 'ced/cases/' + ptdCaseId, 'PATCH', {
      version: afterReset.data.case.version, decision: 'ced_positive', closedOn: null,
    });
    assert.equal(positivePtd.response.status, 200, JSON.stringify(positivePtd.data));
    const afterPositive = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    assert.match(afterPositive.data.case.closedOn,/^\d{4}-\d{2}-\d{2}$/);
    assert.equal(afterPositive.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='initial_review').status,'not_applicable');
    assert.equal(afterPositive.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='ptd_assessment').status,'completed');

    // A second Ek-2 case proves that "ÇED Raporu Hazırlanmalıdır" opens the
    // full process and the later final ÇED decision does not re-close PTD stages.
    const fullCedProject = await api(base, projectManager, 'projects', 'POST', {
      name: 'CED full PTD process test ' + suffix, status: 'active', memberIds: [userIds[1]],
    });
    assert.equal(fullCedProject.response.status,201,JSON.stringify(fullCedProject.data));
    const fullCedProjectId = fullCedProject.data.project.id as string;
    projectIds.push(fullCedProjectId);
    const fullPtdCase = await api(base, processOwner, 'ced/projects/' + fullCedProjectId, 'POST', {
      routeCode:'ek2_ptd',fileNumber:'PTD-FULL-'+suffix,
    });
    assert.equal(fullPtdCase.response.status,201,JSON.stringify(fullPtdCase.data));
    finalPtdCaseId = fullPtdCase.data.caseId as string;
    const fullPtdInitial = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    const activatedFullPtd = await api(base, processOwner, 'ced/cases/' + finalPtdCaseId, 'PATCH', {
      version:fullPtdInitial.data.case.version,decision:'ced_report_required',
    });
    assert.equal(activatedFullPtd.response.status,200,JSON.stringify(activatedFullPtd.data));
    const activeFullStages = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    for (const stage of (activeFullStages.data.stages as Array<{id:string;stageKey:string;sortOrder:number;status:string;version:number}>)
      .filter(stage=>stage.sortOrder>45&&stage.stageKey!=='decision')) {
      const completedStage = await api(base, processOwner, 'ced/stages/' + stage.id, 'PATCH', {
        version:stage.version,status:'completed',
      });
      assert.equal(completedStage.response.status,200,JSON.stringify(completedStage.data));
    }
    const readyForDecision = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    const finalNegative = await api(base, processOwner, 'ced/cases/' + finalPtdCaseId, 'PATCH', {
      version:readyForDecision.data.case.version,decision:'ced_negative',closedOn:null,
    });
    assert.equal(finalNegative.response.status,200,JSON.stringify(finalNegative.data));
    const completedFullProcess = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    assert.equal(completedFullProcess.data.case.decision,'ced_negative');
    assert.match(completedFullProcess.data.case.closedOn,/^\\d{4}-\\d{2}-\\d{2}$/);
    assert.equal(completedFullProcess.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='last_final_report_upload').status,'completed');
    assert.equal(completedFullProcess.data.stages.find((stage: {stageKey:string})=>stage.stageKey==='decision').status,'completed');

    const outsiderOpinionList = await api(base, outsider, 'ced/opinions');
    assert.equal(outsiderOpinionList.response.status, 200);
    assert.equal(outsiderOpinionList.data.opinions.length, 0, 'Proje dışındaki kullanıcı görüşleri görmemeli.');

    const outsideProject = await api(base, outsider, 'ced/projects/' + projectId);
    assert.equal(outsideProject.response.status, 404);
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
      if(finalPtdCaseId){
        await cleanup.query('DELETE FROM ced_audit_events WHERE case_id=$1', [finalPtdCaseId]);
        await cleanup.query('DELETE FROM ced_documents WHERE case_id=$1', [finalPtdCaseId]);
        await cleanup.query('DELETE FROM ced_case_stages WHERE case_id=$1', [finalPtdCaseId]);
        await cleanup.query('DELETE FROM ced_cases WHERE id=$1', [finalPtdCaseId]);
      }
      if(ptdCaseId){
        await cleanup.query('DELETE FROM ced_audit_events WHERE case_id=$1', [ptdCaseId]);
        await cleanup.query('DELETE FROM ced_institution_opinions WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM ced_case_stages WHERE case_id=$1', [ptdCaseId]);
        await cleanup.query('DELETE FROM ced_cases WHERE id=$1', [ptdCaseId]);
      }
      await cleanup.query('DELETE FROM ced_institution_opinions WHERE project_id=ANY($1::uuid[])', [projectIds]);
      await cleanup.query('DELETE FROM ced_audit_events WHERE project_id=ANY($1::uuid[])', [projectIds]);
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
        await cleanup.query('ALTER TABLE auth_audit_events DISABLE TRIGGER auth_audit_events_append_only');
        await cleanup.query(
          'DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::uuid[]) OR target_user_id=ANY($1::uuid[])',
          [userIds],
        );
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [userIds]);
        await cleanup.query('ALTER TABLE auth_audit_events ENABLE TRIGGER auth_audit_events_append_only');
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
