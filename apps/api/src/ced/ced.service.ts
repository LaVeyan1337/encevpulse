import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { DEFAULT_INSTITUTION_NAMES, DEFAULT_OPINION_SUBJECT } from './institution-defaults.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROUTES = ['ek1_cbd', 'ek2_ptd'] as const;
const DECISIONS = ['pending', 'ced_positive', 'ced_report_required', 'ced_negative', 'outside_scope', 'withdrawn'] as const;
const STAGE_STATUSES = ['pending', 'in_progress', 'waiting', 'completed', 'not_applicable', 'revision_requested'] as const;
const DOCUMENT_TYPES = ['cbd', 'ptd', 'ced_report', 'final_report', 'last_final_report', 'institution_opinion', 'idk_minutes', 'other'] as const;
const SOURCE_TYPES = ['network_path', 'external_url', 'eced_reference', 'other'] as const;
const OPINION_STATUSES = ['draft', 'requested', 'waiting', 'responded', 'revision_requested', 'closed', 'positive', 'negative', 'revision', 'other_request'] as const;
const MEETING_TYPES = ['idk', 'preliminary', 'other'] as const;
const MEETING_STATUSES = ['planned', 'held', 'postponed', 'cancelled'] as const;

type Route = typeof ROUTES[number];
type StageStatus = typeof STAGE_STATUSES[number];
type OpinionStatus = typeof OPINION_STATUSES[number];
type MeetingStatus = typeof MEETING_STATUSES[number];

const BASE_STAGES: Array<{
  key: string; title: string; order: number; documentType?: string; milestone?: boolean;
  route?: 'cbd' | 'ptd';
}> = [
  { key: 'cbd_preparation', title: 'ÇBD hazırlığı', order: 10, route: 'cbd' },
  { key: 'cbd_upload', title: 'ÇBD YÜKLENDİ', order: 20, documentType: 'cbd', milestone: true, route: 'cbd' },
  { key: 'ptd_preparation', title: 'PTD hazırlığı', order: 30, route: 'ptd' },
  { key: 'ptd_upload', title: 'PTD YÜKLENDİ', order: 40, documentType: 'ptd', milestone: true, route: 'ptd' },
  { key: 'ptd_assessment', title: 'PTD değerlendirmesi ve karar bildirimi', order: 45, route: 'ptd' },
  { key: 'initial_review', title: 'Başvuru incelemesi ve eksiklerin tamamlanması', order: 50 },
  { key: 'public_participation', title: 'Halkın bilgilendirilmesi ve sürece katılımı', order: 60 },
  { key: 'special_format', title: 'Komisyon / kapsam ve özel format çalışmaları', order: 70 },
  { key: 'institution_opinions', title: 'Kurum görüşlerinin alınması ve değerlendirilmesi', order: 80 },
  { key: 'report_preparation', title: 'ÇED Raporu hazırlığı', order: 90 },
  { key: 'ced_report_upload', title: 'ÇED RAPORU YÜKLENDİ', order: 100, documentType: 'ced_report', milestone: true },
  { key: 'idk_review', title: 'İDK inceleme ve değerlendirme süreci', order: 110 },
  { key: 'revision', title: 'Eksikliklerin giderilmesi / revizyon', order: 120 },
  { key: 'final_report_upload', title: 'NİHAİ RAPOR YÜKLENDİ', order: 130, documentType: 'final_report', milestone: true },
  { key: 'last_final_review', title: 'Son kontrol ve nihai değerlendirme', order: 140 },
  { key: 'last_final_report_upload', title: 'SON NİHAİ RAPOR YÜKLENDİ', order: 150, documentType: 'last_final_report', milestone: true },
  { key: 'decision', title: 'ÇED kararı ve süreç kapanışı', order: 160 },
];

@Injectable()
export class CedService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getProjectCase(user: AuthUser, projectId: string, includeOpinions: boolean) {
    assertUuid(projectId, 'Proje');
    const client = await this.db.pool.connect();
    try { await this.assertProjectAccess(client, projectId, user.id); }
    finally { client.release(); }
    const found = await this.db.query<{ id: string }>(
      `SELECT id FROM ced_cases WHERE project_id=$1 AND archived_at IS NULL`, [projectId],
    );
    if (!found.rowCount) {
      const opinions = includeOpinions ? await this.db.query(
        `SELECT o.id,o.case_id AS "caseId",o.institution_name AS "institutionName",o.subject,o.status,
         o.request_date::text AS "requestDate",o.deadline_date::text AS "deadlineDate",o.response_date::text AS "responseDate",
         o.outgoing_letter_no AS "outgoingLetterNo",o.incoming_letter_no AS "incomingLetterNo",
         o.contact_person AS "contactPerson",contact.title AS "contactTitle",contact.department AS "contactDepartment",
         contact.phone AS "contactPhone",contact.email AS "contactEmail",contact.address AS "contactAddress",
         o.notes,o.version,o.created_by AS "createdBy",
         creator.display_name AS "creatorName",o.updated_at AS "updatedAt"
         FROM ced_institution_opinions o JOIN users creator ON creator.id=o.created_by
         LEFT JOIN ced_institution_contacts contact ON contact.id=o.contact_id AND contact.archived_at IS NULL
         WHERE o.project_id=$1 AND o.archived_at IS NULL
         ORDER BY o.deadline_date NULLS LAST,o.institution_name,o.created_at`,
        [projectId],
      ) : { rows: [] as any[] };
      return { case: null, stages: [], documents: [], opinions: opinions.rows, meetings: [], activity: [], permissions: { opinions: includeOpinions } };
    }
    return this.loadCase(found.rows[0].id, user.id, includeOpinions);
  }

  async listInstitutionOpinions(user: AuthUser) {
    const result = await this.db.query(
      `SELECT o.id,o.case_id AS "caseId",o.project_id AS "projectId",
        p.name AS "projectName",COALESCE(c.file_number,'') AS "fileNumber",COALESCE(c.eced_reference,'') AS "ecedReference",
        owner.display_name AS "projectOwnerName",
        o.institution_name AS "institutionName",o.subject,o.status,
        o.request_date::text AS "requestDate",o.deadline_date::text AS "deadlineDate",
        o.response_date::text AS "responseDate",o.outgoing_letter_no AS "outgoingLetterNo",
        o.incoming_letter_no AS "incomingLetterNo",o.contact_person AS "contactPerson",
        contact.title AS "contactTitle",contact.department AS "contactDepartment",contact.phone AS "contactPhone",
        contact.email AS "contactEmail",contact.address AS "contactAddress",
        o.notes,o.version,o.updated_at AS "updatedAt"
       FROM ced_institution_opinions o
       JOIN projects p ON p.id=o.project_id
       LEFT JOIN ced_cases c ON c.id=o.case_id
       LEFT JOIN users owner ON owner.id=p.owner_user_id
       LEFT JOIN ced_institution_contacts contact ON contact.id=o.contact_id AND contact.archived_at IS NULL
       WHERE o.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
         AND (o.case_id IS NULL OR c.archived_at IS NULL)
         AND (p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$1
         ))
       ORDER BY CASE WHEN o.status IN ('responded','closed','positive','negative') THEN 1 ELSE 0 END,
         o.deadline_date NULLS LAST,o.updated_at DESC,o.institution_name
       LIMIT 500`,
      [user.id],
    );
    return { opinions: result.rows };
  }

  async listInstitutionContacts(user: AuthUser) {
    const result = await this.db.query(
      `SELECT contact.id,contact.institution_name AS "institutionName",
        contact.contact_person AS "contactPerson",contact.title,contact.department,contact.phone,contact.email,contact.address,
        count(DISTINCT opinion.project_id)::int AS "projectCount",
        max(contact.updated_at) AS "updatedAt"
       FROM ced_institution_contacts contact
       JOIN ced_institution_opinions opinion ON opinion.contact_id=contact.id AND opinion.archived_at IS NULL
       JOIN projects p ON p.id=opinion.project_id AND p.archived_at IS NULL AND p.status<>'archived'
       WHERE contact.archived_at IS NULL
         AND ($2::boolean OR p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$1
         ))
       GROUP BY contact.id
       ORDER BY contact.institution_name,contact.contact_person
       LIMIT 1000`,
      [user.id,user.roles.includes('system_admin')],
    );
    return { contacts: result.rows };
  }

  async addDefaultOpinionDrafts(user: AuthUser, projectId: string) {
    assertUuid(projectId, 'Proje');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertProjectAccess(client, projectId, user.id, true);
      const inserted = await client.query(
        `INSERT INTO ced_institution_opinions(project_id,case_id,institution_name,subject,status,created_by,updated_by)
         SELECT $1,NULL,defaults.institution_name,$2,'draft',$3,$3
         FROM unnest($4::text[]) AS defaults(institution_name)
         WHERE NOT EXISTS (
           SELECT 1 FROM ced_institution_opinions existing
           WHERE existing.project_id=$1 AND existing.archived_at IS NULL
             AND lower(btrim(existing.institution_name))=lower(btrim(defaults.institution_name))
         )
         RETURNING id`,
        [projectId,DEFAULT_OPINION_SUBJECT,user.id,DEFAULT_INSTITUTION_NAMES],
      );
      if (inserted.rowCount) {
        await this.auditProject(client,projectId,'institution_opinion',projectId,'default_drafts_added',
          {count:inserted.rowCount,institutions:DEFAULT_INSTITUTION_NAMES},user.id);
      }
      await client.query('COMMIT');
      return {ok:true,createdCount:inserted.rowCount??0};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async archiveOpinion(user: AuthUser, opinionId: string) {
    assertUuid(opinionId, 'Kurum görüşü');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query(
        `SELECT id,project_id AS "projectId",case_id AS "caseId",institution_name AS "institutionName"
         FROM ced_institution_opinions WHERE id=$1 AND archived_at IS NULL FOR UPDATE`,
        [opinionId],
      );
      if (!found.rowCount) throw new NotFoundException({code:'CED_OPINION_NOT_FOUND',message:'Kurum görüşü kaydı bulunamadı.'});
      const row = found.rows[0];
      await this.assertProjectAccess(client,row.projectId,user.id);
      await client.query(
        `UPDATE ced_institution_opinions SET archived_at=now(),updated_by=$1,updated_at=now(),version=version+1 WHERE id=$2`,
        [user.id,opinionId],
      );
      if (row.caseId) await this.audit(client,row.caseId,'institution_opinion',opinionId,'archived',{institutionName:row.institutionName},user.id);
      else await this.auditProject(client,row.projectId,'institution_opinion',opinionId,'archived',{institutionName:row.institutionName},user.id);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createProjectCase(user: AuthUser, projectId: string, input: unknown) {
    assertUuid(projectId, 'Proje');
    const value = objectInput(input);
    assertKeys(value, ['routeCode', 'fileNumber', 'ecedReference', 'startedOn', 'applicationSubmittedOn', 'notes']);
    const routeCode = enumValue(value.routeCode, ROUTES, 'ÇED başvuru yolu') as Route;
    const fileNumber = boundedText(value.fileNumber ?? '', 0, 120, 'Dosya numarası');
    const ecedReference = boundedText(value.ecedReference ?? '', 0, 160, 'e-ÇED referansı');
    const startedOn = optionalDate(value.startedOn, 'Başlangıç tarihi');
    const applicationSubmittedOn = applicationSubmissionDate(value.applicationSubmittedOn);
    const notes = boundedText(value.notes ?? '', 0, 6000, 'Açıklama');
    const client = await this.db.pool.connect();
    let caseId = '';
    let promoted = false;
    try {
      await client.query('BEGIN');
      await this.assertProjectAccess(client, projectId, user.id, true);
      const existing = await client.query<{ id: string; case_origin: string; archived_at: string | null }>(
        'SELECT id,case_origin,archived_at FROM ced_cases WHERE project_id=$1 FOR UPDATE', [projectId],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.archived_at) throw new ConflictException({ code: 'CED_CASE_ARCHIVED', message: 'Bu projenin eski ÇED kaydı arşivlenmiş. Yeni süreç açmadan önce mevcut kayıt gözden geçirilmelidir.' });
        if (row.case_origin !== 'opinion_workspace') throw new ConflictException({ code: 'CED_CASE_EXISTS', message: 'Bu proje için açık bir ÇED süreç kaydı zaten var.' });
        caseId = row.id;
        promoted = true;
        await client.query(
          `UPDATE ced_cases SET route_code=$1,file_number=$2,eced_reference=$3,started_on=$4,application_submitted_on=$5,notes=$6,
           case_origin='process',decision='pending',updated_by=$7,updated_at=now(),version=version+1 WHERE id=$8`,
          [routeCode,fileNumber,ecedReference,startedOn,applicationSubmittedOn,notes,user.id,caseId],
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO ced_cases(project_id,route_code,file_number,eced_reference,started_on,application_submitted_on,notes,case_origin,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,'process',$8,$8) RETURNING id`,
          [projectId, routeCode, fileNumber, ecedReference, startedOn, applicationSubmittedOn, notes, user.id],
        );
        caseId = inserted.rows[0].id;
      }
      for (const stage of BASE_STAGES) {
        const routeNotUsed = (stage.route === 'cbd' && routeCode === 'ek2_ptd') ||
          (stage.route === 'ptd' && routeCode === 'ek1_cbd');
        // Ek-2 stays on the PTD branch until the official result activates or closes the ÇED sequence.
        const awaitingPtdOutcome = routeCode === 'ek2_ptd' && stage.order > 45;
        const status = routeNotUsed || awaitingPtdOutcome ? 'not_applicable' : 'pending';
        await client.query(
          `INSERT INTO ced_case_stages(case_id,stage_key,title,sort_order,status,required_document_type,is_milestone,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)
           ON CONFLICT(case_id,stage_key) DO NOTHING`,
          [caseId, stage.key, stage.title, stage.order, status, stage.documentType ?? null, Boolean(stage.milestone), user.id],
        );
      }
      await this.audit(client, caseId, 'case', caseId, promoted ? 'promoted_to_process' : 'created',
        { routeCode, applicationSubmittedOn, stagesCreated: BASE_STAGES.length, promotedFromOpinionWorkspace: promoted }, user.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    finally { client.release(); }
    return { ok: true, caseId, promoted };
  }

  async updateCase(user: AuthUser, caseId: string, input: unknown) {
    assertUuid(caseId, 'ÇED kaydı');
    const value = objectInput(input);
    assertKeys(value, ['version', 'decision', 'fileNumber', 'ecedReference', 'startedOn', 'applicationSubmittedOn', 'closedOn', 'notes']);
    assertVersion(value.version);
    if (Object.keys(value).length === 1) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.loadAccessibleCase(client, caseId, user.id, true);
      if (current.version !== Number(value.version)) throw new ConflictException({ code: 'CED_CASE_CHANGED', message: 'ÇED kaydı başka bir işlemde güncellendi. Yenileyip tekrar deneyin.' });
      const decision = Object.hasOwn(value, 'decision') ? enumValue(value.decision, DECISIONS, 'ÇED kararı') : current.decision;
      const routeCode = String(current.route_code);
      const decisionWasSubmitted = Object.hasOwn(value, 'decision');
      const finalEk2Decision = routeCode === 'ek2_ptd' && current.decision === 'ced_report_required'
        && ['ced_positive','ced_negative'].includes(decision);
      if (decisionWasSubmitted && routeCode === 'ek2_ptd'
        && !['pending','ced_positive','ced_report_required','withdrawn'].includes(decision) && !finalEk2Decision) {
        throw invalid('Ek-2 / PTD sürecinde ÇED Olumlu veya ÇED Raporu Hazırlanmalıdır sonucu seçilebilir. Tam ÇED süreci açıldıktan sonra ÇED Olumsuz kararı da kaydedilebilir.');
      }
      if (decisionWasSubmitted && routeCode === 'ek1_cbd' && !['pending','ced_positive','ced_negative','withdrawn'].includes(decision)) {
        throw invalid('Ek-1 / ÇBD sürecinde seçilen karar bu başvuru yoluyla uyumlu değil.');
      }
      if (routeCode === 'ek2_ptd' && decisionWasSubmitted && decision !== current.decision && !finalEk2Decision) {
        const progressed = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ced_case_stages
           WHERE case_id=$1 AND sort_order>45
             AND status NOT IN ('not_applicable','pending')`,
          [caseId],
        );
        if (decision !== 'ced_report_required' && Number(progressed.rows[0]?.count ?? 0) > 0) {
          throw new ConflictException({
            code: 'CED_PTD_DECISION_HAS_PROGRESS',
            message: 'PTD kararı sonrası ÇED aşamalarında ilerleme kaydı var. Karar değiştirilecekse önce bu ilerleme kayıtları süreç sorumlusu tarafından gözden geçirilmelidir.',
          });
        }
        if (decision === 'ced_report_required') {
          await client.query(
            `UPDATE ced_case_stages SET status='completed',completed_at=COALESCE(completed_at,now()),
             updated_by=$1,updated_at=now(),version=version+1
             WHERE case_id=$2 AND stage_key='ptd_assessment' AND status<>'completed'`,
            [user.id,caseId],
          );
          await client.query(
            `UPDATE ced_case_stages SET status='pending',completed_at=NULL,updated_by=$1,updated_at=now(),version=version+1
             WHERE case_id=$2 AND sort_order>45 AND status='not_applicable'`,
            [user.id,caseId],
          );
        } else if (decision === 'ced_positive' || decision === 'pending' || decision === 'withdrawn') {
          if (decision === 'pending') {
            await client.query(
              `UPDATE ced_case_stages SET status='pending',completed_at=NULL,updated_by=$1,updated_at=now(),version=version+1
               WHERE case_id=$2 AND stage_key='ptd_assessment'`,
              [user.id,caseId],
            );
          } else if (decision === 'ced_positive') {
            await client.query(
              `UPDATE ced_case_stages SET status='completed',completed_at=COALESCE(completed_at,now()),
               updated_by=$1,updated_at=now(),version=version+1
               WHERE case_id=$2 AND stage_key='ptd_assessment' AND status<>'completed'`,
              [user.id,caseId],
            );
          }
          await client.query(
            `UPDATE ced_case_stages SET status='not_applicable',completed_at=NULL,updated_by=$1,updated_at=now(),version=version+1
             WHERE case_id=$2 AND sort_order>45 AND status<>'not_applicable'`,
            [user.id,caseId],
          );
        }
      }
      if (finalEk2Decision) {
        const incomplete = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM ced_case_stages
           WHERE case_id=$1 AND sort_order>45 AND stage_key<>'decision'
             AND status NOT IN ('completed','not_applicable')`,
          [caseId],
        );
        if (Number(incomplete.rows[0]?.count ?? 0) > 0) {
          throw invalid('Tam ÇED kararı kaydedilmeden önce etkin süreç aşamaları tamamlanmalı veya uygulanamaz olarak işaretlenmelidir.');
        }
        await client.query(
          `UPDATE ced_case_stages SET status='completed',completed_at=COALESCE(completed_at,now()),
           updated_by=$1,updated_at=now(),version=version+1
           WHERE case_id=$2 AND stage_key='decision' AND status<>'completed'`,
          [user.id,caseId],
        );
      }
      const fileNumber = Object.hasOwn(value, 'fileNumber') ? boundedText(value.fileNumber, 0, 120, 'Dosya numarası') : current.file_number;
      const ecedReference = Object.hasOwn(value, 'ecedReference') ? boundedText(value.ecedReference, 0, 160, 'e-ÇED referansı') : current.eced_reference;
      const startedOn = Object.hasOwn(value, 'startedOn') ? optionalDate(value.startedOn, 'Başlangıç tarihi') : current.started_on;
      const applicationSubmittedOn = Object.hasOwn(value, 'applicationSubmittedOn')
        ? applicationSubmissionDate(value.applicationSubmittedOn)
        : (current.application_submitted_on_text ? String(current.application_submitted_on_text).slice(0, 10) : null);
      const hasClosedOnInput = Object.hasOwn(value, 'closedOn');
      const closedOnIsBlank = !hasClosedOnInput || value.closedOn === null || value.closedOn === '';
      const clearPtdClosure = routeCode === 'ek2_ptd' && ['pending','ced_report_required'].includes(decision) && closedOnIsBlank;
      const closePtdTerminal = (
        (routeCode === 'ek2_ptd' && ['ced_positive','ced_negative','withdrawn'].includes(decision)) ||
        (routeCode === 'ek1_cbd' && ['ced_positive','ced_negative','withdrawn'].includes(decision))
      ) && closedOnIsBlank;
      const submittedClosedOn = hasClosedOnInput && !closedOnIsBlank ? optionalDate(value.closedOn, 'Kapanış tarihi') : null;
      const closedOn = submittedClosedOn ?? (clearPtdClosure ? null : current.closed_on);
      const notes = Object.hasOwn(value, 'notes') ? boundedText(value.notes, 0, 6000, 'Açıklama') : current.notes;
      await client.query(
        `UPDATE ced_cases SET decision=$1,file_number=$2,eced_reference=$3,started_on=$4,
         closed_on=CASE WHEN $9::boolean AND $5::date IS NULL THEN CURRENT_DATE ELSE $5::date END,
         notes=$6,updated_by=$7,updated_at=now(),version=version+1,application_submitted_on=$10 WHERE id=$8`,
        [decision, fileNumber, ecedReference, startedOn, closedOn, notes, user.id, caseId, closePtdTerminal, applicationSubmittedOn],
      );
      await this.audit(client, caseId, 'case', caseId, 'updated',
        { decision, routeCode, fileNumber, ecedReference, startedOn, applicationSubmittedOn, closedOn: closePtdTerminal && !closedOn ? 'CURRENT_DATE' : closedOn }, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async createStage(user: AuthUser, caseId: string, input: unknown) {
    assertUuid(caseId, 'ÇED kaydı');
    const value = objectInput(input);
    assertKeys(value, ['title', 'sortOrder', 'dueOn', 'notes']);
    const title = boundedText(value.title, 2, 180, 'Aşama adı');
    const sortOrder = value.sortOrder === undefined ? 85 : Number(value.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) throw invalid('Aşama sırası geçersiz.');
    const dueOn = optionalDate(value.dueOn, 'Hedef tarihi');
    const notes = boundedText(value.notes ?? '', 0, 3000, 'Açıklama');
    const client = await this.db.pool.connect();
    let stageId = '';
    try {
      await client.query('BEGIN');
      await this.loadAccessibleCase(client, caseId, user.id, true);
      const routeState = await client.query<{ route_code: string; decision: string }>(
        'SELECT route_code,decision FROM ced_cases WHERE id=$1', [caseId],
      );
      const ptdLocked = routeState.rows[0]?.route_code === 'ek2_ptd' && routeState.rows[0]?.decision !== 'ced_report_required' && sortOrder > 45;
      const initialStatus: StageStatus = ptdLocked ? 'not_applicable' : 'pending';
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ced_case_stages(case_id,stage_key,title,sort_order,status,is_custom,due_on,notes,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,true,$6,$7,$8,$8) RETURNING id`,
        [caseId, 'custom_' + randomUUID(), title, sortOrder, initialStatus, dueOn, notes, user.id],
      );
      stageId = inserted.rows[0].id;
      await this.audit(client, caseId, 'stage', stageId, 'created', { title, sortOrder, dueOn }, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async updateStage(user: AuthUser, stageId: string, input: unknown) {
    assertUuid(stageId, 'Aşama');
    const value = objectInput(input);
    assertKeys(value, ['version', 'title', 'status', 'sortOrder', 'dueOn', 'notes']);
    assertVersion(value.version);
    if (Object.keys(value).length === 1) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    const client = await this.db.pool.connect();
    let caseId = '';
    try {
      await client.query('BEGIN');
      const found = await client.query<any>(
        `SELECT s.*,c.project_id,c.route_code,c.decision FROM ced_case_stages s JOIN ced_cases c ON c.id=s.case_id
         WHERE s.id=$1 AND s.archived_at IS NULL FOR UPDATE OF s`, [stageId],
      );
      if (!found.rowCount) throw new NotFoundException({ code: 'CED_STAGE_NOT_FOUND', message: 'ÇED aşaması bulunamadı.' });
      const stage = found.rows[0];
      caseId = stage.case_id;
      await this.assertProjectAccess(client, stage.project_id, user.id);
      const stageLockedByPtd = stage.route_code === 'ek2_ptd' && stage.decision !== 'ced_report_required'
        && Number(stage.sort_order) > 45;
      if (stageLockedByPtd && Object.hasOwn(value, 'status') && value.status !== 'not_applicable') {
        throw invalid('PTD kararı verilmeden sonraki ÇED aşamaları etkinleştirilemez.');
      }
      if (stage.version !== Number(value.version)) throw new ConflictException({ code: 'CED_STAGE_CHANGED', message: 'Aşama başka bir işlemde güncellendi. Yenileyip tekrar deneyin.' });
      if (Object.hasOwn(value, 'status')) {
        const status = enumValue(value.status, STAGE_STATUSES, 'Aşama durumu') as StageStatus;
        if (status === 'completed' && stage.required_document_type) {
          const document = await client.query('SELECT 1 FROM ced_documents WHERE stage_id=$1 AND archived_at IS NULL LIMIT 1', [stageId]);
          if (!document.rowCount) throw invalid('Bu belge kilometre taşını tamamlamak için belge kaydı ve kaynak konumu eklemelisiniz.');
        }
      }
      const title = Object.hasOwn(value, 'title') ? boundedText(value.title, 2, 180, 'Aşama adı') : stage.title;
      const status = Object.hasOwn(value, 'status') ? enumValue(value.status, STAGE_STATUSES, 'Aşama durumu') : stage.status;
      const sortOrder = Object.hasOwn(value, 'sortOrder') ? Number(value.sortOrder) : stage.sort_order;
      if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 10000) throw invalid('Aşama sırası geçersiz.');
      const dueOn = Object.hasOwn(value, 'dueOn') ? optionalDate(value.dueOn, 'Hedef tarihi') : stage.due_on;
      const notes = Object.hasOwn(value, 'notes') ? boundedText(value.notes, 0, 3000, 'Açıklama') : stage.notes;
      await client.query(
        `UPDATE ced_case_stages SET title=$1,status=$2,sort_order=$3,due_on=$4,notes=$5,
         completed_at=CASE WHEN $2='completed' THEN COALESCE(completed_at,now()) ELSE NULL END,
         updated_by=$6,updated_at=now(),version=version+1 WHERE id=$7`,
        [title, status, sortOrder, dueOn, notes, user.id, stageId],
      );
      await this.audit(client, caseId, 'stage', stageId, 'updated', { title, status, sortOrder, dueOn }, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async createDocument(user: AuthUser, caseId: string, input: unknown) {
    assertUuid(caseId, 'ÇED kaydı');
    const value = objectInput(input);
    assertKeys(value, ['stageId', 'meetingId', 'documentType', 'title', 'sourceType', 'sourceReference', 'versionLabel', 'documentDate', 'notes']);
    const documentType = enumValue(value.documentType, DOCUMENT_TYPES, 'Belge türü');
    const title = boundedText(value.title, 2, 200, 'Belge adı');
    const sourceType = enumValue(value.sourceType, SOURCE_TYPES, 'Belge kaynağı');
    const sourceReference = boundedText(value.sourceReference, 1, 1200, 'Belge konumu / referansı');
    const versionLabel = boundedText(value.versionLabel ?? '', 0, 80, 'Sürüm');
    const documentDate = optionalDate(value.documentDate, 'Belge tarihi');
    const notes = boundedText(value.notes ?? '', 0, 3000, 'Açıklama');
    const stageId = optionalUuid(value.stageId, 'Aşama');
    const meetingId = optionalUuid(value.meetingId, 'Toplantı');
    if (stageId && meetingId) throw invalid('Belge bir aşamaya veya toplantıya bağlanabilir; ikisine birden bağlanamaz.');
    if (sourceType === 'external_url' && !/^https?:\/\//i.test(sourceReference)) throw invalid('Dış bağlantı http:// veya https:// ile başlamalıdır.');
    if (sourceType === 'network_path' && !/^(\\\\|[A-Za-z]:\\)/.test(sourceReference)) throw invalid('Ağ yolu \\\\sunucu\\paylaşım veya C:\\klasör biçiminde olmalıdır.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.loadAccessibleCase(client, caseId, user.id, true);
      if (stageId) {
        const stage = await client.query<{ required_document_type: string | null; status: StageStatus; sort_order: number; is_custom: boolean; route_code: string; decision: string }>(
          `SELECT s.required_document_type,s.status,s.sort_order,s.is_custom,c.route_code,c.decision
           FROM ced_case_stages s JOIN ced_cases c ON c.id=s.case_id
           WHERE s.id=$1 AND s.case_id=$2 AND s.archived_at IS NULL FOR UPDATE OF s`, [stageId, caseId],
        );
        if (!stage.rowCount) throw invalid('Seçilen aşama bu ÇED kaydına ait değil.');
        const ptdLocked = stage.rows[0].route_code === 'ek2_ptd' && stage.rows[0].decision !== 'ced_report_required'
          && Number(stage.rows[0].sort_order) > 45;
        if (ptdLocked || stage.rows[0].status === 'not_applicable') throw invalid('PTD kararı verilmeden veya uygulanamaz durumdayken bu aşamaya belge bağlanamaz.');
        if (stage.rows[0].required_document_type && stage.rows[0].required_document_type !== documentType) {
          throw invalid('Belge türü seçilen kilometre taşıyla eşleşmiyor.');
        }
      }
      if (meetingId) {
        const meeting = await client.query('SELECT 1 FROM ced_idk_meetings WHERE id=$1 AND case_id=$2 AND archived_at IS NULL', [meetingId, caseId]);
        if (!meeting.rowCount) throw invalid('Seçilen toplantı bu ÇED kaydına ait değil.');
      }
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ced_documents(case_id,stage_id,meeting_id,document_type,title,source_type,source_reference,version_label,document_date,notes,created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [caseId, stageId, meetingId, documentType, title, sourceType, sourceReference, versionLabel, documentDate, notes, user.id],
      );
      const documentId = inserted.rows[0].id;
      if (stageId) {
        await client.query(
          `UPDATE ced_case_stages SET status='completed',completed_at=COALESCE(completed_at,now()),updated_by=$1,updated_at=now(),version=version+1
           WHERE id=$2 AND required_document_type IS NOT NULL`, [user.id, stageId],
        );
      }
      await this.audit(client, caseId, documentType === 'institution_opinion' ? 'institution_opinion' : 'document', documentId, 'registered', { documentType, title, sourceType, sourceReference, versionLabel, stageId, meetingId }, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async createOpinionForProject(user: AuthUser, projectId: string, input: unknown) {
    assertUuid(projectId, 'Proje');
    const value = objectInput(input);
    assertKeys(value, ['institutionName', 'subject', 'status', 'requestDate', 'deadlineDate', 'responseDate', 'outgoingLetterNo', 'incomingLetterNo', 'contactPerson', 'contactTitle', 'contactDepartment', 'contactPhone', 'contactEmail', 'contactAddress', 'notes']);
    const draft = validateOpinion(value);
    const client = await this.db.pool.connect();
    let opinionId = '';
    try {
      await client.query('BEGIN');
      // Lock the project row to serialize simultaneous submissions without creating a fake ÇED case.
      await this.assertProjectAccess(client, projectId, user.id, true);
      const contactId = await this.saveInstitutionContact(client, user.id, draft);
      const inserted = await client.query<{id:string}>(
        `INSERT INTO ced_institution_opinions(project_id,case_id,contact_id,institution_name,subject,status,request_date,deadline_date,response_date,
         outgoing_letter_no,incoming_letter_no,contact_person,notes,created_by,updated_by)
         VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13) RETURNING id`,
        [projectId,contactId,draft.institutionName,draft.subject,draft.status,draft.requestDate,draft.deadlineDate,draft.responseDate,
          draft.outgoingLetterNo,draft.incomingLetterNo,draft.contactPerson,draft.notes,user.id],
      );
      opinionId=inserted.rows[0].id;
      await this.auditProject(client,projectId,'institution_opinion',opinionId,'created',draft,user.id);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok:true, projectId, opinionId, caseId: null };
  }

  async createOpinion(user: AuthUser, caseId: string, input: unknown) {
    assertUuid(caseId, 'ÇED kaydı');
    const value = objectInput(input);
    assertKeys(value, ['institutionName', 'subject', 'status', 'requestDate', 'deadlineDate', 'responseDate', 'outgoingLetterNo', 'incomingLetterNo', 'contactPerson', 'contactTitle', 'contactDepartment', 'contactPhone', 'contactEmail', 'contactAddress', 'notes']);
    const draft = validateOpinion(value);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await this.loadAccessibleCase(client, caseId, user.id, true);
      const contactId = await this.saveInstitutionContact(client, user.id, draft);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ced_institution_opinions(project_id,case_id,contact_id,institution_name,subject,status,request_date,deadline_date,response_date,
         outgoing_letter_no,incoming_letter_no,contact_person,notes,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id`,
        [current.project_id,caseId,contactId,draft.institutionName,draft.subject,draft.status,draft.requestDate,draft.deadlineDate,draft.responseDate,
          draft.outgoingLetterNo,draft.incomingLetterNo,draft.contactPerson,draft.notes,user.id],
      );
      await this.audit(client, caseId, 'institution_opinion', inserted.rows[0].id, 'created', draft, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async updateOpinion(user: AuthUser, opinionId: string, input: unknown) {
    assertUuid(opinionId, 'Kurum görüşü');
    const value = objectInput(input);
    assertKeys(value, ['version', 'institutionName', 'subject', 'status', 'requestDate', 'deadlineDate', 'responseDate', 'outgoingLetterNo', 'incomingLetterNo', 'contactPerson', 'contactTitle', 'contactDepartment', 'contactPhone', 'contactEmail', 'contactAddress', 'notes']);
    assertVersion(value.version);
    if (Object.keys(value).length === 1) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<any>(
        `SELECT o.*,o.request_date::text AS request_date,o.deadline_date::text AS deadline_date,
          o.response_date::text AS response_date,contact.title AS contact_title,contact.department AS contact_department,
          contact.phone AS contact_phone,contact.email AS contact_email,contact.address AS contact_address
         FROM ced_institution_opinions o LEFT JOIN ced_institution_contacts contact ON contact.id=o.contact_id
         WHERE o.id=$1 AND o.archived_at IS NULL FOR UPDATE OF o`,
        [opinionId],
      );
      if (!found.rowCount) throw new NotFoundException({ code: 'CED_OPINION_NOT_FOUND', message: 'Kurum görüşü kaydı bulunamadı.' });
      const old = found.rows[0];
      await this.assertProjectAccess(client, old.project_id, user.id);
      if (old.case_id) {
        const linkedCase = await client.query('SELECT 1 FROM ced_cases WHERE id=$1 AND archived_at IS NULL',[old.case_id]);
        if (!linkedCase.rowCount) throw new ConflictException({code:'CED_OPINION_CASE_ARCHIVED',message:'Bu görüş eski bir ÇED kaydına bağlı. Önce arşiv durumu kontrol edilmelidir.'});
      }
      if (old.version !== Number(value.version)) throw new ConflictException({ code: 'CED_OPINION_CHANGED', message: 'Kurum görüşü başka bir işlemde güncellendi.' });
      const merged = validateOpinion({
        institutionName: Object.hasOwn(value, 'institutionName') ? value.institutionName : old.institution_name,
        subject: Object.hasOwn(value, 'subject') ? value.subject : old.subject,
        status: Object.hasOwn(value, 'status') ? value.status : old.status,
        requestDate: Object.hasOwn(value, 'requestDate') ? value.requestDate : old.request_date,
        deadlineDate: Object.hasOwn(value, 'deadlineDate') ? value.deadlineDate : old.deadline_date,
        responseDate: Object.hasOwn(value, 'responseDate') ? value.responseDate : old.response_date,
        outgoingLetterNo: Object.hasOwn(value, 'outgoingLetterNo') ? value.outgoingLetterNo : old.outgoing_letter_no,
        incomingLetterNo: Object.hasOwn(value, 'incomingLetterNo') ? value.incomingLetterNo : old.incoming_letter_no,
        contactPerson: Object.hasOwn(value, 'contactPerson') ? value.contactPerson : old.contact_person,
        contactTitle: Object.hasOwn(value, 'contactTitle') ? value.contactTitle : old.contact_title ?? '',
        contactDepartment: Object.hasOwn(value, 'contactDepartment') ? value.contactDepartment : old.contact_department ?? '',
        contactPhone: Object.hasOwn(value, 'contactPhone') ? value.contactPhone : old.contact_phone ?? '',
        contactEmail: Object.hasOwn(value, 'contactEmail') ? value.contactEmail : old.contact_email ?? '',
        contactAddress: Object.hasOwn(value, 'contactAddress') ? value.contactAddress : old.contact_address ?? '',
        notes: Object.hasOwn(value, 'notes') ? value.notes : old.notes,
      });
      const contactId = await this.saveInstitutionContact(client, user.id, merged);
      await client.query(
        `UPDATE ced_institution_opinions SET institution_name=$1,subject=$2,status=$3,request_date=$4,deadline_date=$5,response_date=$6,
         outgoing_letter_no=$7,incoming_letter_no=$8,contact_person=$9,contact_id=$10,notes=$11,updated_by=$12,updated_at=now(),version=version+1 WHERE id=$13`,
        [merged.institutionName, merged.subject, merged.status, merged.requestDate, merged.deadlineDate, merged.responseDate,
          merged.outgoingLetterNo, merged.incomingLetterNo, merged.contactPerson, contactId, merged.notes, user.id, opinionId],
      );
      if (old.case_id) await this.audit(client, old.case_id, 'institution_opinion', opinionId, 'updated', merged, user.id);
      else await this.auditProject(client, old.project_id, 'institution_opinion', opinionId, 'updated', merged, user.id);
      await client.query('COMMIT');
      return { ok: true, caseId: old.case_id, projectId: old.project_id };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async createIdkMeeting(user: AuthUser, caseId: string, input: unknown) {
    assertUuid(caseId, 'ÇED kaydı');
    const value = objectInput(input);
    assertKeys(value, ['meetingType', 'title', 'startsAt', 'endsAt', 'location', 'status', 'agenda', 'decisions']);
    const draft = validateMeeting(value);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.loadAccessibleCase(client, caseId, user.id, true);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ced_idk_meetings(case_id,meeting_type,title,starts_at,ends_at,location,status,agenda,decisions,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
        [caseId, draft.meetingType, draft.title, draft.startsAt, draft.endsAt, draft.location, draft.status, draft.agenda, draft.decisions, user.id],
      );
      await this.audit(client, caseId, 'idk_meeting', inserted.rows[0].id, 'created', draft, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async updateIdkMeeting(user: AuthUser, meetingId: string, input: unknown) {
    assertUuid(meetingId, 'İDK toplantısı');
    const value = objectInput(input);
    assertKeys(value, ['version', 'meetingType', 'title', 'startsAt', 'endsAt', 'location', 'status', 'agenda', 'decisions']);
    assertVersion(value.version);
    if (Object.keys(value).length === 1) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    const client = await this.db.pool.connect();
    let caseId = '';
    try {
      await client.query('BEGIN');
      const found = await client.query<any>(
        `SELECT m.*,c.project_id FROM ced_idk_meetings m JOIN ced_cases c ON c.id=m.case_id
         WHERE m.id=$1 AND m.archived_at IS NULL FOR UPDATE OF m`, [meetingId],
      );
      if (!found.rowCount) throw new NotFoundException({ code: 'CED_MEETING_NOT_FOUND', message: 'İDK toplantısı bulunamadı.' });
      const old = found.rows[0];
      caseId = old.case_id;
      await this.assertProjectAccess(client, old.project_id, user.id);
      if (old.version !== Number(value.version)) throw new ConflictException({ code: 'CED_MEETING_CHANGED', message: 'Toplantı başka bir işlemde güncellendi.' });
      const merged = validateMeeting({
        meetingType: Object.hasOwn(value, 'meetingType') ? value.meetingType : old.meeting_type,
        title: Object.hasOwn(value, 'title') ? value.title : old.title,
        startsAt: Object.hasOwn(value, 'startsAt') ? value.startsAt : old.starts_at,
        endsAt: Object.hasOwn(value, 'endsAt') ? value.endsAt : old.ends_at,
        location: Object.hasOwn(value, 'location') ? value.location : old.location,
        status: Object.hasOwn(value, 'status') ? value.status : old.status,
        agenda: Object.hasOwn(value, 'agenda') ? value.agenda : old.agenda,
        decisions: Object.hasOwn(value, 'decisions') ? value.decisions : old.decisions,
      });
      await client.query(
        `UPDATE ced_idk_meetings SET meeting_type=$1,title=$2,starts_at=$3,ends_at=$4,location=$5,status=$6,agenda=$7,decisions=$8,
         updated_by=$9,updated_at=now(),version=version+1 WHERE id=$10`,
        [merged.meetingType, merged.title, merged.startsAt, merged.endsAt, merged.location, merged.status, merged.agenda, merged.decisions, user.id, meetingId],
      );
      await this.audit(client, caseId, 'idk_meeting', meetingId, 'updated', merged, user.id);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
    return { ok: true, caseId };
  }

  async calendarMilestones(user: AuthUser, from: string, to: string, includeCed: boolean, includeOpinions: boolean, companyWide = false) {
    if (!includeCed && !includeOpinions && !companyWide) return [];
    const rows: any[] = [];
    if (includeCed || companyWide) {
      const [stages, meetings] = await Promise.all([
        this.db.query(
          `SELECT 'ced-stage:'||s.id::text AS id,'project_ced_stage_due' AS kind,s.id AS "entityId",
           s.title AS title,s.due_on::text AS date,c.project_id AS "projectId",p.name AS "projectName",
           s.status AS status,NULL::text AS priority,NULL::uuid AS "assigneeId",NULL::text AS "assigneeName"
           FROM ced_case_stages s JOIN ced_cases c ON c.id=s.case_id JOIN projects p ON p.id=c.project_id
           WHERE s.archived_at IS NULL AND c.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
             AND s.due_on >= $1::date AND s.due_on < $2::date
             AND s.status NOT IN ('completed','not_applicable')
             AND ($4::boolean OR p.created_by=$3 OR p.owner_user_id=$3 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$3))`,
          [from, to, user.id, companyWide],
        ),
        this.db.query(
          `SELECT 'idk:'||m.id::text AS id,'project_idk_meeting' AS kind,m.id AS "entityId",
           m.title,(m.starts_at AT TIME ZONE 'Europe/Istanbul')::date::text AS date,c.project_id AS "projectId",p.name AS "projectName",
           m.status,NULL::text AS priority,NULL::uuid AS "assigneeId",NULL::text AS "assigneeName"
           FROM ced_idk_meetings m JOIN ced_cases c ON c.id=m.case_id JOIN projects p ON p.id=c.project_id
           WHERE m.archived_at IS NULL AND c.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
             AND m.starts_at >= ($1::date::timestamp AT TIME ZONE 'Europe/Istanbul')
             AND m.starts_at < ($2::date::timestamp AT TIME ZONE 'Europe/Istanbul') AND m.status IN ('planned','postponed')
             AND ($4::boolean OR p.created_by=$3 OR p.owner_user_id=$3 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$3))`,
          [from, to, user.id, companyWide],
        ),
      ]);
      rows.push(...stages.rows, ...meetings.rows);
    }
    if (includeOpinions || companyWide) {
      const opinions = await this.db.query(
        `SELECT 'opinion:'||o.id::text AS id,'project_institution_opinion_due' AS kind,o.id AS "entityId",
         (o.institution_name||' · '||o.subject) AS title,o.deadline_date::text AS date,o.project_id AS "projectId",p.name AS "projectName",
         o.status AS status,NULL::text AS priority,NULL::uuid AS "assigneeId",NULL::text AS "assigneeName"
         FROM ced_institution_opinions o JOIN projects p ON p.id=o.project_id
         WHERE o.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
           AND o.deadline_date >= $1::date AND o.deadline_date < $2::date
           AND o.status NOT IN ('responded','closed','positive','negative')
           AND ($4::boolean OR p.created_by=$3 OR p.owner_user_id=$3 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$3))`,
        [from, to, user.id, companyWide],
      );
      rows.push(...opinions.rows);
    }
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title), 'tr'));
  }

  private async loadCase(caseId: string, userId: string, includeOpinions: boolean) {
    const accessible = await this.db.query(
      `SELECT c.id,c.project_id FROM ced_cases c JOIN projects p ON p.id=c.project_id
       WHERE c.id=$1 AND c.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
         AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         ))`,
      [caseId, userId],
    );
    if (!accessible.rowCount) throw new NotFoundException({ code: 'CED_CASE_NOT_FOUND', message: 'ÇED süreci bulunamadı.' });
    const [caseResult, stages, documents, opinions, meetings, activity] = await Promise.all([
      this.db.query(
        `SELECT c.id,c.project_id AS "projectId",c.route_code AS "routeCode",c.case_origin AS "caseOrigin",c.decision,c.file_number AS "fileNumber",
         c.eced_reference AS "ecedReference",c.started_on::text AS "startedOn",c.application_submitted_on::text AS "applicationSubmittedOn",
         c.closed_on::text AS "closedOn",c.notes,c.version,
         c.created_by AS "createdBy",creator.display_name AS "creatorName",c.updated_by AS "updatedBy",updater.display_name AS "updaterName",
         c.created_at AS "createdAt",c.updated_at AS "updatedAt"
         FROM ced_cases c JOIN users creator ON creator.id=c.created_by JOIN users updater ON updater.id=c.updated_by WHERE c.id=$1`, [caseId],
      ),
      this.db.query(
        `SELECT id,stage_key AS "stageKey",title,sort_order AS "sortOrder",status,required_document_type AS "requiredDocumentType",
         is_milestone AS "isMilestone",is_custom AS "isCustom",due_on::text AS "dueOn",completed_at AS "completedAt",notes,version
         FROM ced_case_stages WHERE case_id=$1 AND archived_at IS NULL ORDER BY sort_order,created_at,id`, [caseId],
      ),
      this.db.query(
        `SELECT d.id,d.stage_id AS "stageId",d.meeting_id AS "meetingId",d.document_type AS "documentType",d.title,
         d.source_type AS "sourceType",d.source_reference AS "sourceReference",d.version_label AS "versionLabel",
         d.document_date::text AS "documentDate",d.notes,d.created_by AS "createdBy",u.display_name AS "creatorName",d.created_at AS "createdAt"
         FROM ced_documents d JOIN users u ON u.id=d.created_by WHERE d.case_id=$1 AND d.archived_at IS NULL AND ($2::boolean OR d.document_type<>'institution_opinion') ORDER BY d.created_at DESC,d.id DESC`, [caseId, includeOpinions],
      ),
      includeOpinions ? this.db.query(
        `SELECT o.id,o.institution_name AS "institutionName",o.subject,o.status,o.request_date::text AS "requestDate",
         o.deadline_date::text AS "deadlineDate",o.response_date::text AS "responseDate",o.outgoing_letter_no AS "outgoingLetterNo",
         o.incoming_letter_no AS "incomingLetterNo",o.contact_person AS "contactPerson",
         contact.title AS "contactTitle",contact.department AS "contactDepartment",contact.phone AS "contactPhone",
         contact.email AS "contactEmail",contact.address AS "contactAddress",o.notes,o.version,
         o.created_by AS "createdBy",creator.display_name AS "creatorName",o.updated_at AS "updatedAt"
         FROM ced_institution_opinions o JOIN users creator ON creator.id=o.created_by
         LEFT JOIN ced_institution_contacts contact ON contact.id=o.contact_id AND contact.archived_at IS NULL
         WHERE o.project_id=$2 AND o.archived_at IS NULL ORDER BY CASE WHEN o.deadline_date IS NULL THEN 1 ELSE 0 END,o.deadline_date,o.institution_name`, [caseId,accessible.rows[0].project_id],
      ) : Promise.resolve({ rows: [] } as any),
      this.db.query(
        `SELECT m.id,m.meeting_type AS "meetingType",m.title,m.starts_at AS "startsAt",m.ends_at AS "endsAt",m.location,m.status,
         m.agenda,m.decisions,m.version,m.created_by AS "createdBy",creator.display_name AS "creatorName"
         FROM ced_idk_meetings m JOIN users creator ON creator.id=m.created_by
         WHERE m.case_id=$1 AND m.archived_at IS NULL ORDER BY m.starts_at DESC`, [caseId],
      ),
      this.db.query(
        `SELECT a.id,a.entity_type AS "entityType",a.entity_id AS "entityId",a.action,a.details,a.occurred_at AS "occurredAt",
         u.display_name AS "actorName" FROM ced_audit_events a LEFT JOIN users u ON u.id=a.actor_user_id
         WHERE (a.case_id=$1 OR ($2::boolean AND a.project_id=$3)) AND ($2::boolean OR a.entity_type<>'institution_opinion')
         ORDER BY a.occurred_at DESC,a.id DESC LIMIT 80`, [caseId, includeOpinions,accessible.rows[0].project_id],
      ),
    ]);
    return {
      case: caseResult.rows[0], stages: stages.rows, documents: documents.rows,
      opinions: opinions.rows, meetings: meetings.rows, activity: activity.rows,
      permissions: { opinions: includeOpinions },
    };
  }

  private async loadAccessibleCase(client: PoolClient, caseId: string, userId: string, lock = false) {
    const result = await client.query<any>(
      `SELECT c.*,c.application_submitted_on::text AS application_submitted_on_text FROM ced_cases c JOIN projects p ON p.id=c.project_id
       WHERE c.id=$1 AND c.archived_at IS NULL AND p.archived_at IS NULL AND p.status<>'archived'
       AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2))
       ${lock ? 'FOR UPDATE OF c' : ''}`,
      [caseId, userId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'CED_CASE_NOT_FOUND', message: 'ÇED süreci bulunamadı.' });
    return result.rows[0];
  }

  private async saveInstitutionContact(client: PoolClient, userId: string, draft: ReturnType<typeof validateOpinion>): Promise<string | null> {
    const hasDetails = Boolean(draft.contactPerson || draft.contactTitle || draft.contactDepartment ||
      draft.contactPhone || draft.contactEmail || draft.contactAddress);
    if (!hasDetails) return null;
    const existing = await client.query<{id:string}>(
      `SELECT id FROM ced_institution_contacts
       WHERE archived_at IS NULL
         AND lower(btrim(institution_name))=lower(btrim($1))
         AND lower(btrim(contact_person))=lower(btrim($2))
         AND lower(btrim(email))=lower(btrim($3))
       ORDER BY updated_at DESC,id
       LIMIT 1 FOR UPDATE`,
      [draft.institutionName,draft.contactPerson,draft.contactEmail],
    );
    if (existing.rowCount) {
      await client.query(
        `UPDATE ced_institution_contacts SET title=$1,department=$2,phone=$3,email=$4,address=$5,
          updated_by=$6,updated_at=now()
         WHERE id=$7`,
        [draft.contactTitle,draft.contactDepartment,draft.contactPhone,draft.contactEmail,draft.contactAddress,userId,existing.rows[0].id],
      );
      return existing.rows[0].id;
    }
    const inserted = await client.query<{id:string}>(
      `INSERT INTO ced_institution_contacts(
        institution_name,contact_person,title,department,phone,email,address,created_by,updated_by
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id`,
      [draft.institutionName,draft.contactPerson,draft.contactTitle,draft.contactDepartment,draft.contactPhone,
        draft.contactEmail,draft.contactAddress,userId],
    );
    return inserted.rows[0].id;
  }

  private async assertProjectAccess(client: PoolClient, projectId: string, userId: string, lock = false) {
    const result = await client.query(
      `SELECT p.id FROM projects p WHERE p.id=$1 AND p.archived_at IS NULL AND p.status<>'archived'
       AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2))
       ${lock ? 'FOR UPDATE OF p' : ''}`,
      [projectId, userId],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'PROJECT_NOT_FOUND', message: 'Proje bulunamadı.' });
  }

  private async audit(client: PoolClient, caseId: string, entityType: string, entityId: string, action: string, details: unknown, actorId: string) {
    await client.query(
      `INSERT INTO ced_audit_events(case_id,project_id,entity_type,entity_id,action,details,actor_user_id) VALUES($1,(SELECT project_id FROM ced_cases WHERE id=$1),$2,$3,$4,$5,$6)`,
      [caseId, entityType, entityId, action, details, actorId],
    );
  }

  private async auditProject(client: PoolClient, projectId: string, entityType: string, entityId: string, action: string, details: unknown, actorId: string) {
    await client.query(
      `INSERT INTO ced_audit_events(case_id,project_id,entity_type,entity_id,action,details,actor_user_id)
       VALUES(NULL,$1,$2,$3,$4,$5,$6)`,
      [projectId, entityType, entityId, action, details, actorId],
    );
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Gönderilen veri geçersiz.');
  return input as Record<string, unknown>;
}
function assertKeys(value: Record<string, unknown>, allowed: string[]) {
  const set = new Set(allowed);
  if (Object.keys(value).some((key) => !set.has(key))) throw invalid('Gönderilen alanları kontrol edin.');
}
function assertUuid(value: unknown, label: string) {
  if (typeof value !== 'string' || !UUID.test(value)) throw invalid(`${label} kimliği geçersiz.`);
}
function optionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  assertUuid(value, label);
  return value as string;
}
function assertVersion(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1) throw invalid('Kayıt sürümü geçersiz; yenileyip tekrar deneyin.');
}
function boundedText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string') throw invalid(`${label} geçersiz.`);
  const text = value.trim();
  if (text.length < min || text.length > max) throw invalid(`${label} ${min > 0 ? `${min}–` : ''}${max} karakter arasında olmalıdır.`);
  return text;
}
function enumValue<T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value)) throw invalid(`${label} geçersiz.`);
  return value as T[number];
}
function optionalDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE.test(value)) throw invalid(`${label} YYYY-AA-GG biçiminde olmalıdır.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw invalid(`${label} geçerli bir tarih olmalıdır.`);
  return value;
}
function applicationSubmissionDate(value: unknown): string | null {
  const date = optionalDate(value, 'Bakanlığa / İl Müdürlüğüne başvuru tarihi');
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  if (date && date > today) throw invalid('Resmî başvuru tarihi gelecekte olamaz.');
  return date;
}
function validateOpinion(value: Record<string, unknown>) {
  const draft = {
    institutionName: boundedText(value.institutionName, 2, 180, 'Kurum adı'),
    subject: boundedText(value.subject, 2, 240, 'Görüş konusu'),
    status: enumValue(value.status ?? 'draft', OPINION_STATUSES, 'Kurum görüşü durumu') as OpinionStatus,
    requestDate: optionalDate(value.requestDate, 'Talep tarihi'),
    deadlineDate: optionalDate(value.deadlineDate, 'Son tarih'),
    responseDate: optionalDate(value.responseDate, 'Yanıt tarihi'),
    outgoingLetterNo: boundedText(value.outgoingLetterNo ?? '', 0, 100, 'Giden yazı numarası'),
    incomingLetterNo: boundedText(value.incomingLetterNo ?? '', 0, 100, 'Gelen yazı numarası'),
    contactPerson: boundedText(value.contactPerson ?? '', 0, 160, 'İletişim kişisi'),
    contactTitle: boundedText(value.contactTitle ?? '', 0, 120, 'İlgili kişinin unvanı'),
    contactDepartment: boundedText(value.contactDepartment ?? '', 0, 120, 'İlgili kişinin birimi'),
    contactPhone: boundedText(value.contactPhone ?? '', 0, 60, 'Telefon'),
    contactEmail: boundedText(value.contactEmail ?? '', 0, 254, 'E-posta'),
    contactAddress: boundedText(value.contactAddress ?? '', 0, 400, 'Adres'),
    notes: boundedText(value.notes ?? '', 0, 4000, 'Açıklama'),
  };
  if (draft.requestDate && draft.deadlineDate && draft.requestDate > draft.deadlineDate) throw invalid('Son tarih talep tarihinden önce olamaz.');
  if (draft.requestDate && draft.responseDate && draft.requestDate > draft.responseDate) throw invalid('Yanıt tarihi talep tarihinden önce olamaz.');
  if (draft.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail)) throw invalid('İlgili kişi e-posta adresi geçersiz.');
  return draft;
}
function validateMeeting(value: Record<string, unknown>) {
  const meetingType = enumValue(value.meetingType ?? 'idk', MEETING_TYPES, 'Toplantı türü');
  const title = boundedText(value.title, 2, 180, 'Toplantı adı');
  const startsAt = validInstant(value.startsAt, 'Başlangıç zamanı');
  const endsAt = value.endsAt === undefined || value.endsAt === null || value.endsAt === '' ? null : validInstant(value.endsAt, 'Bitiş zamanı');
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw invalid('Toplantı bitişi başlangıçtan sonra olmalıdır.');
  return {
    meetingType, title, startsAt, endsAt,
    location: boundedText(value.location ?? '', 0, 240, 'Konum'),
    status: enumValue(value.status ?? 'planned', MEETING_STATUSES, 'Toplantı durumu') as MeetingStatus,
    agenda: boundedText(value.agenda ?? '', 0, 5000, 'Gündem'),
    decisions: boundedText(value.decisions ?? '', 0, 5000, 'Kararlar'),
  };
}
function validInstant(value: unknown, label: string): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw invalid(`${label} saat dilimi içeren geçerli bir tarih olmalıdır.`);
  return new Date(value).toISOString();
}
function invalid(message: string) { return new BadRequestException({ code: 'INVALID_CED_INPUT', message }); }
