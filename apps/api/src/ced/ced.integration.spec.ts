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
  const directoryContactIds: string[] = [];
  const deadlineRuleIds: string[] = [];
  const deadlineOpinionIds: string[] = [];
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

    const ruleDraft = {
      name: 'CI kurum görüşü iş günü kuralı ' + suffix,
      description: 'Yalnızca sentetik entegrasyon testi için; gerçek mevzuat kuralı değildir.',
      dayCount: 3,
      dayType: 'business_days',
      includeStartDay: false,
      dueDateAdjustment: 'none',
      weekendDays: [0,6],
      holidayDates: ['2026-11-09'],
      calendarName: 'CI çalışma takvimi',
      calendarSourceLabel: 'Sentetik CI fikstürü',
      calendarSourceReference: 'CI-only test calendar',
      calendarVerifiedAt: '2026-10-01',
      startEventLabel: 'Kurum yazısının evrak kayıt tarihi',
      legalReference: 'Yalnızca test verisi; mevzuat dayanağı değildir.',
      ruleSourceLabel: 'Sentetik CI fikstürü',
      ruleSourceReference: 'CI-only test rule fixture',
      ruleNotes: 'Üretim ortamında kullanılmamalıdır.',
    };
    const employeeCannotCreateRule = await api(base,employee,'ced/deadline-rules','POST',ruleDraft);
    assert.equal(employeeCannotCreateRule.response.status,403,'Çalışan süre kuralı oluşturamamalı.');
    const ruleCreated = await api(base,processOwner,'ced/deadline-rules','POST',ruleDraft);
    assert.equal(ruleCreated.response.status,201,JSON.stringify(ruleCreated.data));
    const deadlineRuleId = ruleCreated.data.rule.id as string;
    const firstRuleVersionId = ruleCreated.data.rule.draftVersionId as string;
    deadlineRuleIds.push(deadlineRuleId);
    assert.equal(ruleCreated.data.rule.draftVersion,1);

    const ruleDraftUpdate = await api(base,processOwner,
      'ced/deadline-rules/'+deadlineRuleId+'/versions/'+firstRuleVersionId,'PATCH',{...ruleDraft,dayCount:2});
    assert.equal(ruleDraftUpdate.response.status,200,JSON.stringify(ruleDraftUpdate.data));
    const beforeRuleApproval = await api(base,processOwner,'ced/deadline-rules');
    const unapproved = beforeRuleApproval.data.rules.find((rule:{id:string})=>rule.id===deadlineRuleId);
    assert.ok(unapproved);
    assert.equal(unapproved.name,ruleDraft.name,'Taslak düzenlemesi kural adını güncellemelidir.');
    assert.equal(unapproved.description,ruleDraft.description,'Taslak düzenlemesi kural açıklamasını güncellemelidir.');
    assert.equal(unapproved.currentVersionId,null,'Taslak kural onaylanmadan hesaplamada kullanılmamalı.');
    assert.equal(unapproved.draftVersion,1);

    const employeeCannotApproveRule = await api(base,employee,
      'ced/deadline-rules/'+deadlineRuleId+'/versions/'+firstRuleVersionId+'/approve','POST',{});
    assert.equal(employeeCannotApproveRule.response.status,403,'Çalışan süre kuralını onaylayamamalı.');
    const firstApproval = await api(base,processOwner,
      'ced/deadline-rules/'+deadlineRuleId+'/versions/'+firstRuleVersionId+'/approve','POST',{});
    assert.equal(firstApproval.response.status,200,JSON.stringify(firstApproval.data));
    assert.equal(firstApproval.data.approved,true);

    const preview = await api(base,processOwner,
      'ced/deadline-rule-versions/'+firstRuleVersionId+'/preview?startDate=2026-11-06');
    assert.equal(preview.response.status,200,JSON.stringify(preview.data));
    assert.equal(preview.data.preview.deadlineDate,'2026-11-11',
      'Cuma başlangıcı, hafta sonu ve 9 Kasım tatili atlanarak Çarşamba hesaplanmalı.');
    assert.equal(preview.data.rule.startEventLabel,ruleDraft.startEventLabel);


    const directoryDraft = {
      institutionName: 'Kurum Rehberi Test ' + suffix,
      institutionType: 'Kamu kurumu',
      website: 'https://example.gov.tr',
      contactPerson: 'Test Yetkilisi',
      title: 'Uzman',
      department: 'Çevre',
      phone: '+90 312 000 00 00',
      email: 'rehber.' + suffix + '@example.gov.tr',
      address: 'Ankara',
      sourceLabel: 'Resmî internet sitesi',
      sourceReference: 'https://example.gov.tr/iletisim',
      verifiedAt: '2026-11-04',
    };
    const directoryCreate = await api(base, processOwner, 'ced/directory', 'POST', directoryDraft);
    assert.equal(directoryCreate.response.status, 201, JSON.stringify(directoryCreate.data));
    const directoryContactId = directoryCreate.data.contact.id as string;
    directoryContactIds.push(directoryContactId);
    assert.equal(directoryCreate.data.contact.version, 1);
    assert.equal(directoryCreate.data.contact.sourceLabel, directoryDraft.sourceLabel);
    assert.equal(directoryCreate.data.contact.verifiedAt, directoryDraft.verifiedAt);

    const employeeDirectory = await api(base, employee, 'ced/directory');
    assert.equal(employeeDirectory.response.status, 200);
    assert.ok(employeeDirectory.data.contacts.some((entry: {id:string})=>entry.id===directoryContactId),
      'Çalışanlar paylaşılan kurum rehberini görüntüleyebilir.');
    const employeeCannotEditDirectory = await api(base, employee, 'ced/directory/'+directoryContactId, 'PATCH', {});
    assert.equal(employeeCannotEditDirectory.response.status, 403,
      'Kurum rehberinde görüntüleme yetkisi düzenleme yetkisi vermez.');

    const duplicateDirectory = await api(base, processOwner, 'ced/directory', 'POST', directoryDraft);
    assert.equal(duplicateDirectory.response.status, 409, 'Aynı kurum ve iletişim kişisi için ikinci kayıt açılmamalı.');

    const directoryUpdate = await api(base, processOwner, 'ced/directory/'+directoryContactId, 'PATCH', {
      ...directoryDraft,
      institutionName: directoryDraft.institutionName + ' Güncel',
      sourceLabel: 'Telefon teyidi',
      sourceReference: '05.11.2026 tarihli telefon görüşmesi',
      verifiedAt: '2026-11-05',
      expectedVersion: 1,
    });
    assert.equal(directoryUpdate.response.status, 200, JSON.stringify(directoryUpdate.data));
    assert.equal(directoryUpdate.data.contact.version, 2);
    assert.equal(directoryUpdate.data.contact.sourceLabel, 'Telefon teyidi');

    const staleDirectoryUpdate = await api(base, processOwner, 'ced/directory/'+directoryContactId, 'PATCH', {
      ...directoryDraft, expectedVersion: 1,
    });
    assert.equal(staleDirectoryUpdate.response.status, 409, 'Eski sürümle gelen güncelleme kaydı ezmemeli.');

    const directoryArchive = await api(base, processOwner, 'ced/directory/'+directoryContactId, 'DELETE', {});
    assert.equal(directoryArchive.response.status, 204);
    const directoryAfterArchive = await api(base, processOwner, 'ced/directory');
    assert.equal(directoryAfterArchive.response.status, 200);
    assert.ok(!directoryAfterArchive.data.contacts.some((entry: {id:string})=>entry.id===directoryContactId),
      'Arşivlenen kayıt aktif rehber listesinden çıkmalı.');
    const directoryAudit = await pool.query<{count:string}>(
      'SELECT count(*)::text AS count FROM institution_directory_audit_events WHERE contact_id=$1',
      [directoryContactId],
    );
    assert.equal(directoryAudit.rows[0].count, '3', 'Oluşturma, güncelleme ve arşivleme denetim kaydı bırakmalı.');

    const denied = await api(base, employee, 'ced/projects/00000000-0000-4000-8000-000000000001');
    assert.equal(denied.response.status, 403);

    const project = await api(base, projectManager, 'projects', 'POST', {
      name: 'CED API test ' + suffix, status: 'active', memberIds: [userIds[1]],
    });
    assert.equal(project.response.status, 201, JSON.stringify(project.data));
    const projectId = project.data.project.id as string;
    projectIds.push(projectId);
    const initialOpinionList = await api(base, processOwner, 'ced/opinions');
    const initialProjectDrafts = initialOpinionList.data.opinions.filter((item: {projectId:string;status:string})=>item.projectId===projectId);
    assert.equal(initialProjectDrafts.length,8,'Yeni projeye düzenlenebilir varsayılan kurum taslakları eklenmeli.');
    assert.ok(initialProjectDrafts.every((item: {status:string})=>item.status==='draft'));
    const duplicateDefaults = await api(base, processOwner, 'ced/projects/'+projectId+'/opinions/defaults', 'POST', {});
    assert.equal(duplicateDefaults.response.status,201,JSON.stringify(duplicateDefaults.data));
    assert.equal(duplicateDefaults.data.createdCount,0,'Varsayılan listesi tekrar çağrıldığında kopya üretmemeli.');

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
    const futureApplicationDate = await api(base, processOwner, 'ced/cases/' + caseId, 'PATCH', {
      version: afterApplicationDate.data.case.version,
      applicationSubmittedOn: '2099-01-01',
    });
    assert.equal(futureApplicationDate.response.status, 400);
    const updateWithoutApplicationDate = await api(base, processOwner, 'ced/cases/' + caseId, 'PATCH', {
      version: afterApplicationDate.data.case.version,
      notes: 'Resmî başvuru tarihi diğer alanlar düzenlenirken korunmalı.',
    });
    assert.equal(updateWithoutApplicationDate.response.status, 200, JSON.stringify(updateWithoutApplicationDate.data));
    const preservedApplicationDate = await api(base, processOwner, 'ced/projects/' + projectId);
    assert.equal(preservedApplicationDate.data.case.applicationSubmittedOn, '2026-03-06');
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
      contactPerson: 'Ayşe Test',
      contactTitle: 'Uzman',
      contactDepartment: 'ÇED ve İzinler',
      contactPhone: '+90 312 000 00 00',
      contactEmail: 'ayse.test@example.com',
      contactAddress: 'Ankara',
      notes: 'Entegrasyon testi kaydı',
    });
    assert.equal(opinionCreated.response.status, 201, JSON.stringify(opinionCreated.data));
    const opinionList = await api(base, processOwner, 'ced/opinions');
    assert.equal(opinionList.response.status, 200);
    const listedOpinion = opinionList.data.opinions.find((item: { institutionName: string }) => item.institutionName === 'Ankara İl Müdürlüğü');
    assert.ok(listedOpinion, 'Yeni kurum görüşü genel listede görünmeli.');
    assert.equal(listedOpinion.projectId, projectId);
    assert.equal(listedOpinion.status, 'waiting');
    assert.equal(listedOpinion.contactPhone, '+90 312 000 00 00');
    assert.equal(listedOpinion.contactEmail, 'ayse.test@example.com');
    const directory = await api(base, processOwner, 'ced/contacts');
    assert.equal(directory.response.status,200,JSON.stringify(directory.data));
    const directoryEntry = directory.data.contacts.find((item: {email:string})=>item.email==='ayse.test@example.com');
    assert.ok(directoryEntry,'Kurum görüşüne girilen ilgili kişi rehberde görünmeli.');
    assert.equal(directoryEntry.institutionName,'Ankara İl Müdürlüğü');
    assert.equal(directoryEntry.contactPerson,'Ayşe Test');

    const pendingDirectory = await api(base,processOwner,'ced/directory');
    assert.equal(pendingDirectory.response.status,200,JSON.stringify(pendingDirectory.data));
    const pendingContact = pendingDirectory.data.contacts.find((item:{id:string})=>item.id===directoryEntry.id);
    assert.ok(pendingContact,'Görüş formundan gelen iletişim Kurum Rehberi inceleme listesinde görünmeli.');
    assert.equal(pendingContact.directoryVisible,false,'Proje görüşü iletişimi teyit edilmeden ortak rehber kaydı sayılmamalı.');
    assert.equal(pendingContact.verifiedAt,null);
    directoryContactIds.push(pendingContact.id);

    const employeePendingDirectory = await api(base,employee,'ced/directory');
    assert.equal(employeePendingDirectory.response.status,200);
    assert.ok(!employeePendingDirectory.data.contacts.some((item:{id:string})=>item.id===pendingContact.id),
      'Proje üyesi olmayan çalışan başka projenin teyit bekleyen iletişim bilgisini görmemeli.');

    const promotedContact = await api(base,processOwner,'ced/directory/'+pendingContact.id,'PATCH',{
      institutionName:pendingContact.institutionName,
      institutionType:'Kamu kurumu',
      website:'',
      contactPerson:pendingContact.contactPerson,
      title:pendingContact.title,
      department:pendingContact.department,
      phone:pendingContact.phone,
      email:pendingContact.email,
      address:pendingContact.address,
      sourceLabel:'Proje kurum görüşü kaydı · kullanıcı tarafından teyit edildi',
      sourceReference:'CI sentetik kurum görüşü kaynağı',
      verifiedAt:'2026-11-05',
      expectedVersion:pendingContact.version,
    });
    assert.equal(promotedContact.response.status,200,JSON.stringify(promotedContact.data));
    assert.equal(promotedContact.data.contact.directoryVisible,true);
    assert.equal(promotedContact.data.contact.verifiedAt,'2026-11-05');
    const employeeAfterPromotion = await api(base,employee,'ced/directory');
    assert.ok(employeeAfterPromotion.data.contacts.some((item:{id:string})=>item.id===pendingContact.id),
      'Yetkili tarafından rehbere aktarılan iletişim çalışanlar için ortak görünür olmalı.');

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

    const calculatedOpinion = await api(base,processOwner,'ced/projects/'+opinionOnlyProjectId+'/opinions','POST',{
      institutionName:'CI Süre Kuralı Kurumu',
      subject:'Onaylı iş günü kuralı entegrasyon kaydı',
      status:'waiting',
      requestDate:'2026-11-06',
      deadlineBasis:'rule_calculated',
      deadlineRuleVersionId:firstRuleVersionId,
      deadlineStartDate:'2026-11-06',
      deadlineStartEventLabel:ruleDraft.startEventLabel,
      deadlineReason:'Onaylı test kuralı ile başlangıç tarihi doğrulandı.',
    });
    assert.equal(calculatedOpinion.response.status,201,JSON.stringify(calculatedOpinion.data));
    const calculatedOpinionId=calculatedOpinion.data.opinionId as string;
    deadlineOpinionIds.push(calculatedOpinionId);
    const calculatedList=await api(base,processOwner,'ced/opinions');
    const calculatedRow=calculatedList.data.opinions.find((item:{id:string})=>item.id===calculatedOpinionId);
    assert.equal(calculatedRow.deadlineDate,'2026-11-11');
    assert.equal(calculatedRow.deadlineBasis,'rule_calculated');
    assert.equal(calculatedRow.deadlineRuleVersion,1);
    assert.equal(calculatedRow.deadlineRuleName,ruleDraft.name);
    assert.equal(calculatedRow.deadlineStartEventLabel,ruleDraft.startEventLabel);
    assert.ok(calculatedRow.deadlineCalculatedAt);

    const invalidOverride=await api(base,processOwner,'ced/opinions/'+calculatedOpinionId,'PATCH',{
      version:calculatedRow.version,
      deadlineBasis:'manual',
      deadlineRuleVersionId:null,
      deadlineStartDate:null,
      deadlineStartEventLabel:'',
      deadlineDate:'2026-11-12',
      deadlineReason:'',
    });
    assert.equal(invalidOverride.response.status,400,'Manuel son tarih düzeltmesi gerekçesiz kaydedilmemeli.');
    const validOverride=await api(base,processOwner,'ced/opinions/'+calculatedOpinionId,'PATCH',{
      version:calculatedRow.version,
      deadlineBasis:'manual',
      deadlineRuleVersionId:null,
      deadlineStartDate:null,
      deadlineStartEventLabel:'',
      deadlineDate:'2026-11-12',
      deadlineReason:'Kurum yazısındaki özel süre notu nedeniyle sorumlu tarafından düzeltildi.',
    });
    assert.equal(validOverride.response.status,200,JSON.stringify(validOverride.data));
    const deadlineHistory=await pool.query<{action:string;reason:string;start_event_label:string}>(
      'SELECT action,reason,start_event_label FROM ced_opinion_deadline_events WHERE opinion_id=$1 ORDER BY created_at',[calculatedOpinionId],
    );
    assert.deepEqual(deadlineHistory.rows.map(row=>row.action),['rule_applied','manual_override']);
    assert.equal(deadlineHistory.rows[0].start_event_label,ruleDraft.startEventLabel);
    assert.match(deadlineHistory.rows[1].reason,/özel süre notu/);

    const secondRuleDraft={...ruleDraft};
    delete (secondRuleDraft as Partial<typeof ruleDraft>).name;
    delete (secondRuleDraft as Partial<typeof ruleDraft>).description;
    secondRuleDraft.dayCount=5;
    const secondVersion=await api(base,processOwner,'ced/deadline-rules/'+deadlineRuleId+'/versions','POST',secondRuleDraft);
    assert.equal(secondVersion.response.status,201,JSON.stringify(secondVersion.data));
    const secondRuleVersionId=secondVersion.data.rule.draftVersionId as string;
    const beforeSecondApproval=await api(base,processOwner,'ced/deadline-rules');
    const stillFirst=(beforeSecondApproval.data.rules.find((rule:{id:string})=>rule.id===deadlineRuleId));
    assert.equal(stillFirst.currentVersionId,firstRuleVersionId,'Yeni taslak, mevcut onaylı sürümü değiştirmemeli.');
    const approveSecond=await api(base,processOwner,
      'ced/deadline-rules/'+deadlineRuleId+'/versions/'+secondRuleVersionId+'/approve','POST',{});
    assert.equal(approveSecond.response.status,200,JSON.stringify(approveSecond.data));
    const historicalPreview=await api(base,processOwner,
      'ced/deadline-rule-versions/'+firstRuleVersionId+'/preview?startDate=2026-11-06');
    assert.equal(historicalPreview.response.status,200,
      'Eski onaylı sürüm, o sürümle oluşturulan kayıtların yeniden açılabilmesi için önizlenebilmeli.');
    assert.equal(historicalPreview.data.preview.deadlineDate,'2026-11-11');
    const staleRuleCreate=await api(base,processOwner,'ced/projects/'+opinionOnlyProjectId+'/opinions','POST',{
      institutionName:'CI Eski Kural',subject:'Eski sürüm yeni kayıtta kullanılamaz',
      status:'waiting',requestDate:'2026-11-06',deadlineBasis:'rule_calculated',
      deadlineRuleVersionId:firstRuleVersionId,deadlineStartDate:'2026-11-06',
    });
    assert.equal(staleRuleCreate.response.status,409,'Yeni görüşte eski sürüm seçilememeli.');
    const latestPreview=await api(base,processOwner,
      'ced/deadline-rule-versions/'+secondRuleVersionId+'/preview?startDate=2026-11-06');
    assert.equal(latestPreview.response.status,200);
    assert.equal(latestPreview.data.preview.deadlineDate,'2026-11-16');
    const immutableVersion=await api(base,processOwner,
      'ced/deadline-rules/'+deadlineRuleId+'/versions/'+firstRuleVersionId,'PATCH',ruleDraft);
    assert.equal(immutableVersion.response.status,409,'Onaylanan sürüm değiştirilememeli.');


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
    assert.equal(projectOpinions.length,11,'Sekiz varsayılan taslak, süre kuralıyla oluşturulan kayıt ve iki doğrudan görüş görünmeli.');
    const projectRecordedOpinions = projectOpinions.filter((item: {status:string})=>item.status!=='draft');
    assert.equal(projectRecordedOpinions.length,3,'Süre kuralı kaydı ve iki doğrudan görüş taslak dışı kayıtlardır.');
    assert.deepEqual(new Set(projectRecordedOpinions.map((item: {status:string})=>item.status)),new Set(['waiting','positive','revision']));
    const projectOpinionToUpdate = projectRecordedOpinions[0] as {id:string;version:number;subject:string};
    const updatedProjectOpinion = await api(base, processOwner, 'ced/opinions/' + projectOpinionToUpdate.id, 'PATCH', {
      version: projectOpinionToUpdate.version, subject: projectOpinionToUpdate.subject + ' · güncellendi',
    });
    assert.equal(updatedProjectOpinion.response.status,200,JSON.stringify(updatedProjectOpinion.data));
    const beforeCase = await api(base, processOwner, 'ced/projects/' + opinionOnlyProjectId);
    assert.equal(beforeCase.data.case,null,'Kurum görüşü için gerçek süreç kaydı oluşana kadar ÇED dosyası olmamalı.');
    assert.equal(beforeCase.data.opinions.length,11,'ÇED dosyası olmadan varsayılanlar ve proje görüşleri okunabilmeli.');
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
    for (const stage of (activeFullStages.data.stages as Array<{id:string;stageKey:string;sortOrder:number;status:string;version:number;requiredDocumentType:string|null}>)
      .filter(stage=>stage.sortOrder>45&&stage.stageKey!=='decision')) {
      if (stage.requiredDocumentType) {
        const milestoneDocument = await api(base, processOwner, 'ced/cases/' + finalPtdCaseId + '/documents', 'POST', {
          stageId:stage.id,
          documentType:stage.requiredDocumentType,
          title:'Sentetik test belgesi · ' + stage.stageKey,
          sourceType:'eced_reference',
          sourceReference:'CI-TEST-' + suffix + '-' + stage.stageKey,
          versionLabel:'TEST',
        });
        assert.equal(milestoneDocument.response.status,201,JSON.stringify(milestoneDocument.data));
      } else {
        const completedStage = await api(base, processOwner, 'ced/stages/' + stage.id, 'PATCH', {
          version:stage.version,status:'completed',
        });
        assert.equal(completedStage.response.status,200,JSON.stringify(completedStage.data));
      }
    }
    const readyForDecision = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    const finalNegative = await api(base, processOwner, 'ced/cases/' + finalPtdCaseId, 'PATCH', {
      version:readyForDecision.data.case.version,decision:'ced_negative',closedOn:null,
    });
    assert.equal(finalNegative.response.status,200,JSON.stringify(finalNegative.data));
    const completedFullProcess = await api(base, processOwner, 'ced/projects/' + fullCedProjectId);
    assert.equal(completedFullProcess.data.case.decision,'ced_negative');
    assert.ok(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(completedFullProcess.data.case.closedOn));
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
      await cleanup.query('ALTER TABLE ced_opinion_deadline_events DISABLE TRIGGER ced_opinion_deadline_events_append_only');
      // Remove deadline events for every opinion created under this test's own
      // cases/projects before deleting those opinions. The audit FK is RESTRICT
      // by design, so deleting only the rule-calculated fixture is insufficient.
      await cleanup.query(
        `DELETE FROM ced_opinion_deadline_events
         WHERE opinion_id IN (
           SELECT id FROM ced_institution_opinions
           WHERE ($1::uuid IS NOT NULL AND case_id=$1)
              OR project_id=ANY($2::uuid[])
         )`,
        [caseId || null, projectIds],
      );
      if(deadlineOpinionIds.length) {
        await cleanup.query('DELETE FROM ced_opinion_deadline_events WHERE opinion_id=ANY($1::uuid[])',[deadlineOpinionIds]);
      }
      await cleanup.query('ALTER TABLE ced_opinion_deadline_events ENABLE TRIGGER ced_opinion_deadline_events_append_only');
      await cleanup.query('ALTER TABLE ced_deadline_rule_audit_events DISABLE TRIGGER ced_deadline_rule_audit_events_append_only');
      if(deadlineRuleIds.length) {
        await cleanup.query('DELETE FROM ced_deadline_rule_audit_events WHERE rule_id=ANY($1::uuid[])',[deadlineRuleIds]);
        await cleanup.query('UPDATE ced_deadline_rule_families SET current_version_id=NULL WHERE id=ANY($1::uuid[])',[deadlineRuleIds]);
      }
      await cleanup.query('ALTER TABLE ced_deadline_rule_audit_events ENABLE TRIGGER ced_deadline_rule_audit_events_append_only');
      await cleanup.query('ALTER TABLE ced_deadline_rule_versions DISABLE TRIGGER ced_deadline_rule_versions_immutable');
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
      if(deadlineRuleIds.length) {
        await cleanup.query('DELETE FROM ced_deadline_rule_versions WHERE rule_id=ANY($1::uuid[])',[deadlineRuleIds]);
        await cleanup.query('DELETE FROM ced_deadline_rule_families WHERE id=ANY($1::uuid[])',[deadlineRuleIds]);
      }
      await cleanup.query('ALTER TABLE ced_deadline_rule_versions ENABLE TRIGGER ced_deadline_rule_versions_immutable');
      if (projectIds.length) {
        await cleanup.query('ALTER TABLE project_audit_events DISABLE TRIGGER project_audit_events_append_only');
        await cleanup.query('DELETE FROM project_audit_events WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM project_members WHERE project_id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('DELETE FROM projects WHERE id=ANY($1::uuid[])', [projectIds]);
        await cleanup.query('ALTER TABLE project_audit_events ENABLE TRIGGER project_audit_events_append_only');
      }
      if (directoryContactIds.length) {
        await cleanup.query('ALTER TABLE institution_directory_audit_events DISABLE TRIGGER institution_directory_audit_events_append_only');
        await cleanup.query('DELETE FROM institution_directory_audit_events WHERE contact_id=ANY($1::uuid[])', [directoryContactIds]);
        await cleanup.query('DELETE FROM ced_institution_contacts WHERE id=ANY($1::uuid[])', [directoryContactIds]);
        await cleanup.query('ALTER TABLE institution_directory_audit_events ENABLE TRIGGER institution_directory_audit_events_append_only');
      }
      if (userIds.length) {
        await cleanup.query('DELETE FROM ced_institution_contacts WHERE created_by=ANY($1::uuid[]) OR updated_by=ANY($1::uuid[])', [userIds]);
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
