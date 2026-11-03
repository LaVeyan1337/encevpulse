import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'in_progress', 'waiting', 'done'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
type TaskStatus = typeof STATUSES[number];
type Priority = typeof PRIORITIES[number];

interface TaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string;
  projectId?: string | null;
  startsOn?: string | null;
  dueOn?: string | null;
}

@Injectable()
export class TasksService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const status = query.status;
    if (status && status !== 'all' && !STATUSES.includes(status as TaskStatus)) throw invalid('Görev durumu geçersiz.');
    const priority = query.priority;
    if (priority && priority !== 'all' && !PRIORITIES.includes(priority as Priority)) throw invalid('Görev önceliği geçersiz.');
    const view = query.view ?? 'all';
    if (!['all', 'assigned', 'created', 'archived'].includes(view)) throw invalid('Görev filtresi geçersiz.');
    const search = (query.q ?? '').trim().slice(0, 120);
    const limit = query.limit === undefined ? 100 : Number(query.limit);
    const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200 || !Number.isInteger(offset) || offset < 0 || offset > 10000) throw invalid('Sayfa isteği geçersiz.');
    const result = await this.db.query(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.created_by AS "createdBy",
              t.assignee_id AS "assigneeId", t.project_id AS "projectId", t.starts_on::text AS "startsOn",
              t.due_on::text AS "dueOn", t.position, t.version, t.created_at AS "createdAt",
              t.updated_at AS "updatedAt", t.archived_at AS "archivedAt",
              a.display_name AS "assigneeName", c.display_name AS "creatorName", p.name AS "projectName"
       FROM tasks t
       JOIN users a ON a.id = t.assignee_id
       JOIN users c ON c.id = t.created_by
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE (t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
       ))
       AND (($2 = 'archived' AND t.archived_at IS NOT NULL) OR ($2 <> 'archived' AND t.archived_at IS NULL))
       AND ($3 = 'all' OR ($3 = 'assigned' AND t.assignee_id = $1) OR ($3 = 'created' AND t.created_by = $1) OR $3 = 'archived')
       AND ($4::text IS NULL OR t.status = $4)
       AND ($5::text IS NULL OR t.priority = $5)
       AND ($6 = '' OR position(lower($6) in lower(t.title || ' ' || t.description)) > 0)
       ORDER BY CASE WHEN t.status = 'done' THEN 1 ELSE 0 END, t.position, t.due_on NULLS LAST, t.updated_at DESC, t.id
       LIMIT $7 OFFSET $8`,
      [user.id, view, view, status && status !== 'all' ? status : null, priority && priority !== 'all' ? priority : null, search, limit + 1, offset],
    );
    const hasMore = result.rows.length > limit;
    const tasks = hasMore ? result.rows.slice(0, limit) : result.rows;
    return { tasks, page: { offset, limit, hasMore, nextOffset: hasMore ? offset + limit : null } };
  }

  async get(user: AuthUser, id: string) {
    assertUuid(id);
    const result = await this.db.query(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.created_by AS "createdBy",
              t.assignee_id AS "assigneeId", t.project_id AS "projectId", t.starts_on::text AS "startsOn",
              t.due_on::text AS "dueOn", t.position, t.version, t.created_at AS "createdAt",
              t.updated_at AS "updatedAt", t.archived_at AS "archivedAt",
              a.display_name AS "assigneeName", c.display_name AS "creatorName", p.name AS "projectName"
       FROM tasks t JOIN users a ON a.id = t.assignee_id JOIN users c ON c.id = t.created_by
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1 AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
       ))`, [id, user.id],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı.' });
    return { task: result.rows[0] };
  }

  async summary(user: AuthUser) {
    const result = await this.db.query(
      `SELECT count(*)::int AS "assignedTotal",
              count(*) FILTER (WHERE status <> 'done')::int AS open,
              count(*) FILTER (WHERE status = 'done')::int AS completed,
              count(*) FILTER (WHERE status <> 'done' AND due_on < (now() AT TIME ZONE 'Europe/Istanbul')::date)::int AS overdue,
              count(*) FILTER (WHERE status <> 'done' AND due_on >= (now() AT TIME ZONE 'Europe/Istanbul')::date
                AND due_on <= (now() AT TIME ZONE 'Europe/Istanbul')::date + 7)::int AS upcoming
       FROM tasks WHERE assignee_id = $1 AND archived_at IS NULL`, [user.id],
    );
    const due = await this.db.query(
      `SELECT id, title, status, priority, due_on::text AS "dueOn" FROM tasks
       WHERE assignee_id = $1 AND archived_at IS NULL AND status <> 'done' AND due_on IS NOT NULL
         AND due_on >= (now() AT TIME ZONE 'Europe/Istanbul')::date
         AND due_on <= (now() AT TIME ZONE 'Europe/Istanbul')::date + 7
       ORDER BY due_on, position LIMIT 5`, [user.id],
    );
    return { summary: result.rows[0], upcoming: due.rows };
  }

  async notifications(user: AuthUser) {
    const access = `(t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
      SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
    ))`;
    const [count, latest] = await Promise.all([
      this.db.query(
        `SELECT count(*)::int AS "unreadCount" FROM notifications n JOIN tasks t ON t.id = n.task_id
         WHERE n.recipient_user_id = $1 AND n.read_at IS NULL AND t.archived_at IS NULL AND ${access}`, [user.id],
      ),
      this.db.query(
        `SELECT n.id, n.event_type AS "eventType", n.task_id AS "taskId", t.title AS "taskTitle",
                a.display_name AS "actorName", n.created_at AS "createdAt", n.read_at AS "readAt"
         FROM notifications n JOIN tasks t ON t.id = n.task_id LEFT JOIN users a ON a.id = n.actor_user_id
         WHERE n.recipient_user_id = $1 AND t.archived_at IS NULL AND ${access}
         ORDER BY n.created_at DESC, n.id DESC LIMIT 20`, [user.id],
      ),
    ]);
    return { unreadCount: count.rows[0].unreadCount, notifications: latest.rows };
  }

  async markNotificationRead(user: AuthUser, id: string, input: unknown): Promise<void> {
    assertUuid(id);
    objectInput(input);
    const result = await this.db.query(
      `UPDATE notifications n SET read_at = now()
       FROM tasks t WHERE n.id = $1 AND n.recipient_user_id = $2 AND n.read_at IS NULL AND n.task_id = t.id
         AND t.archived_at IS NULL AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
         )) RETURNING n.id`, [id, user.id],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Bildirim bulunamadı.' });
  }

  async activity(user: AuthUser) {
    const result = await this.db.query(
      `SELECT e.id, e.task_id AS "taskId", e.action, e.occurred_at AS "occurredAt",
              t.title AS "taskTitle", u.display_name AS "actorName"
       FROM task_audit_events e JOIN tasks t ON t.id = e.task_id LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE t.archived_at IS NULL AND (t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
       ))
       ORDER BY e.occurred_at DESC, e.id DESC LIMIT 12`, [user.id],
    );
    return { activity: result.rows };
  }

  async taskActivity(user: AuthUser, taskId: string) {
    assertUuid(taskId);
    const access = await this.db.query(
      `SELECT 1 FROM tasks t WHERE t.id = $1 AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
      ))`, [taskId, user.id],
    );
    if (!access.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı.' });

    const result = await this.db.query(
      `SELECT e.id, e.task_id AS "taskId", e.action, e.occurred_at AS "occurredAt",
              e.changes, u.display_name AS "actorName"
       FROM task_audit_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.task_id = $1
       ORDER BY e.occurred_at DESC, e.id DESC LIMIT 50`, [taskId],
    );
    return { activity: result.rows };
  }

  async people() {
    const result = await this.db.query(
      `SELECT id, display_name AS "displayName", username FROM users WHERE status = 'active' ORDER BY display_name LIMIT 500`,
    );
    return { people: result.rows };
  }

  async projects(user: AuthUser) {
    const result = await this.db.query(
      `SELECT p.id, p.name, p.description, p.status, p.created_by AS "createdBy",
              p.created_at AS "createdAt", count(t.id)::int AS "taskCount"
       FROM projects p LEFT JOIN tasks t ON t.project_id = p.id AND t.archived_at IS NULL
       WHERE (p.created_by = $1 OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $1))
         AND p.archived_at IS NULL
       GROUP BY p.id ORDER BY p.name LIMIT 200`, [user.id],
    );
    return { projects: result.rows };
  }

  async createProject(user: AuthUser, input: unknown) {
    const value = objectInput(input);
    const name = boundedText(value.name, 1, 160, 'Proje adı');
    const description = boundedText(value.description ?? '', 0, 4000, 'Açıklama');
    if (value.memberIds !== undefined && (!Array.isArray(value.memberIds) || value.memberIds.some((id) => typeof id !== 'string'))) throw invalid('Proje üyeleri geçersiz.');
    const memberIds = Array.isArray(value.memberIds) ? [...new Set(value.memberIds as string[])] : [];
    if (memberIds.length > 100 || memberIds.some((id) => !UUID.test(id))) throw invalid('Proje üyeleri geçersiz.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      if (memberIds.length) {
        const active = await client.query('SELECT id FROM users WHERE id = ANY($1::uuid[]) AND status = \'active\'', [memberIds]);
        if (active.rowCount !== memberIds.length) throw invalid('Etkin olmayan bir kullanıcı proje üyesi olamaz.');
      }
      const inserted = await client.query(
        `INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3)
         RETURNING id, name, description, status, created_by AS "createdBy", created_at AS "createdAt"`, [name, description, user.id],
      );
      const project = inserted.rows[0];
      await client.query('INSERT INTO project_members (project_id, user_id, added_by) VALUES ($1, $2, $2)', [project.id, user.id]);
      if (memberIds.length) await client.query(
        `INSERT INTO project_members (project_id, user_id, added_by)
         SELECT $1, member_id, $2 FROM unnest($3::uuid[]) AS member_id ON CONFLICT DO NOTHING`, [project.id, user.id, memberIds],
      );
      await client.query('COMMIT');
      return { project };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async create(user: AuthUser, input: unknown) {
    const value = validateTaskInput(input, true);
    const assigneeId = value.assigneeId ?? user.id;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertAssignee(client, assigneeId);
      if (value.projectId) await this.assertProjectMember(client, value.projectId, user.id, assigneeId);
      const result = await client.query(
        `INSERT INTO tasks (title, description, status, priority, created_by, assignee_id, project_id, starts_on, due_on)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, title, description, status, priority, created_by AS "createdBy", assignee_id AS "assigneeId",
           project_id AS "projectId", starts_on::text AS "startsOn", due_on::text AS "dueOn", version,
           created_at AS "createdAt", updated_at AS "updatedAt"`,
        [value.title, value.description ?? '', value.status ?? 'open', value.priority ?? 'normal', user.id,
          assigneeId, value.projectId ?? null, value.startsOn ?? null, value.dueOn ?? null],
      );
      const task = result.rows[0];
      await client.query(`INSERT INTO task_audit_events (task_id, actor_user_id, action, changes) VALUES ($1,$2,'created',$3)`, [task.id, user.id, { fields: Object.keys(value) }]);
      if (assigneeId !== user.id) {
        await client.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, task_id, event_type, idempotency_key)
           VALUES ($1,$2,$3,'task.assigned',$4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [assigneeId, user.id, task.id, `task.assigned:${task.id}:1`],
        );
      }
      await client.query('COMMIT');
      return { task };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async update(user: AuthUser, id: string, input: unknown) {
    assertUuid(id);
    const value = validateTaskInput(input, false);
    const version = objectInput(input).version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Görev sürümü geçersiz; yenileyip tekrar deneyin.');
    if (!Object.keys(value).length) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.loadAccessibleTask(client, id, user.id, true);
      if (existing.version !== Number(version)) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      if (value.assigneeId) await this.assertAssignee(client, value.assigneeId);
      const projectId = Object.hasOwn(value, 'projectId') ? value.projectId ?? null : existing.project_id;
      const assigneeId = value.assigneeId ?? existing.assignee_id;
      if (projectId) await this.assertProjectMember(client, projectId, user.id, assigneeId);
      const columns: Record<string, string> = { title: 'title', description: 'description', status: 'status', priority: 'priority', assigneeId: 'assignee_id', projectId: 'project_id', startsOn: 'starts_on', dueOn: 'due_on' };
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of Object.entries(columns)) if (Object.hasOwn(value, key)) {
        values.push((value as Record<string, unknown>)[key] ?? null);
        sets.push(`${column} = $${values.length}`);
      }
      values.push(id, Number(version));
      const updated = await client.query(
        `UPDATE tasks SET ${sets.join(', ')}, updated_at = now(), version = version + 1
         WHERE id = $${values.length - 1} AND version = $${values.length} AND archived_at IS NULL
         RETURNING id, title, description, status, priority, created_by AS "createdBy", assignee_id AS "assigneeId",
           project_id AS "projectId", starts_on::text AS "startsOn", due_on::text AS "dueOn", version, updated_at AS "updatedAt"`, values,
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      await client.query(`INSERT INTO task_audit_events (task_id, actor_user_id, action, changes) VALUES ($1,$2,'updated',$3)`, [id, user.id, { fields: Object.keys(value) }]);
      if (value.assigneeId && value.assigneeId !== existing.assignee_id && value.assigneeId !== user.id) {
        await client.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, task_id, event_type, idempotency_key)
           VALUES ($1,$2,$3,'task.assigned',$4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [value.assigneeId, user.id, id, `task.assigned:${id}:${updated.rows[0].version}`],
        );
      }
      await client.query('COMMIT');
      return { task: updated.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async archive(user: AuthUser, id: string, input: unknown, restore: boolean): Promise<void> {
    assertUuid(id);
    const version = objectInput(input).version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Görev sürümü geçersiz; yenileyip tekrar deneyin.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await this.loadAccessibleTask(client, id, user.id, true, restore);
      if (existing.version !== Number(version)) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      const updated = await client.query(
        `UPDATE tasks SET archived_at = ${restore ? 'NULL' : 'now()'}, updated_at = now(), version = version + 1
         WHERE id = $1 AND version = $2 AND archived_at IS ${restore ? 'NOT ' : ''}NULL RETURNING version`, [id, version],
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev durumu değişti. Yenileyip tekrar deneyin.' });
      await client.query('INSERT INTO task_audit_events (task_id, actor_user_id, action, changes) VALUES ($1,$2,$3,$4)', [id, user.id, restore ? 'restored' : 'archived', { fields: ['archivedAt'] }]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async loadAccessibleTask(client: import('pg').PoolClient, id: string, userId: string, lock: boolean, includeArchived = false) {
    const result = await client.query(
      `SELECT t.version, t.assignee_id, t.project_id FROM tasks t WHERE t.id = $1 AND ($3 OR t.archived_at IS NULL)
       AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
        )) ${lock ? 'FOR UPDATE' : ''}`, [id, userId, includeArchived],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı.' });
    return result.rows[0] as { version: number; assignee_id: string; project_id: string | null };
  }

  private async assertAssignee(client: import('pg').PoolClient, userId: string) {
    if (!UUID.test(userId)) throw invalid('Görev sorumlusu geçersiz.');
    const result = await client.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [userId]);
    if (!result.rowCount) throw invalid('Etkin olmayan bir kullanıcı görev sorumlusu olamaz.');
  }

  private async assertProjectMember(client: import('pg').PoolClient, projectId: string, actorId: string, assigneeId: string) {
    if (!UUID.test(projectId)) throw invalid('Proje geçersiz.');
    const result = await client.query(
      `SELECT count(*) FILTER (WHERE user_id = $2)::int AS actor_member,
              count(*) FILTER (WHERE user_id = $3)::int AS assignee_member
       FROM project_members WHERE project_id = $1`, [projectId, actorId, assigneeId],
    );
    const row = result.rows[0];
    if (!row.actor_member || !row.assignee_member) throw new ForbiddenException({ code: 'PROJECT_ACCESS_DENIED', message: 'Görev için proje üyeliği ve sorumlu üyeliği gerekiyor.' });
  }
}

function objectInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('İstek bilgilerini kontrol edin.');
  return input as Record<string, unknown>;
}

function boundedText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== 'string') throw invalid(`${label} geçersiz.`);
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) throw invalid(`${label} ${min}–${max} karakter arasında olmalıdır.`);
  return normalized;
}

function validateTaskInput(input: unknown, creating: boolean): TaskInput {
  const value = objectInput(input);
  const allowed = new Set(['title', 'description', 'status', 'priority', 'assigneeId', 'projectId', 'startsOn', 'dueOn', ...(creating ? [] : ['version'])]);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw invalid('Görev alanlarını kontrol edin.');
  const output: TaskInput = {};
  if (creating || Object.hasOwn(value, 'title')) output.title = boundedText(value.title, 1, 240, 'Görev adı');
  if (Object.hasOwn(value, 'description')) output.description = boundedText(value.description, 0, 8000, 'Açıklama');
  if (Object.hasOwn(value, 'status')) {
    if (!STATUSES.includes(value.status as TaskStatus)) throw invalid('Görev durumu geçersiz.');
    output.status = value.status as TaskStatus;
  }
  if (Object.hasOwn(value, 'priority')) {
    if (!PRIORITIES.includes(value.priority as Priority)) throw invalid('Görev önceliği geçersiz.');
    output.priority = value.priority as Priority;
  }
  if (Object.hasOwn(value, 'assigneeId')) {
    if (typeof value.assigneeId !== 'string' || !UUID.test(value.assigneeId)) throw invalid('Görev sorumlusu geçersiz.');
    output.assigneeId = value.assigneeId;
  }
  if (Object.hasOwn(value, 'projectId')) {
    if (value.projectId !== null && (typeof value.projectId !== 'string' || !UUID.test(value.projectId))) throw invalid('Proje geçersiz.');
    output.projectId = value.projectId as string | null;
  }
  for (const key of ['startsOn', 'dueOn'] as const) if (Object.hasOwn(value, key)) {
    const date = value[key];
    if (date !== null && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw invalid('Görev tarihini kontrol edin.');
    output[key] = date as string | null;
  }
  const starts = output.startsOn ?? null;
  const due = output.dueOn ?? null;
  if (starts && due && starts > due) throw invalid('Başlangıç tarihi son tarihten sonra olamaz.');
  return output;
}

function assertUuid(value: string): void {
  if (!UUID.test(value)) throw invalid('Kayıt kimliği geçersiz.');
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_TASK_REQUEST', message });
}
