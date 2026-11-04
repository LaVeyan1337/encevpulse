import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ROUTES = ['ek1_cbd', 'ek2_ptd', 'combined', 'custom'] as const;
const DECISIONS = ['pending', 'ced_positive', 'ced_report_required', 'ced_negative', 'outside_scope', 'withdrawn'] as const;
const STAGE_STATUSES = ['pending', 'in_progress', 'waiting', 'completed', 'not_applicable', 'revision_requested'] as const;
const DOCUMENT_TYPES = ['cbd', 'ptd', 'ced_report', 'final_report', 'last_final_report', 'institution_opinion', 'idk_minutes', 'other'] as const;
const SOURCE_TYPES = ['network_path', 'external_url', 'eced_reference', 'other'] as const;
const OPINION_STATUSES = ['draft', 'requested', 'waiting', 'responded', 'revision_requested', 'closed'] as const;
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
    if (!found.rowCount) return { case: null, stages: [], documents: [], opinions: [], meetings: [], activity: [], permissions: { opinions: includeOpinions } };
    return this.loadCase(found.rows[0].id, user.id, includeOpinions);
  }

  async createProjectCase(user: AuthUser, projectId: string, input: unknown) {
    assertUuid(projectId, 'Proje');
    const value = objectInput(input);
    assertKeys(value, ['routeCode', 'fileNumber', 'ecedReference', 'startedOn', 'notes']);
    const routeCode = enumValue(value.routeCode ?? 'custom', ROUTES, 'ÇED başvuru yolu') as Route;
    const fileNumber = boundedText(value.fileNumber ?? '', 0, 120, 'Dosya numarası');
    const ecedReference = boundedText(value.ecedReference ?? '', 0, 160, 'e-ÇED referansı');
    const startedOn = optionalDate(value.startedOn, 'Başlangıç tarihi');
    const notes = boundedText(value.notes ?? '', 0, 6000, 'Açıklama');
    const client = await this.db.pool.connect();
    let caseId = '';
    try {
      await client.query('BEGIN');
      await this.assertProjectAccess(client, projectId, user.id, true);
      const existing = await client.query<{ id: string }>(
        'SELECT id FROM ced_cases WHERE project_id=$1 AND archived_at IS NULL FOR UPDATE', [projectId],
      );
      if (existing.rowCount) throw new ConflictException({ code: 'CED_CASE_EXISTS', message: 'Bu proje için açık bir ÇED süreç kaydı zaten var.' });
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO ced_cases(project_id,route_code,file_number,eced_reference,started_on,notes,created_by,updated_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$7) RETURNING id`,
        [projectId, routeCode, fileNumber, ecedReference, startedOn, notes, user.id],
      );
      caseId = inserted.rows[0].id;
      for (const stage of BASE_STAGES) {
        const routeNotUsed = (stage.route === 'cbd' && routeCode === 'ek2_ptd') ||
          (stage.route === 'ptd' && routeCode === 'ek1_cbd');
        const status = routeNotUsed ? 'not_applicable' : 'pending';
        await client.query(
          `INSERT INTO ced_case_stages(case_id,stage_key,title,sort_order,status,required_document_type,is_milestone,created_by,updated_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
          [caseId, stage.key, stage.title, stage.order, status, stage.documentType ?? null, Boolean(stage.milestone), user.id],
        );
      }
      await this.audit(client, caseId, 'case', caseId, 'created', { routeCode, stagesCreated: BASE_STAGES.length }, user.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
