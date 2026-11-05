import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTE_TAG_MAX = 12;

export interface NoteInput {
  title?: string;
  body?: string;
  tags?: string[];
  projectId?: string | null;
  taskId?: string | null;
  version?: number;
}

export function validateNoteInput(input: unknown, creating: boolean): NoteInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Not bilgileri geçersiz.');
  const value = input as Record<string, unknown>;
  const allowed = new Set(['title', 'body', 'tags', 'projectId', 'taskId', ...(creating ? [] : ['version'])]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid('Not alanlarını kontrol edin.');

  const result: NoteInput = {};
  if (creating || Object.hasOwn(value, 'title')) {
    if (typeof value.title !== 'string') throw invalid('Not başlığı geçersiz.');
    const title = value.title.trim();
    if (title.length < 1 || title.length > 160) throw invalid('Not başlığı 1–160 karakter arasında olmalıdır.');
    result.title = title;
  }
  if (creating || Object.hasOwn(value, 'body')) {
    if (typeof value.body !== 'string' || value.body.length > 20000) throw invalid('Not metni en fazla 20.000 karakter olabilir.');
    result.body = value.body;
  }
  if (creating || Object.hasOwn(value, 'tags')) {
    if (!Array.isArray(value.tags) || value.tags.length > NOTE_TAG_MAX ||
        value.tags.some((tag) => typeof tag !== 'string')) {
      throw invalid('En fazla 12 etiket ekleyebilirsiniz.');
    }
    const tags: string[] = [];
    const seen = new Set<string>();
    for (const raw of value.tags as string[]) {
      const tag = raw.trim();
      if (!tag) continue;
      if (tag.length > 32) throw invalid('Etiketler 32 karakterden uzun olamaz.');
      const key = tag.toLocaleLowerCase('tr-TR');
      if (!seen.has(key)) { seen.add(key); tags.push(tag); }
    }
    if (tags.length > NOTE_TAG_MAX) throw invalid('En fazla 12 farklı etiket ekleyebilirsiniz.');
    result.tags = tags;
  }
  if (Object.hasOwn(value, 'projectId')) {
    if (value.projectId !== null && (typeof value.projectId !== 'string' || !UUID.test(value.projectId))) {
      throw invalid('Proje bağlantısı geçersiz.');
    }
    result.projectId = value.projectId as string | null;
  }
  if (Object.hasOwn(value, 'taskId')) {
    if (value.taskId !== null && (typeof value.taskId !== 'string' || !UUID.test(value.taskId))) {
      throw invalid('Görev bağlantısı geçersiz.');
    }
    result.taskId = value.taskId as string | null;
  }
  if (!creating) {
    if (!Number.isInteger(value.version) || Number(value.version) < 1) throw invalid('Not sürümü geçersiz.');
    result.version = Number(value.version);
  }
  if (creating && (!result.title || result.body === undefined || !result.tags)) {
    throw invalid('Not başlığı, metni ve etiket bilgisi gereklidir.');
  }
  return result;
}

@Injectable()
export class NotesService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const view = query.view ?? 'active';
    if (!['active', 'archived', 'all'].includes(view)) throw invalid('Not görünümü geçersiz.');
    const search = (query.q ?? '').trim().slice(0, 120);
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
      throw invalid('Sayfalama isteği geçersiz.');
    }
    const result = await this.db.query(
      `SELECT n.id,n.title,n.body,n.tags,n.project_id AS "projectId",p.name AS "projectName",
              n.task_id AS "taskId",t.title AS "taskTitle",
              n.version,n.archived_at AS "archivedAt",n.created_at AS "createdAt",n.updated_at AS "updatedAt"
       FROM user_notes n
       LEFT JOIN projects p ON p.id=n.project_id
       LEFT JOIN tasks t ON t.id=n.task_id
       WHERE n.owner_user_id=$1
         AND (($2='active' AND n.archived_at IS NULL) OR ($2='archived' AND n.archived_at IS NOT NULL) OR $2='all')
         AND ($3='' OR position(lower($3) in lower(n.title || ' ' || n.body || ' ' || array_to_string(n.tags,' ')))>0)
       ORDER BY n.updated_at DESC,n.id
       LIMIT $4 OFFSET $5`,
      [user.id, view, search, limit + 1, offset],
    );
    const hasMore = result.rows.length > limit;
    return {
      notes: hasMore ? result.rows.slice(0, limit) : result.rows,
      page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null },
    };
  }

  async get(user: AuthUser, id: string) {
    assertUuid(id);
    const result = await this.db.query(
      `SELECT n.id,n.title,n.body,n.tags,n.project_id AS "projectId",p.name AS "projectName",
              n.task_id AS "taskId",t.title AS "taskTitle",
              n.version,n.archived_at AS "archivedAt",n.created_at AS "createdAt",n.updated_at AS "updatedAt"
       FROM user_notes n LEFT JOIN projects p ON p.id=n.project_id LEFT JOIN tasks t ON t.id=n.task_id
       WHERE n.id=$1 AND n.owner_user_id=$2`,
      [id, user.id],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Not bulunamadı.' });
    return { note: result.rows[0] };
  }

  async create(user: AuthUser, input: unknown) {
    const value = validateNoteInput(input, true);
    if (value.projectId) await this.assertProjectAccess(user.id, value.projectId);
    if (value.taskId) await this.assertTaskAccess(user.id, value.taskId);
    const client = await this.db.pool.connect();
    let id = '';
    try {
      await client.query('BEGIN');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO user_notes(owner_user_id,title,body,tags,project_id,task_id)
         VALUES($1,$2,$3,$4::text[],$5,$6) RETURNING id`,
        [user.id, value.title, value.body, value.tags, value.projectId ?? null, value.taskId ?? null],
      );
      id = inserted.rows[0].id;
      await client.query(
        `INSERT INTO user_note_audit_events(note_id,actor_user_id,action,changes)
         VALUES($1,$2,'created',$3)`,
        [id, user.id, { fields: ['title', 'body', 'tags', 'projectId', 'taskId'] }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return this.get(user, id);
  }

  async update(user: AuthUser, id: string, input: unknown) {
    assertUuid(id);
    const value = validateNoteInput(input, false);
    if (!Object.keys(value).some((key) => key !== 'version')) throw invalid('Güncellenecek bir alan bulunamadı.');
    if (Object.hasOwn(value, 'projectId') && value.projectId) await this.assertProjectAccess(user.id, value.projectId);
    if (Object.hasOwn(value, 'taskId') && value.taskId) await this.assertTaskAccess(user.id, value.taskId);

    const fields: Array<[keyof NoteInput, string, unknown]> = [
      ['title', 'title', value.title],
      ['body', 'body', value.body],
      ['tags', 'tags', value.tags],
      ['projectId', 'project_id', value.projectId],
      ['taskId', 'task_id', value.taskId],
    ];
    const updates = fields.filter(([key]) => Object.hasOwn(value, key));
    const setClause = updates.map(([key, column], index) =>
      `${column}=$${index + 3}${key === 'tags' ? '::text[]' : ''}`,
    ).join(',');
    const parameters = [id, user.id, ...updates.map(([, , data]) => data), value.version];
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE user_notes SET ${setClause},version=version+1,updated_at=now()
         WHERE id=$1 AND owner_user_id=$2 AND version=$${updates.length + 3} AND archived_at IS NULL
         RETURNING id`,
        parameters,
      );
      if (!result.rowCount) {
        const exists = await client.query('SELECT version,archived_at FROM user_notes WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
        if (!exists.rowCount) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Not bulunamadı.' });
        throw new ConflictException({ code: 'NOTE_VERSION_CONFLICT', message: 'Not başka bir işlemde değiştirildi. Güncel hâlini açıp tekrar deneyin.' });
      }
      await client.query(
        `INSERT INTO user_note_audit_events(note_id,actor_user_id,action,changes)
         VALUES($1,$2,'updated',$3)`,
        [id, user.id, { fields: updates.map(([key]) => key) }],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return this.get(user, id);
  }

  async setArchived(user: AuthUser, id: string, input: unknown, restore: boolean) {
    assertUuid(id);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Not sürümü gereklidir.');
    const value = input as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || !Number.isInteger(value.version) || Number(value.version) < 1) {
      throw invalid('Not sürümü geçersiz.');
    }
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE user_notes SET archived_at=${restore ? 'NULL' : 'now()'},version=version+1,updated_at=now()
         WHERE id=$1 AND owner_user_id=$2 AND version=$3 AND archived_at IS ${restore ? 'NOT ' : ''}NULL
         RETURNING id`,
        [id, user.id, value.version],
      );
      if (!result.rowCount) {
        const exists = await client.query('SELECT id FROM user_notes WHERE id=$1 AND owner_user_id=$2', [id, user.id]);
        if (!exists.rowCount) throw new NotFoundException({ code: 'NOTE_NOT_FOUND', message: 'Not bulunamadı.' });
        throw new ConflictException({ code: 'NOTE_VERSION_CONFLICT', message: 'Not güncel değil. Listeyi yenileyip tekrar deneyin.' });
      }
      await client.query(
        `INSERT INTO user_note_audit_events(note_id,actor_user_id,action,changes)
         VALUES($1,$2,$3,'{}'::jsonb)`,
        [id, user.id, restore ? 'restored' : 'archived'],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
    return { success: true };
  }

  private async assertTaskAccess(userId: string, taskId: string) {
    const result = await this.db.query(
      `SELECT 1 FROM tasks t
       WHERE t.id=$1 AND t.archived_at IS NULL
         AND (t.created_by=$2 OR t.assignee_id=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=$2
         ))`,
      [taskId, userId],
    );
    if (!result.rowCount) throw new ForbiddenException({ code: 'TASK_ACCESS_DENIED', message: 'Bu göreve not bağlama yetkiniz bulunmuyor.' });
  }

  private async assertProjectAccess(userId: string, projectId: string) {
    const result = await this.db.query(
      `SELECT 1 FROM projects p
       WHERE p.id=$1 AND p.archived_at IS NULL
         AND (p.created_by=$2 OR EXISTS(
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         ))`,
      [projectId, userId],
    );
    if (!result.rowCount) throw new ForbiddenException({ code: 'PROJECT_ACCESS_DENIED', message: 'Bu projeye not bağlama yetkiniz bulunmuyor.' });
  }
}

function assertUuid(value: string) {
  if (!UUID.test(value)) throw invalid('Not kimliği geçersiz.');
}

function invalid(message: string) {
  return new BadRequestException({ code: 'INVALID_NOTE_REQUEST', message });
}
