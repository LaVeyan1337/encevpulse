import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { CedService } from '../ced/ced.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPES = ['meeting', 'event', 'reminder', 'deadline'] as const;
const VISIBILITIES = ['personal', 'shared', 'project'] as const;
type EventType = typeof EVENT_TYPES[number];
type Visibility = typeof VISIBILITIES[number];

interface EventDraft {
  title: string;
  description: string;
  eventType: EventType;
  visibility: Visibility;
  projectId: string | null;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
  location: string;
  attendeeIds: string[];
}

@Injectable()
export class CalendarService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(CedService) private readonly ced: CedService,
  ) {}

  async list(
    user: AuthUser, query: Record<string, string | undefined>, includeTasks: boolean, includeProjects: boolean,
    includeCed: boolean, includeOpinions: boolean, includeCompanyMilestones: boolean,
  ) {
    const from = validDate(query.from, 'Başlangıç tarihi');
    const to = validDate(query.to, 'Bitiş tarihi');
    if (to <= from) throw invalid('Takvim tarih aralığı geçersiz.');
    const span = (Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000;
    if (span > 93) throw invalid('Takvim tek istekte en fazla 93 günlük aralık gösterebilir.');

    const events = await this.db.query(
      `SELECT e.id, e.title, e.description, e.event_type AS "eventType", e.visibility,
              e.project_id AS "projectId", p.name AS "projectName", p.owner_user_id AS "projectOwnerId", e.all_day AS "allDay",
              e.starts_at AS "startsAt", e.ends_at AS "endsAt",
              e.starts_on::text AS "startsOn", e.ends_on::text AS "endsOn",
              e.location, e.version, e.created_by AS "createdBy",
              creator.display_name AS "creatorName", e.created_at AS "createdAt",
              e.updated_at AS "updatedAt",
              COALESCE(array_agg(DISTINCT a.user_id) FILTER (WHERE a.user_id IS NOT NULL), ARRAY[]::uuid[]) AS "attendeeIds",
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id', attendee.id, 'displayName', attendee.display_name, 'avatarKey', attendee.avatar_key
              )) FILTER (WHERE attendee.id IS NOT NULL), '[]'::jsonb) AS attendees
       FROM calendar_events e
       JOIN users creator ON creator.id = e.created_by
       LEFT JOIN projects p ON p.id = e.project_id
       LEFT JOIN calendar_event_attendees a ON a.event_id = e.id
       LEFT JOIN users attendee ON attendee.id = a.user_id AND attendee.status = 'active'
       WHERE e.archived_at IS NULL
         AND (
           e.visibility = 'shared'
           OR e.created_by = $1
           OR EXISTS (SELECT 1 FROM calendar_event_attendees mine WHERE mine.event_id=e.id AND mine.user_id=$1)
           OR (e.visibility='project' AND (
             p.owner_user_id=$1 OR EXISTS (
               SELECT 1 FROM project_members pm WHERE pm.project_id=e.project_id AND pm.user_id=$1
             )
           ))
         )
         AND (
           (e.all_day=true AND e.starts_on < $3::date AND e.ends_on >= $2::date)
           OR
           (e.all_day=false
             AND e.starts_at < ($3::date::timestamp AT TIME ZONE 'Europe/Istanbul')
             AND e.ends_at > ($2::date::timestamp AT TIME ZONE 'Europe/Istanbul'))
         )
       GROUP BY e.id, p.name, p.owner_user_id, creator.display_name
       ORDER BY COALESCE(e.starts_at, e.starts_on::timestamp AT TIME ZONE 'Europe/Istanbul'),
                e.title
       LIMIT 500`,
      [user.id, from, to],
    );

    const [taskMilestones, projectMilestones, cedMilestones] = await Promise.all([
      includeTasks ? this.taskMilestones(user, from, to) : Promise.resolve([]),
      includeProjects ? this.projectMilestones(user, from, to) : Promise.resolve([]),
      this.ced.calendarMilestones(user, from, to, includeCed, includeOpinions, includeCompanyMilestones),
    ]);
    return {
      range: { from, to, timeZone: 'Europe/Istanbul' },
      events: events.rows.map((event) => ({
        ...event,
        startsAt: isoInstant(event.startsAt),
        endsAt: isoInstant(event.endsAt),
      })),
      milestones: [...taskMilestones, ...projectMilestones, ...cedMilestones].sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) || String(a.title).localeCompare(String(b.title), 'tr'),
      ),
    };
  }

  async create(user: AuthUser, input: unknown) {
    const draft = validateEvent(input, true);
    const client = await this.db.pool.connect();
    let eventId = '';
    try {
      await client.query('BEGIN');
      await this.assertEventRelations(client, user.id, draft);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO calendar_events (
          title, description, event_type, visibility, project_id, all_day,
          starts_at, ends_at, starts_on, ends_on, location, created_by, updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
        RETURNING id`,
        [draft.title, draft.description, draft.eventType, draft.visibility, draft.projectId,
          draft.allDay, draft.startsAt, draft.endsAt, draft.startsOn, draft.endsOn,
          draft.location, user.id],
      );
      eventId = inserted.rows[0].id;
      await this.replaceAttendees(client, eventId, user.id, draft.attendeeIds);
      await client.query(
        `INSERT INTO calendar_event_audit_events(event_id,actor_user_id,action,changes)
         VALUES ($1,$2,'created',$3)`,
        [eventId, user.id, { fields: ['created'] }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.eventById(eventId);
  }

  async update(user: AuthUser, id: string, input: unknown) {
    assertUuid(id);
    const value = objectInput(input);
    const version = value.version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Etkinlik sürümü geçersiz; yenileyip tekrar deneyin.');
    const draft = validateEvent(value, false);
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.lockManagedEvent(client, id, user.id);
      if (existing.version !== Number(version)) throw new ConflictException({ code: 'CALENDAR_EVENT_CHANGED', message: 'Etkinlik başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      await this.assertEventRelations(client, user.id, draft);
      const updated = await client.query(
        `UPDATE calendar_events SET
          title=$1, description=$2, event_type=$3, visibility=$4, project_id=$5,
          all_day=$6, starts_at=$7, ends_at=$8, starts_on=$9, ends_on=$10,
          location=$11, updated_by=$12, updated_at=now(), version=version+1
         WHERE id=$13 AND version=$14 AND archived_at IS NULL
         RETURNING version`,
        [draft.title, draft.description, draft.eventType, draft.visibility, draft.projectId,
          draft.allDay, draft.startsAt, draft.endsAt, draft.startsOn, draft.endsOn,
          draft.location, user.id, id, version],
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'CALENDAR_EVENT_CHANGED', message: 'Etkinlik başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      await this.replaceAttendees(client, id, user.id, draft.attendeeIds);
      await client.query(
        `INSERT INTO calendar_event_audit_events(event_id,actor_user_id,action,changes)
         VALUES ($1,$2,'updated',$3)`,
        [id, user.id, { fields: ['title','description','eventType','visibility','schedule','projectId','attendees','location'] }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.eventById(id);
  }

  async archive(user: AuthUser, id: string, input: unknown): Promise<void> {
    assertUuid(id);
    const version = objectInput(input).version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Etkinlik sürümü geçersiz; yenileyip tekrar deneyin.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.lockManagedEvent(client, id, user.id);
      if (existing.version !== Number(version)) throw new ConflictException({ code: 'CALENDAR_EVENT_CHANGED', message: 'Etkinlik başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      const updated = await client.query(
        `UPDATE calendar_events SET archived_at=now(),updated_at=now(),updated_by=$1,version=version+1
         WHERE id=$2 AND version=$3 AND archived_at IS NULL RETURNING id`,
        [user.id, id, version],
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'CALENDAR_EVENT_CHANGED', message: 'Etkinlik durumu değişti. Yenileyip tekrar deneyin.' });
      await client.query(
        `INSERT INTO calendar_event_audit_events(event_id,actor_user_id,action,changes)
         VALUES ($1,$2,'archived',$3)`,
        [id, user.id, { fields: ['archivedAt'] }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async eventById(id: string) {
    const result = await this.db.query(
      `SELECT e.id,e.title,e.description,e.event_type AS "eventType",e.visibility,
              e.project_id AS "projectId",p.name AS "projectName",p.owner_user_id AS "projectOwnerId",e.all_day AS "allDay",
              e.starts_at AS "startsAt",e.ends_at AS "endsAt",
              e.starts_on::text AS "startsOn",e.ends_on::text AS "endsOn",
              e.location,e.version,e.created_by AS "createdBy",
              creator.display_name AS "creatorName",e.created_at AS "createdAt",
              e.updated_at AS "updatedAt",
              COALESCE(array_agg(DISTINCT a.user_id) FILTER (WHERE a.user_id IS NOT NULL),ARRAY[]::uuid[]) AS "attendeeIds",
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object(
                'id', attendee.id,'displayName',attendee.display_name,'avatarKey',attendee.avatar_key
              )) FILTER (WHERE attendee.id IS NOT NULL),'[]'::jsonb) AS attendees
       FROM calendar_events e
       JOIN users creator ON creator.id=e.created_by
       LEFT JOIN projects p ON p.id=e.project_id
       LEFT JOIN calendar_event_attendees a ON a.event_id=e.id
       LEFT JOIN users attendee ON attendee.id=a.user_id AND attendee.status='active'
       WHERE e.id=$1
       GROUP BY e.id,p.name,p.owner_user_id,creator.display_name`,
      [id],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'CALENDAR_EVENT_NOT_FOUND', message: 'Etkinlik bulunamadı.' });
    const event = result.rows[0];
    return {
      event: {
        ...event,
        startsAt: isoInstant(event.startsAt),
        endsAt: isoInstant(event.endsAt),
      },
    };
  }

  private async lockManagedEvent(client: PoolClient, id: string, userId: string) {
    const result = await client.query(
      `SELECT e.version,e.created_by,p.owner_user_id
       FROM calendar_events e LEFT JOIN projects p ON p.id=e.project_id
       WHERE e.id=$1 AND e.archived_at IS NULL FOR UPDATE OF e`,
      [id],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'CALENDAR_EVENT_NOT_FOUND', message: 'Etkinlik bulunamadı.' });
    const row = result.rows[0] as { version: number; created_by: string; owner_user_id: string | null };
    if (row.created_by !== userId && row.owner_user_id !== userId) {
      throw new ForbiddenException({ code: 'CALENDAR_EVENT_MANAGE_DENIED', message: 'Bu etkinliği yalnızca oluşturan veya bağlı projenin sahibi yönetebilir.' });
    }
    return row;
  }

  private async assertEventRelations(client: PoolClient, actorId: string, draft: EventDraft) {
    if (draft.visibility === 'project') {
      const project = await client.query(
        `SELECT p.id FROM projects p
         WHERE p.id=$1 AND p.archived_at IS NULL AND p.status<>'archived'
           AND (p.owner_user_id=$2 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
           ))`,
        [draft.projectId, actorId],
      );
      if (!project.rowCount) throw new ForbiddenException({ code: 'CALENDAR_PROJECT_ACCESS_DENIED', message: 'Proje takvim etkinliği için etkin proje üyeliğiniz bulunmalıdır.' });
      if (draft.attendeeIds.length) {
        const members = await client.query(
          `SELECT count(DISTINCT u.id)::int AS count FROM users u
           WHERE u.id=ANY($1::uuid[]) AND u.status='active'
             AND (u.id=$2 OR EXISTS (
               SELECT 1 FROM project_members pm WHERE pm.project_id=$3 AND pm.user_id=u.id
             ))`,
          [draft.attendeeIds, actorId, draft.projectId],
        );
        if (members.rows[0].count !== draft.attendeeIds.length) throw invalid('Proje etkinliğine yalnızca etkin proje üyeleri katılımcı olarak eklenebilir.');
      }
    } else if (draft.attendeeIds.length) {
      const active = await client.query(
        `SELECT count(*)::int AS count FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,
        [draft.attendeeIds],
      );
      if (active.rows[0].count !== draft.attendeeIds.length) throw invalid('Katılımcı listesinde etkin olmayan veya bulunmayan kullanıcı var.');
    }
  }

  private async replaceAttendees(client: PoolClient, eventId: string, actorId: string, attendeeIds: string[]) {
    await client.query('DELETE FROM calendar_event_attendees WHERE event_id=$1', [eventId]);
    if (!attendeeIds.length) return;
    for (const attendeeId of attendeeIds) {
      await client.query(
        `INSERT INTO calendar_event_attendees(event_id,user_id,added_by)
         VALUES ($1,$2,$3) ON CONFLICT(event_id,user_id) DO NOTHING`,
        [eventId, attendeeId, actorId],
      );
    }
  }

  private async taskMilestones(user: AuthUser, from: string, to: string) {
    const result = await this.db.query(
      `SELECT 'task_start:'||t.id::text AS id,'task_start'::text AS kind,
              t.id AS "entityId",t.title,t.starts_on::text AS date,
              t.status,t.priority,t.assignee_id AS "assigneeId",u.display_name AS "assigneeName",
              p.id AS "projectId",p.name AS "projectName"
       FROM tasks t JOIN users u ON u.id=t.assignee_id
       LEFT JOIN projects p ON p.id=t.project_id
       WHERE t.archived_at IS NULL AND t.starts_on >= $2::date AND t.starts_on < $3::date
         AND (t.created_by=$1 OR t.assignee_id=$1 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=$1
         ))
       UNION ALL
       SELECT 'task_due:'||t.id::text,'task_due',t.id,t.title,t.due_on::text,
              t.status,t.priority,t.assignee_id,u.display_name,p.id,p.name
       FROM tasks t JOIN users u ON u.id=t.assignee_id
       LEFT JOIN projects p ON p.id=t.project_id
       WHERE t.archived_at IS NULL AND t.due_on >= $2::date AND t.due_on < $3::date
         AND (t.created_by=$1 OR t.assignee_id=$1 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=$1
         ))
       ORDER BY date,kind,title LIMIT 500`,
      [user.id, from, to],
    );
    return result.rows;
  }

  private async projectMilestones(user: AuthUser, from: string, to: string) {
    const result = await this.db.query(
      `SELECT 'project_start:'||p.id::text AS id,'project_start'::text AS kind,
              p.id AS "entityId",p.name AS title,p.starts_on::text AS date,
              p.status,NULL::text AS priority,NULL::uuid AS "assigneeId",
              NULL::text AS "assigneeName",p.id AS "projectId",p.name AS "projectName"
       FROM projects p
       WHERE p.archived_at IS NULL AND p.status<>'archived'
         AND p.starts_on >= $2::date AND p.starts_on < $3::date
         AND (p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$1
         ))
       UNION ALL
       SELECT 'project_target:'||p.id::text,'project_target',p.id,p.name,p.target_on::text,
              p.status,NULL::text,NULL::uuid,NULL::text,p.id,p.name
       FROM projects p
       WHERE p.archived_at IS NULL AND p.status<>'archived'
         AND p.target_on >= $2::date AND p.target_on < $3::date
         AND (p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$1
         ))
       ORDER BY date,kind,title LIMIT 300`,
      [user.id, from, to],
    );
    return result.rows;
  }
}

function validateEvent(input: unknown, creating: boolean): EventDraft {
  const value = objectInput(input);
  const allowed = new Set([
    'title','description','eventType','visibility','projectId','allDay',
    'startsAt','endsAt','startsOn','endsOn','location','attendeeIds',
    ...(creating ? [] : ['version']),
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid('Etkinlik alanlarını kontrol edin.');
  const title = boundedText(value.title, 1, 160, 'Etkinlik adı');
  const description = boundedText(value.description ?? '', 0, 4000, 'Açıklama');
  const location = boundedText(value.location ?? '', 0, 200, 'Konum');
  if (!EVENT_TYPES.includes(value.eventType as EventType)) throw invalid('Etkinlik türü geçersiz.');
  if (!VISIBILITIES.includes(value.visibility as Visibility)) throw invalid('Etkinlik görünürlüğü geçersiz.');
  if (typeof value.allDay !== 'boolean') throw invalid('Tüm gün seçimi geçersiz.');
  const visibility = value.visibility as Visibility;
  const projectId = value.projectId == null || value.projectId === '' ? null : value.projectId;
  if (projectId !== null && (typeof projectId !== 'string' || !UUID.test(projectId))) throw invalid('Proje seçimi geçersiz.');
  if ((visibility === 'project') !== Boolean(projectId)) throw invalid('Proje görünürlüğü için bir proje seçmelisiniz.');
  const attendeeIds = value.attendeeIds === undefined ? [] : value.attendeeIds;
  if (!Array.isArray(attendeeIds) || attendeeIds.length > 30 ||
      attendeeIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
      new Set(attendeeIds).size !== attendeeIds.length) throw invalid('Katılımcı listesi geçersiz.');
  if (visibility === 'personal' && attendeeIds.length) throw invalid('Kişisel etkinliklere katılımcı eklenemez.');

  if (value.allDay) {
    const startsOn = validDate(value.startsOn, 'Başlangıç tarihi');
    const endsOn = validDate(value.endsOn, 'Bitiş tarihi');
    if (endsOn < startsOn) throw invalid('Bitiş tarihi başlangıç tarihinden önce olamaz.');
    const span = (Date.parse(endsOn + 'T00:00:00Z') - Date.parse(startsOn + 'T00:00:00Z')) / 86400000;
    if (span > 30) throw invalid('Tek bir etkinlik en fazla 31 takvim günü sürebilir.');
    if (value.startsAt != null || value.endsAt != null) throw invalid('Tüm gün etkinliğinde saat gönderilemez.');
    return {
      title, description, eventType: value.eventType as EventType, visibility, projectId,
      allDay: true, startsAt: null, endsAt: null, startsOn, endsOn, location,
      attendeeIds: attendeeIds as string[],
    };
  }

  const startsAt = validInstant(value.startsAt, 'Başlangıç saati');
  const endsAt = validInstant(value.endsAt, 'Bitiş saati');
  const startMs = Date.parse(startsAt);
  const endMs = Date.parse(endsAt);
  if (endMs <= startMs) throw invalid('Bitiş saati başlangıç saatinden sonra olmalıdır.');
  if (endMs - startMs > 31 * 86400000) throw invalid('Tek bir etkinlik en fazla 31 gün sürebilir.');
  if (value.startsOn != null || value.endsOn != null) throw invalid('Saatli etkinlikte tarih alanı gönderilemez.');
  return {
    title, description, eventType: value.eventType as EventType, visibility, projectId,
    allDay: false, startsAt, endsAt, startsOn: null, endsOn: null, location,
    attendeeIds: attendeeIds as string[],
  };
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('İstek bilgilerini kontrol edin.');
  return input as Record<string, unknown>;
}

function boundedText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string') throw invalid(label + ' geçersiz.');
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw invalid(label + ' ' + min + '–' + max + ' karakter arasında olmalıdır.');
  return normalized;
}

function validDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || !DATE.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00.000Z')) ||
      new Date(value + 'T00:00:00.000Z').toISOString().slice(0, 10) !== value) {
    throw invalid(label + ' geçersiz.');
  }
  return value;
}

function validInstant(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ||
      Number.isNaN(Date.parse(value))) throw invalid(label + ' geçersiz.');
  return new Date(value).toISOString();
}

function assertUuid(value: string): void {
  if (!UUID.test(value)) throw invalid('Etkinlik kimliği geçersiz.');
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_CALENDAR_REQUEST', message });
}


function isoInstant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error('Database returned an invalid calendar timestamp.');
  }
  return parsed.toISOString();
}
