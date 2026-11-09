import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';
import { DEFAULT_INSTITUTION_NAMES, DEFAULT_OPINION_SUBJECT } from '../ced/institution-defaults.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'in_progress', 'waiting', 'done'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
const PROJECT_TYPES = ['res','ges','maden','yk_ges','storage','other'] as const;
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
  followerIds?: string[];
}

@Injectable()
export class TasksService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const status = query.status;
    if (status && status !== 'all' && status !== 'active' && !STATUSES.includes(status as TaskStatus)) throw invalid('Görev durumu geçersiz.');
    const due = query.due ?? 'all';
    if (!['all', 'overdue', 'upcoming'].includes(due)) throw invalid('Teslim tarihi filtresi geçersiz.');
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
              a.display_name AS "assigneeName", c.display_name AS "creatorName", p.name AS "projectName",
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',fu.id,'displayName',fu.display_name) ORDER BY fu.display_name)
                FROM task_followers tf JOIN users fu ON fu.id=tf.user_id WHERE tf.task_id=t.id),'[]'::jsonb) AS followers,
              (t.created_by=$1 OR t.assignee_id=$1 OR EXISTS (
                SELECT 1 FROM project_members own_pm WHERE own_pm.project_id=t.project_id AND own_pm.user_id=$1
              )) AS "canManage"
       FROM tasks t
       JOIN users a ON a.id = t.assignee_id
       JOIN users c ON c.id = t.created_by
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE (t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
       ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$1))
       AND (($2 = 'archived' AND t.archived_at IS NOT NULL) OR ($2 <> 'archived' AND t.archived_at IS NULL))
       AND ($3 = 'all' OR ($3 = 'assigned' AND t.assignee_id = $1) OR ($3 = 'created' AND t.created_by = $1) OR $3 = 'archived')
       AND ($4::text IS NULL OR ($4 = 'active' AND t.status <> 'done') OR t.status = $4)
       AND ($5::text IS NULL OR t.priority = $5)
       AND ($6 = '' OR position(lower($6) in lower(t.title || ' ' || t.description)) > 0)
       AND ($7::text = 'all'
         OR ($7 = 'overdue' AND t.status <> 'done'
           AND t.due_on < (now() AT TIME ZONE 'Europe/Istanbul')::date)
         OR ($7 = 'upcoming' AND t.status <> 'done'
           AND t.due_on >= (now() AT TIME ZONE 'Europe/Istanbul')::date
           AND t.due_on <= (now() AT TIME ZONE 'Europe/Istanbul')::date + 7))
       ORDER BY CASE WHEN t.status = 'done' THEN 1 ELSE 0 END, t.position, t.due_on NULLS LAST, t.updated_at DESC, t.id
       LIMIT $8 OFFSET $9`,
      [user.id, view, view, status && status !== 'all' ? status : null, priority && priority !== 'all' ? priority : null, search, due, limit + 1, offset],
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
              a.display_name AS "assigneeName", c.display_name AS "creatorName", p.name AS "projectName",
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id',fu.id,'displayName',fu.display_name) ORDER BY fu.display_name)
                FROM task_followers tf JOIN users fu ON fu.id=tf.user_id WHERE tf.task_id=t.id),'[]'::jsonb) AS followers,
              (t.created_by=$2 OR t.assignee_id=$2 OR EXISTS (
                SELECT 1 FROM project_members own_pm WHERE own_pm.project_id=t.project_id AND own_pm.user_id=$2
              )) AS "canManage"
       FROM tasks t JOIN users a ON a.id = t.assignee_id JOIN users c ON c.id = t.created_by
       LEFT JOIN projects p ON p.id = t.project_id
       WHERE t.id = $1 AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
       ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2))`, [id, user.id],
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

  async notifications(user: AuthUser, includeChat=true, includeTasks=true) {
    const access = `(t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
      SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
    ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$1))`;
    const [count, latest] = await Promise.all([
      this.db.query(
        `SELECT (
          (SELECT count(*) FROM notifications n JOIN tasks t ON t.id=n.task_id
           WHERE n.recipient_user_id=$1 AND n.read_at IS NULL AND t.archived_at IS NULL AND $3::boolean AND ${access})
          +
          (SELECT count(*) FROM chat_notifications cn
           JOIN conversations c ON c.id=cn.conversation_id
           WHERE cn.recipient_user_id=$1 AND cn.read_at IS NULL AND c.archived_at IS NULL AND $2::boolean
             AND EXISTS (SELECT 1 FROM conversation_members cm
               WHERE cm.conversation_id=c.id AND cm.user_id=$1 AND cm.left_at IS NULL))
        )::int AS "unreadCount"`, [user.id,includeChat,includeTasks],
      ),
      this.db.query(
        `SELECT * FROM (
          SELECT n.id,n.event_type AS "eventType",n.task_id AS "taskId",
                 NULL::uuid AS "conversationId",t.title AS "taskTitle",
                 a.display_name AS "actorName",NULL::text AS preview,
                 n.created_at AS "createdAt",n.read_at AS "readAt"
          FROM notifications n JOIN tasks t ON t.id=n.task_id
          LEFT JOIN users a ON a.id=n.actor_user_id
          WHERE n.recipient_user_id=$1 AND t.archived_at IS NULL AND $3::boolean AND ${access}
          UNION ALL
          SELECT cn.id,'chat.message'::text AS "eventType",NULL::uuid AS "taskId",
                 cn.conversation_id AS "conversationId",
                 CASE WHEN c.conversation_type='direct' THEN (
                   SELECT peer.display_name FROM conversation_members cm
                   JOIN users peer ON peer.id=cm.user_id
                   WHERE cm.conversation_id=c.id AND cm.user_id<>$1 AND cm.left_at IS NULL LIMIT 1
                 ) ELSE c.title END AS "taskTitle",
                 actor.display_name AS "actorName",
                 CASE WHEN m.deleted_at IS NULL THEN left(m.body,180) ELSE 'Mesaj silindi' END AS preview,
                 cn.created_at AS "createdAt",cn.read_at AS "readAt"
          FROM chat_notifications cn
          JOIN conversations c ON c.id=cn.conversation_id
          JOIN messages m ON m.id=cn.message_id
          LEFT JOIN users actor ON actor.id=cn.actor_user_id
          WHERE cn.recipient_user_id=$1 AND c.archived_at IS NULL AND $2::boolean
            AND EXISTS (SELECT 1 FROM conversation_members mine
              WHERE mine.conversation_id=c.id AND mine.user_id=$1 AND mine.left_at IS NULL)
        ) combined
        ORDER BY "createdAt" DESC,id DESC
        LIMIT 20`, [user.id,includeChat,includeTasks],
      ),
    ]);
    return { unreadCount: count.rows[0].unreadCount, notifications: latest.rows };
  }

  async markNotificationRead(user: AuthUser, id: string, input: unknown, includeChat=true, includeTasks=true): Promise<void> {
    assertUuid(id);
    objectInput(input);
    if(includeTasks) {
      const taskResult = await this.db.query(
        `UPDATE notifications n SET read_at=now()
         FROM tasks t WHERE n.id=$1 AND n.recipient_user_id=$2 AND n.read_at IS NULL
           AND n.task_id=t.id AND t.archived_at IS NULL
           AND (t.created_by=$2 OR t.assignee_id=$2 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=$2
           ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2)) RETURNING n.id`, [id,user.id],
      );
      if(taskResult.rowCount)return;
    }
    if(includeChat) {
      const chatResult=await this.db.query(
        `UPDATE chat_notifications cn SET read_at=COALESCE(cn.read_at,now())
         FROM conversations c WHERE cn.id=$1 AND cn.recipient_user_id=$2
           AND cn.conversation_id=c.id AND c.archived_at IS NULL
           AND EXISTS (SELECT 1 FROM conversation_members cm
             WHERE cm.conversation_id=c.id AND cm.user_id=$2 AND cm.left_at IS NULL)
         RETURNING cn.id`,[id,user.id],
      );
      if(chatResult.rowCount)return;
    }
    throw new NotFoundException({code:'NOTIFICATION_NOT_FOUND',message:'Bildirim bulunamadı.'});
  }

  async activity(user: AuthUser) {
    const result = await this.db.query(
      `SELECT e.id, e.task_id AS "taskId", e.action, e.occurred_at AS "occurredAt",
              t.title AS "taskTitle", u.display_name AS "actorName"
       FROM task_audit_events e JOIN tasks t ON t.id = e.task_id LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE t.archived_at IS NULL AND (t.created_by = $1 OR t.assignee_id = $1 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $1
       ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$1))
       ORDER BY e.occurred_at DESC, e.id DESC LIMIT 12`, [user.id],
    );
    return { activity: result.rows };
  }

  async taskActivity(user: AuthUser, taskId: string) {
    assertUuid(taskId);
    const access = await this.db.query(
      `SELECT 1 FROM tasks t WHERE t.id = $1 AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
        SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
      ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2))`, [taskId, user.id],
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

  async taskComments(user: AuthUser, taskId: string) {
    assertUuid(taskId);
    const access = await this.db.query(
      `SELECT 1 FROM tasks t WHERE t.id = $1 AND (
        t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
          SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
        ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2)
      )`, [taskId, user.id],
    );
    if (!access.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı.' });

    const result = await this.db.query(
      `SELECT recent.id, recent.task_id AS "taskId",
              CASE WHEN recent.deleted_at IS NULL THEN recent.body ELSE '' END AS body,
              recent.version, recent.created_at AS "createdAt", recent.updated_at AS "updatedAt",
              recent.deleted_at AS "deletedAt",
              author.display_name AS "authorName",
              (recent.author_user_id = $2) AS "isMine"
       FROM (
         SELECT c.id, c.task_id, c.body, c.version, c.created_at, c.updated_at,
                c.deleted_at, c.author_user_id
         FROM task_comments c
         WHERE c.task_id = $1
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT 100
       ) recent
       JOIN users author ON author.id = recent.author_user_id
       ORDER BY recent.created_at, recent.id`,
      [taskId, user.id],
    );
    return { comments: result.rows, limit: 100 };
  }

  async createTaskComment(user: AuthUser, taskId: string, input: unknown) {
    assertUuid(taskId);
    const value = objectInput(input);
    if (Object.keys(value).some((key) => key !== 'body')) throw invalid('Yorum alanlarını kontrol edin.');
    const commentBody = boundedText(value.body, 1, 4000, 'Yorum');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const task = await client.query(
        `SELECT t.id FROM tasks t
         WHERE t.id = $1 AND t.archived_at IS NULL
           AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
           ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2))
         FOR UPDATE`, [taskId, user.id],
      );
      if (!task.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı veya yorum eklemeye kapalı.' });

      const inserted = await client.query(
        `INSERT INTO task_comments (task_id, author_user_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, task_id AS "taskId", body, version,
                   created_at AS "createdAt", updated_at AS "updatedAt", NULL::timestamptz AS "deletedAt"`,
        [taskId, user.id, commentBody],
      );
      const comment = { ...inserted.rows[0], authorName: user.displayName, isMine: true };
      await client.query(
        `INSERT INTO task_comment_events (task_id, comment_id, actor_user_id, event_type, details)
         VALUES ($1, $2, $3, 'created', $4)`,
        [taskId, comment.id, user.id, { bodyLength: commentBody.length }],
      );
      await client.query(
        `INSERT INTO notifications (recipient_user_id, actor_user_id, task_id, event_type, idempotency_key)
         SELECT DISTINCT recipients.user_id, $2::uuid, $1::uuid, 'task.comment',
                'task.comment:' || $3::uuid::text || ':' || recipients.user_id::text
         FROM (
           SELECT t.created_by AS user_id FROM tasks t WHERE t.id = $1::uuid
           UNION
           SELECT t.assignee_id FROM tasks t WHERE t.id = $1::uuid
           UNION
           SELECT pm.user_id FROM project_members pm
           JOIN tasks t ON t.project_id = pm.project_id WHERE t.id = $1::uuid
           UNION
           SELECT tf.user_id FROM task_followers tf WHERE tf.task_id=$1::uuid
         ) recipients
         JOIN users recipient ON recipient.id = recipients.user_id AND recipient.status = 'active'
         WHERE recipients.user_id <> $2::uuid
         ON CONFLICT (idempotency_key) DO NOTHING`,
        [taskId, user.id, comment.id],
      );
      await client.query('COMMIT');
      return { comment };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateTaskComment(user: AuthUser, taskId: string, commentId: string, input: unknown) {
    assertUuid(taskId);
    assertUuid(commentId);
    const value = objectInput(input);
    if (Object.keys(value).some((key) => !['body', 'version'].includes(key))) throw invalid('Yorum alanlarını kontrol edin.');
    const commentBody = boundedText(value.body, 1, 4000, 'Yorum');
    const version = value.version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Yorum sürümü geçersiz; yenileyip tekrar deneyin.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT c.version, c.author_user_id
         FROM task_comments c JOIN tasks t ON t.id = c.task_id
         WHERE c.id = $1 AND c.task_id = $2 AND c.deleted_at IS NULL
           AND t.archived_at IS NULL
           AND (t.created_by = $3 OR t.assignee_id = $3 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $3
           ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$3))
         FOR UPDATE OF c, t`,
        [commentId, taskId, user.id],
      );
      if (!existing.rowCount) throw new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'Yorum bulunamadı veya düzenlemeye kapalı.' });
      if (existing.rows[0].author_user_id !== user.id) throw new ForbiddenException({ code: 'COMMENT_EDIT_DENIED', message: 'Yalnızca kendi yorumunuzu düzenleyebilirsiniz.' });
      if (existing.rows[0].version !== Number(version)) throw new ConflictException({ code: 'COMMENT_CHANGED', message: 'Yorum başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });

      const updated = await client.query(
        `UPDATE task_comments SET body = $3, updated_at = now(), version = version + 1
         WHERE id = $1 AND task_id = $2 AND version = $4 AND deleted_at IS NULL
         RETURNING id, task_id AS "taskId", body, version, created_at AS "createdAt",
                   updated_at AS "updatedAt", deleted_at AS "deletedAt"`,
        [commentId, taskId, commentBody, Number(version)],
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'COMMENT_CHANGED', message: 'Yorum başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      await client.query(
        `INSERT INTO task_comment_events (task_id, comment_id, actor_user_id, event_type, details)
         VALUES ($1, $2, $3, 'edited', $4)`,
        [taskId, commentId, user.id, { bodyLength: commentBody.length }],
      );
      await client.query('COMMIT');
      return { comment: { ...updated.rows[0], authorName: user.displayName, isMine: true } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteTaskComment(user: AuthUser, taskId: string, commentId: string, input: unknown): Promise<void> {
    assertUuid(taskId);
    assertUuid(commentId);
    const value = objectInput(input);
    if (Object.keys(value).some((key) => key !== 'version')) throw invalid('Yorum alanlarını kontrol edin.');
    const version = value.version;
    if (!Number.isInteger(version) || Number(version) < 1) throw invalid('Yorum sürümü geçersiz; yenileyip tekrar deneyin.');
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT c.version, c.author_user_id
         FROM task_comments c JOIN tasks t ON t.id = c.task_id
         WHERE c.id = $1 AND c.task_id = $2 AND c.deleted_at IS NULL
           AND t.archived_at IS NULL
           AND (t.created_by = $3 OR t.assignee_id = $3 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $3
           ) OR EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$3))
         FOR UPDATE OF c, t`,
        [commentId, taskId, user.id],
      );
      if (!existing.rowCount) throw new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'Yorum bulunamadı veya silinmeye kapalı.' });
      if (existing.rows[0].author_user_id !== user.id) throw new ForbiddenException({ code: 'COMMENT_DELETE_DENIED', message: 'Yalnızca kendi yorumunuzu silebilirsiniz.' });
      if (existing.rows[0].version !== Number(version)) throw new ConflictException({ code: 'COMMENT_CHANGED', message: 'Yorum başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });

      await client.query(
        `UPDATE task_comments SET body = '', deleted_at = now(), updated_at = now(), version = version + 1
         WHERE id = $1 AND task_id = $2 AND version = $3 AND deleted_at IS NULL`,
        [commentId, taskId, Number(version)],
      );
      await client.query(
        `INSERT INTO task_comment_events (task_id, comment_id, actor_user_id, event_type, details)
         VALUES ($1, $2, $3, 'deleted', '{}'::jsonb)`,
        [taskId, commentId, user.id],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async people() {
    const result = await this.db.query(
      `SELECT u.id,u.display_name AS "displayName",u.username,u.email,
        u.job_title AS "jobTitle",u.department,u.avatar_key AS "avatarKey",
        COALESCE(array_agg(r.code) FILTER (WHERE r.code IS NOT NULL),ARRAY[]::text[]) AS roles
       FROM users u
       LEFT JOIN user_role_assignments ura ON ura.user_id=u.id
       LEFT JOIN roles r ON r.id=ura.role_id
       WHERE u.status='active'
       GROUP BY u.id
       ORDER BY u.department,u.display_name
       LIMIT 500`,
    );
    return { people: result.rows };
  }

  async projects(user: AuthUser, view = 'active') {
    await this.assertProjectWorkflowMigration();
    if (!['active', 'archived', 'all'].includes(view)) throw invalid('Proje görünümü geçersiz.');
    const result = await this.db.query(
      `SELECT p.id,p.name,p.description,p.status,p.project_type AS "projectType",p.created_by AS "createdBy",p.owner_user_id AS "ownerId",
              owner.display_name AS "ownerName",p.starts_on::text AS "startsOn",p.target_on::text AS "targetOn",
              p.version,p.archived_at AS "archivedAt",p.created_at AS "createdAt",
              COUNT(DISTINCT t.id)::int AS "taskCount",
              (COUNT(DISTINCT t.id) FILTER (WHERE t.status='done'))::int AS "completedTaskCount",
              COUNT(DISTINCT pm.user_id)::int AS "memberCount"
       FROM projects p JOIN users owner ON owner.id=p.owner_user_id
       LEFT JOIN tasks t ON t.project_id=p.id AND t.archived_at IS NULL
       LEFT JOIN project_members pm ON pm.project_id=p.id
       WHERE (p.created_by=$1 OR p.owner_user_id=$1 OR EXISTS (
         SELECT 1 FROM project_members access_pm WHERE access_pm.project_id=p.id AND access_pm.user_id=$1
       ))
       AND (($2='active' AND p.archived_at IS NULL AND p.status<>'archived')
         OR ($2='archived' AND (p.archived_at IS NOT NULL OR p.status='archived')) OR $2='all')
       GROUP BY p.id,owner.display_name
       ORDER BY CASE WHEN p.archived_at IS NULL AND p.status<>'archived' THEN 0 ELSE 1 END,
                p.target_on NULLS LAST,p.updated_at DESC,p.name LIMIT 250`,[user.id,view],
    );
    return { projects: result.rows };
  }

  async projectDetails(user: AuthUser, id: string) {
    await this.assertProjectWorkflowMigration();
    assertUuid(id);
    const projectResult=await this.db.query(
      `SELECT p.id,p.name,p.description,p.status,p.project_type AS "projectType",p.created_by AS "createdBy",creator.display_name AS "creatorName",
              p.owner_user_id AS "ownerId",owner.display_name AS "ownerName",p.starts_on::text AS "startsOn",
              p.target_on::text AS "targetOn",p.version,p.archived_at AS "archivedAt",
              p.status_before_archive AS "statusBeforeArchive",p.created_at AS "createdAt",
              p.updated_at AS "updatedAt",COUNT(DISTINCT t.id)::int AS "taskCount",
              (COUNT(DISTINCT t.id) FILTER (WHERE t.status='done'))::int AS "completedTaskCount",
              COUNT(DISTINCT pm.user_id)::int AS "memberCount"
       FROM projects p JOIN users owner ON owner.id=p.owner_user_id JOIN users creator ON creator.id=p.created_by
       LEFT JOIN tasks t ON t.project_id=p.id AND t.archived_at IS NULL
       LEFT JOIN project_members pm ON pm.project_id=p.id
       WHERE p.id=$1 AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS (
         SELECT 1 FROM project_members access_pm WHERE access_pm.project_id=p.id AND access_pm.user_id=$2
       ))
       GROUP BY p.id,owner.display_name,creator.display_name`,[id,user.id],
    );
    if(!projectResult.rowCount) throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'Proje bulunamadı.'});
    const [members,tasks,activity]=await Promise.all([
      this.db.query(
        `SELECT u.id,u.display_name AS "displayName",u.username,(u.id=$3) AS "isOwner",pm.added_at AS "addedAt"
         FROM project_members pm JOIN users u ON u.id=pm.user_id
         WHERE pm.project_id=$1 AND (u.status='active' OR u.id=$3)
         ORDER BY (u.id=$3) DESC,u.display_name`,[id,user.id,projectResult.rows[0].ownerId],
      ),
      this.db.query(
        `SELECT t.id,t.title,t.status,t.priority,t.assignee_id AS "assigneeId",a.display_name AS "assigneeName",
                t.starts_on::text AS "startsOn",t.due_on::text AS "dueOn"
         FROM tasks t JOIN users a ON a.id=t.assignee_id
         WHERE t.project_id=$1 AND t.archived_at IS NULL
           AND (t.created_by=$2 OR t.assignee_id=$2 OR EXISTS (
             SELECT 1 FROM project_members pm WHERE pm.project_id=t.project_id AND pm.user_id=$2
           ))
         ORDER BY CASE WHEN t.status='done' THEN 1 ELSE 0 END,t.due_on NULLS LAST,t.updated_at DESC LIMIT 200`,[id,user.id],
      ),
      this.db.query(
        `SELECT e.id,e.event_type AS "eventType",e.details,e.created_at AS "createdAt",actor.display_name AS "actorName"
         FROM project_audit_events e LEFT JOIN users actor ON actor.id=e.actor_user_id
         WHERE e.project_id=$1 ORDER BY e.created_at DESC,e.id DESC LIMIT 30`,[id],
      ),
    ]);
    return {project:projectResult.rows[0],members:members.rows,tasks:tasks.rows,activity:activity.rows};
  }

  async createProject(user: AuthUser, input: unknown) {
    await this.assertProjectWorkflowMigration();
    const value=objectInput(input);
    const allowed=new Set(['name','description','memberIds','status','startsOn','targetOn','projectType']);
    if(Object.keys(value).some((key)=>!allowed.has(key))) throw invalid('Proje alanlarını kontrol edin.');
    const name=boundedText(value.name,1,160,'Proje adı');
    const description=boundedText(value.description??'',0,4000,'Açıklama');
    const projectType=String(value.projectType??'other');
    if(!PROJECT_TYPES.includes(projectType as typeof PROJECT_TYPES[number])) throw invalid('Proje türü geçersiz.');
    const status=value.status===undefined?'planning':value.status;
    if(!['planning','active','on_hold','completed'].includes(String(status))) throw invalid('Proje durumu geçersiz.');
    const startsOn=value.startsOn===undefined?null:projectDateInput(value.startsOn,'Başlangıç tarihi');
    const targetOn=value.targetOn===undefined?null:projectDateInput(value.targetOn,'Hedef tarihi');
    if(startsOn&&targetOn&&startsOn>targetOn) throw invalid('Başlangıç tarihi hedef tarihinden sonra olamaz.');
    if(value.memberIds!==undefined&&(!Array.isArray(value.memberIds)||value.memberIds.some((memberId)=>typeof memberId!=='string'))) throw invalid('Proje üyeleri geçersiz.');
    const memberIds=[...new Set((Array.isArray(value.memberIds)?value.memberIds:[]) as string[])].filter((memberId)=>memberId!==user.id);
    if(memberIds.length>100||memberIds.some((memberId)=>!UUID.test(memberId))) throw invalid('Proje üyeleri geçersiz.');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      if(memberIds.length){
        const active=await client.query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,[memberIds]);
        if(active.rowCount!==memberIds.length) throw invalid('Etkin olmayan bir kullanıcı proje üyesi olamaz.');
      }
      const inserted=await client.query(
        `INSERT INTO projects(name,description,status,project_type,created_by,owner_user_id,starts_on,target_on)
         VALUES($1,$2,$3,$4,$5,$5,$6,$7)
         RETURNING id,name,description,status,project_type AS "projectType",created_by AS "createdBy",owner_user_id AS "ownerId",
           starts_on::text AS "startsOn",target_on::text AS "targetOn",version,created_at AS "createdAt"`,
        [name,description,status,projectType,user.id,startsOn,targetOn],
      );
      const project=inserted.rows[0];
      await client.query(
        `INSERT INTO ced_institution_opinions(
          project_id,case_id,institution_name,subject,status,created_by,updated_by
        )
        SELECT $1,NULL,institution_name,$2,'draft',$3,$3
        FROM unnest($4::text[]) AS institution_name`,
        [project.id,DEFAULT_OPINION_SUBJECT,user.id,DEFAULT_INSTITUTION_NAMES],
      );
      await client.query(
        `INSERT INTO project_members(project_id,user_id,added_by)
         SELECT $1,member_id,$2 FROM unnest($3::uuid[]) AS member_id ON CONFLICT DO NOTHING`,
        [project.id,user.id,[user.id,...memberIds]],
      );
      await client.query(
        `INSERT INTO project_audit_events(project_id,actor_user_id,event_type,details)
         VALUES($1,$2,'created',$3)`,[project.id,user.id,{fields:['name','description','status','projectType','startsOn','targetOn','memberIds','defaultInstitutionOpinionDrafts']}],
      );
      await client.query('COMMIT');
      return {project};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async updateProject(user: AuthUser, id: string, input: unknown) {
    await this.assertProjectWorkflowMigration();
    assertUuid(id);
    const value=objectInput(input);
    const allowed=new Set(['version','name','description','status','ownerId','startsOn','targetOn','memberIds','projectType']);
    if(Object.keys(value).some((key)=>!allowed.has(key))) throw invalid('Proje alanlarını kontrol edin.');
    if(!Number.isInteger(value.version)||Number(value.version)<1) throw invalid('Proje sürümü geçersiz; yenileyip tekrar deneyin.');
    if(Object.keys(value).length===1) throw invalid('Kaydedilecek değişiklik bulunamadı.');
    if(value.memberIds!==undefined&&(!Array.isArray(value.memberIds)||value.memberIds.some((memberId)=>typeof memberId!=='string'))) throw invalid('Proje üyeleri geçersiz.');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query(
        `SELECT p.id,p.name,p.description,p.status,p.project_type,p.created_by,p.owner_user_id,p.starts_on::text AS starts_on,
                p.target_on::text AS target_on,p.version,p.archived_at
         FROM projects p WHERE p.id=$1 AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         )) FOR UPDATE`,[id,user.id],
      );
      if(!found.rowCount) throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'Proje bulunamadı.'});
      const old=found.rows[0];
      if(old.version!==Number(value.version)) throw new ConflictException({code:'PROJECT_CHANGED',message:'Proje başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.'});
      if(old.archived_at||old.status==='archived') throw new ConflictException({code:'PROJECT_ARCHIVED',message:'Arşivlenmiş proje düzenlenemez. Önce arşivden çıkarın.'});
      if(old.created_by!==user.id&&old.owner_user_id!==user.id&&!user.roles.includes('system_admin')) throw new ForbiddenException({code:'PROJECT_MANAGE_DENIED',message:'Bu projeyi düzenleme yetkiniz yok.'});
      const name=Object.hasOwn(value,'name')?boundedText(value.name,1,160,'Proje adı'):old.name;
      const description=Object.hasOwn(value,'description')?boundedText(value.description,0,4000,'Açıklama'):old.description;
      const projectType=Object.hasOwn(value,'projectType')?String(value.projectType):old.project_type;
      if(!PROJECT_TYPES.includes(projectType as typeof PROJECT_TYPES[number])) throw invalid('Proje türü geçersiz.');
      const status=Object.hasOwn(value,'status')?value.status:old.status;
      if(!['planning','active','on_hold','completed'].includes(String(status))) throw invalid('Proje durumu geçersiz.');
      const ownerId=Object.hasOwn(value,'ownerId')?value.ownerId:old.owner_user_id;
      if(typeof ownerId!=='string'||!UUID.test(ownerId)) throw invalid('Proje sahibi geçersiz.');
      const startsOn=Object.hasOwn(value,'startsOn')?projectDateInput(value.startsOn,'Başlangıç tarihi'):old.starts_on;
      const targetOn=Object.hasOwn(value,'targetOn')?projectDateInput(value.targetOn,'Hedef tarihi'):old.target_on;
      if(startsOn&&targetOn&&startsOn>targetOn) throw invalid('Başlangıç tarihi hedef tarihinden sonra olamaz.');
      const currentResult=await client.query(`SELECT user_id AS id FROM project_members WHERE project_id=$1`,[id]);
      const current=currentResult.rows.map((row)=>row.id as string);
      const requested=Array.isArray(value.memberIds)?[...new Set(value.memberIds as string[])]:current;
      const members=[...new Set([...requested,ownerId])];
      if(members.length>100||members.some((memberId)=>!UUID.test(memberId))) throw invalid('Proje üyeleri geçersiz.');
      const active=await client.query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,[members]);
      if(active.rowCount!==members.length) throw invalid('Etkin olmayan bir kullanıcı proje üyesi olamaz.');
      const updated=await client.query(
        `UPDATE projects SET name=$1,description=$2,status=$3,project_type=$4,owner_user_id=$5,starts_on=$6,target_on=$7,
           updated_at=now(),version=version+1 WHERE id=$8 AND version=$9 AND archived_at IS NULL RETURNING id`,
        [name,description,status,projectType,ownerId,startsOn,targetOn,id,Number(value.version)],
      );
      if(!updated.rowCount) throw new ConflictException({code:'PROJECT_CHANGED',message:'Proje başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.'});
      const removed=current.filter((memberId)=>!members.includes(memberId));
      const added=members.filter((memberId)=>!current.includes(memberId));
      if(removed.length) await client.query(`DELETE FROM project_members WHERE project_id=$1 AND user_id=ANY($2::uuid[])`,[id,removed]);
      if(added.length) await client.query(
        `INSERT INTO project_members(project_id,user_id,added_by)
         SELECT $1,member_id,$2 FROM unnest($3::uuid[]) AS member_id ON CONFLICT DO NOTHING`,[id,user.id,added],
      );
      await client.query(
        `INSERT INTO project_audit_events(project_id,actor_user_id,event_type,details)
         VALUES($1,$2,'updated',$3)`,[id,user.id,{fields:Object.keys(value).filter((key)=>key!=='version')}],
      );
      for(const memberId of added) await client.query(
        `INSERT INTO project_audit_events(project_id,actor_user_id,event_type,details)
         VALUES($1,$2,'member_added',$3)`,[id,user.id,{userId:memberId}],
      );
      for(const memberId of removed) await client.query(
        `INSERT INTO project_audit_events(project_id,actor_user_id,event_type,details)
         VALUES($1,$2,'member_removed',$3)`,[id,user.id,{userId:memberId}],
      );
      await client.query('COMMIT');
      return this.projectDetails(user,id);
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async archiveProject(user: AuthUser, id: string, input: unknown, restore: boolean): Promise<void> {
    await this.assertProjectWorkflowMigration();
    assertUuid(id);
    const value=objectInput(input);
    const allowedKeys = restore ? new Set(['version', 'restoreStatus']) : new Set(['version']);
    if(Object.keys(value).some((key)=>!allowedKeys.has(key))||!Number.isInteger(value.version)||Number(value.version)<1) throw invalid('Proje sürümü geçersiz; yenileyip tekrar deneyin.');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query(
        `SELECT p.created_by,p.owner_user_id,p.status,p.status_before_archive,p.archived_at,p.version
         FROM projects p WHERE p.id=$1 AND (p.created_by=$2 OR p.owner_user_id=$2 OR EXISTS (
           SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$2
         )) FOR UPDATE`,[id,user.id],
      );
      if(!found.rowCount) throw new NotFoundException({code:'PROJECT_NOT_FOUND',message:'Proje bulunamadı.'});
      const old=found.rows[0];
      if(old.version!==Number(value.version)) throw new ConflictException({code:'PROJECT_CHANGED',message:'Proje başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.'});
      if(old.created_by!==user.id&&old.owner_user_id!==user.id&&!user.roles.includes('system_admin')) throw new ForbiddenException({code:'PROJECT_MANAGE_DENIED',message:'Bu proje için arşiv yetkiniz yok.'});
      if (restore) {
        if (!old.archived_at && old.status !== 'archived') {
          throw new ConflictException({ code: 'PROJECT_NOT_ARCHIVED', message: 'Proje zaten arşivde değil.' });
        }
        let restoreStatus = old.status_before_archive as string | null;
        if (restoreStatus === null) {
          restoreStatus = typeof value.restoreStatus === 'string' ? value.restoreStatus : null;
          if (!['planning', 'active', 'on_hold', 'completed'].includes(String(restoreStatus))) {
            throw invalid('Bu eski arşiv kaydı için geri yüklenecek durumu seçin.');
          }
        } else if (value.restoreStatus !== undefined) {
          throw invalid('Bu proje için arşiv öncesi durum zaten kayıtlı.');
        }
        await client.query(
          `UPDATE projects
           SET status = $1, status_before_archive = NULL, archived_at = NULL,
               updated_at = now(), version = version + 1
           WHERE id = $2 AND version = $3`,
          [restoreStatus, id, Number(value.version)],
        );
      }else{
        if(old.archived_at||old.status==='archived') throw new ConflictException({code:'PROJECT_ALREADY_ARCHIVED',message:'Proje zaten arşivlenmiş.'});
        await client.query(`UPDATE projects SET status_before_archive=status,status='archived',archived_at=now(),updated_at=now(),version=version+1 WHERE id=$1 AND version=$2`,[id,Number(value.version)]);
      }
      await client.query(
        `INSERT INTO project_audit_events(project_id,actor_user_id,event_type,details)
         VALUES($1,$2,$3,'{}'::jsonb)`,[id,user.id,restore?'restored':'archived'],
      );
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async create(user: AuthUser, input: unknown) {
    const value = validateTaskInput(input, true);
    const assigneeId = value.assigneeId ?? user.id;
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.assertAssignee(client, assigneeId);
      if (value.projectId) await this.assertProjectMember(client, value.projectId, user.id, assigneeId);
      const followerIds = (value.followerIds ?? []).filter((followerId) => followerId !== user.id && followerId !== assigneeId);
      await this.assertFollowerUsers(client, followerIds);
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
      if (followerIds.length) {
        await client.query(
          `INSERT INTO task_followers(task_id,user_id,added_by)
           SELECT $1,follower_id,$2 FROM unnest($3::uuid[]) AS followers(follower_id) ON CONFLICT DO NOTHING`,
          [task.id, user.id, followerIds],
        );
        await client.query(
          `INSERT INTO notifications(recipient_user_id,actor_user_id,task_id,event_type,idempotency_key)
           SELECT follower_id,$2,$1,'task.followed',
             'task.followed:' || $1::text || ':1:' || follower_id::text
           FROM unnest($3::uuid[]) AS followers(follower_id) ON CONFLICT(idempotency_key) DO NOTHING`,
          [task.id, user.id, followerIds],
        );
      }
      await client.query(`INSERT INTO task_audit_events (task_id, actor_user_id, action, changes) VALUES ($1,$2,'created',$3)`,
        [task.id, user.id, { fields: Object.keys(value), followerIdsAdded: followerIds }]);
      if (assigneeId !== user.id) {
        await client.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, task_id, event_type, idempotency_key)
           VALUES ($1,$2,$3,'task.assigned',$4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [assigneeId, user.id, task.id, `task.assigned:${task.id}:1`],
        );
      }
      task.followers = await this.taskFollowerRows(client, task.id);
      task.canManage = true;
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
      const existing = await this.loadAccessibleTask(client, id, user.id, true, false, false);
      if (existing.version !== Number(version)) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      if (value.assigneeId) await this.assertAssignee(client, value.assigneeId);
      const projectId = Object.hasOwn(value, 'projectId') ? value.projectId ?? null : existing.project_id;
      const assigneeId = value.assigneeId ?? existing.assignee_id;
      if (projectId) await this.assertProjectMember(client, projectId, user.id, assigneeId);
      const currentFollowers = await client.query('SELECT user_id FROM task_followers WHERE task_id=$1 ORDER BY user_id', [id]);
      const previousFollowerIds = currentFollowers.rows.map((row: { user_id: string }) => row.user_id);
      const requestedFollowerIds = Object.hasOwn(value, 'followerIds') ? (value.followerIds ?? []) : previousFollowerIds;
      const nextFollowerIds = requestedFollowerIds.filter((followerId) => followerId !== existing.created_by && followerId !== assigneeId);
      await this.assertFollowerUsers(client, nextFollowerIds);
      const addedFollowerIds = nextFollowerIds.filter((followerId) => !previousFollowerIds.includes(followerId));
      const removedFollowerIds = previousFollowerIds.filter((followerId) => !nextFollowerIds.includes(followerId));
      const columns: Record<string, string> = { title: 'title', description: 'description', status: 'status', priority: 'priority', assigneeId: 'assignee_id', projectId: 'project_id', startsOn: 'starts_on', dueOn: 'due_on' };
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [key, column] of Object.entries(columns)) if (Object.hasOwn(value, key)) {
        values.push((value as Record<string, unknown>)[key] ?? null);
        sets.push(`${column} = $${values.length}`);
      }
      values.push(id, Number(version));
      const updated = await client.query(
        `UPDATE tasks SET ${sets.length ? sets.join(', ') + ', ' : ''}updated_at = now(), version = version + 1
         WHERE id = $${values.length - 1} AND version = $${values.length} AND archived_at IS NULL
         RETURNING id, title, description, status, priority, created_by AS "createdBy", assignee_id AS "assigneeId",
           project_id AS "projectId", starts_on::text AS "startsOn", due_on::text AS "dueOn", version, updated_at AS "updatedAt"`, values,
      );
      if (!updated.rowCount) throw new ConflictException({ code: 'TASK_CHANGED', message: 'Görev başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.' });
      if (removedFollowerIds.length) {
        await client.query('DELETE FROM task_followers WHERE task_id=$1 AND user_id=ANY($2::uuid[])', [id, removedFollowerIds]);
      }
      if (addedFollowerIds.length) {
        await client.query(
          `INSERT INTO task_followers(task_id,user_id,added_by)
           SELECT $1,follower_id,$2 FROM unnest($3::uuid[]) AS followers(follower_id) ON CONFLICT DO NOTHING`,
          [id, user.id, addedFollowerIds],
        );
        await client.query(
          `INSERT INTO notifications(recipient_user_id,actor_user_id,task_id,event_type,idempotency_key)
           SELECT follower_id,$2,$1,'task.followed',
             'task.followed:' || $1::text || ':' || $4::text || ':' || follower_id::text
           FROM unnest($3::uuid[]) AS followers(follower_id) ON CONFLICT(idempotency_key) DO NOTHING`,
          [id, user.id, addedFollowerIds, updated.rows[0].version],
        );
      }
      await client.query(`INSERT INTO task_audit_events (task_id, actor_user_id, action, changes) VALUES ($1,$2,'updated',$3)`, [id, user.id, {
        fields: Object.keys(value), followerIdsAdded: addedFollowerIds, followerIdsRemoved: removedFollowerIds,
      }]);
      if (value.assigneeId && value.assigneeId !== existing.assignee_id && value.assigneeId !== user.id) {
        await client.query(
          `INSERT INTO notifications (recipient_user_id, actor_user_id, task_id, event_type, idempotency_key)
           VALUES ($1,$2,$3,'task.assigned',$4) ON CONFLICT (idempotency_key) DO NOTHING`,
          [value.assigneeId, user.id, id, `task.assigned:${id}:${updated.rows[0].version}`],
        );
      }
      updated.rows[0].followers = await this.taskFollowerRows(client, id);
      updated.rows[0].canManage = true;
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
      const existing = await this.loadAccessibleTask(client, id, user.id, true, restore, false);
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

  private async loadAccessibleTask(client: import('pg').PoolClient, id: string, userId: string, lock: boolean, includeArchived = false, includeFollowers = true) {
    const result = await client.query(
      `SELECT t.version, t.assignee_id, t.project_id, t.created_by FROM tasks t WHERE t.id = $1 AND ($3 OR t.archived_at IS NULL)
       AND (t.created_by = $2 OR t.assignee_id = $2 OR EXISTS (
         SELECT 1 FROM project_members pm WHERE pm.project_id = t.project_id AND pm.user_id = $2
       ) OR ($4 AND EXISTS (SELECT 1 FROM task_followers tf WHERE tf.task_id=t.id AND tf.user_id=$2))) ${lock ? 'FOR UPDATE' : ''}`,
      [id, userId, includeArchived, includeFollowers],
    );
    if (!result.rowCount) throw new NotFoundException({ code: 'TASK_NOT_FOUND', message: 'Görev bulunamadı.' });
    return result.rows[0] as { version: number; assignee_id: string; project_id: string | null; created_by: string };
  }

  private async assertFollowerUsers(client: import('pg').PoolClient, userIds: string[]) {
    if (!userIds.length) return;
    const active = await client.query("SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'", [userIds]);
    if (active.rowCount !== userIds.length) throw invalid('Takipçiler arasında etkin olmayan veya bulunamayan çalışan var.');
  }

  private async taskFollowerRows(client: import('pg').PoolClient, taskId: string) {
    const result = await client.query(
      `SELECT u.id,u.display_name AS "displayName" FROM task_followers tf
       JOIN users u ON u.id=tf.user_id WHERE tf.task_id=$1 ORDER BY u.display_name`, [taskId],
    );
    return result.rows;
  }

  private async assertAssignee(client: import('pg').PoolClient, userId: string) {
    if (!UUID.test(userId)) throw invalid('Görev sorumlusu geçersiz.');
    const result = await client.query("SELECT 1 FROM users WHERE id = $1 AND status = 'active'", [userId]);
    if (!result.rowCount) throw invalid('Etkin olmayan bir kullanıcı görev sorumlusu olamaz.');
  }

  private async assertProjectWorkflowMigration(): Promise<void> {
    try {
      const applied = await this.db.query(
        `SELECT 1 FROM app_schema_migrations WHERE version = $1`,
        ['0005_project_workflow.sql'],
      );
      if (!applied.rowCount) {
        throw new ServiceUnavailableException({
          code: 'PROJECT_MIGRATION_REQUIRED',
          message: 'Projeler veritabanı güncellemesi eksik. Projeleri kullanmak için `npm run db:migrate --workspace @encev-pulse/api` komutunu çalıştırın ve API hizmetini yeniden başlatın.',
        });
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      if (code === '42P01' || code === '42703') {
        throw new ServiceUnavailableException({
          code: 'PROJECT_MIGRATION_REQUIRED',
          message: 'Projeler veritabanı güncellemesi eksik. Projeleri kullanmak için `npm run db:migrate --workspace @encev-pulse/api` komutunu çalıştırın ve API hizmetini yeniden başlatın.',
        });
      }
      throw error;
    }
  }

  private async assertProjectMember(client: import('pg').PoolClient, projectId: string, actorId: string, assigneeId: string) {
    if (!UUID.test(projectId)) throw invalid('Proje geçersiz.');
    const result = await client.query(
      `SELECT count(*) FILTER (WHERE user_id = $2)::int AS actor_member,
              count(*) FILTER (WHERE user_id = $3)::int AS assignee_member
       FROM project_members pm JOIN projects p ON p.id = pm.project_id WHERE pm.project_id = $1 AND p.archived_at IS NULL AND p.status <> 'archived'`, [projectId, actorId, assigneeId],
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
  const allowed = new Set(['title', 'description', 'status', 'priority', 'assigneeId', 'projectId', 'startsOn', 'dueOn', 'followerIds', ...(creating ? [] : ['version'])]);
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
  if (Object.hasOwn(value, 'followerIds')) {
    if (!Array.isArray(value.followerIds) || value.followerIds.length > 20 ||
        value.followerIds.some((id) => typeof id !== 'string' || !UUID.test(id)) ||
        new Set(value.followerIds).size !== value.followerIds.length) {
      throw invalid('Görev takipçilerini kontrol edin. En fazla 20 farklı çalışan seçebilirsiniz.');
    }
    output.followerIds = value.followerIds as string[];
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


function projectDateInput(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) {
    throw invalid(label + ' geçersiz.');
  }
  return value;
}

function invalid(message: string): BadRequestException {
  return new BadRequestException({ code: 'INVALID_TASK_REQUEST', message });
}
