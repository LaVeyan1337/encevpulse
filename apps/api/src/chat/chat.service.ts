import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REACTIONS = ['👍','❤️','😂','🎉','👀','🙏','✅','🔥'] as const;

@Injectable()
export class ChatService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async listConversations(user: AuthUser) {
    const result = await this.db.query(
      `SELECT c.id,c.conversation_type AS "type",c.title,c.created_at AS "createdAt",c.updated_at AS "updatedAt",
        CASE WHEN c.conversation_type='direct' THEN (
          SELECT peer.display_name FROM conversation_members cm JOIN users peer ON peer.id=cm.user_id
          WHERE cm.conversation_id=c.id AND cm.user_id<>$1 AND cm.left_at IS NULL LIMIT 1
        ) ELSE c.title END AS "displayName",
        last.body AS "lastMessage",last.created_at AS "lastMessageAt",last.sender_id AS "lastSenderId",
        last.sender_name AS "lastSenderName",
        (SELECT count(*)::int FROM messages unread
          WHERE unread.conversation_id=c.id AND unread.deleted_at IS NULL AND unread.sender_id<>$1
            AND (cursor.last_read_message_id IS NULL OR
              (unread.created_at,unread.id) > (read_message.created_at,read_message.id))) AS "unreadCount",
        (SELECT count(*)::int FROM conversation_members cm
          WHERE cm.conversation_id=c.id AND cm.left_at IS NULL) AS "memberCount",
        (SELECT cm.member_role FROM conversation_members cm
          WHERE cm.conversation_id=c.id AND cm.user_id=$1 AND cm.left_at IS NULL) AS "myRole"
       FROM conversations c
       JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=$1 AND mine.left_at IS NULL
       LEFT JOIN conversation_read_cursors cursor ON cursor.conversation_id=c.id AND cursor.user_id=$1
       LEFT JOIN messages read_message ON read_message.id=cursor.last_read_message_id
       LEFT JOIN LATERAL (
         SELECT m.body,m.created_at,m.sender_id,u.display_name AS sender_name
         FROM messages m JOIN users u ON u.id=m.sender_id
         WHERE m.conversation_id=c.id
         ORDER BY m.created_at DESC,m.id DESC LIMIT 1
       ) last ON true
       WHERE c.archived_at IS NULL
       ORDER BY COALESCE(last.created_at,c.updated_at) DESC,c.id DESC
       LIMIT 200`,[user.id],
    );
    return { conversations: result.rows };
  }

  async createConversation(user: AuthUser,input: unknown) {
    const value=objectInput(input);
    if(value.type==='direct') {
      const otherId=uuidInput(value.userId,'Kullanıcı');
      if(otherId===user.id) throw invalid('Kendinizle bire bir sohbet başlatamazsınız.');
      const other=await this.db.query(`SELECT id FROM users WHERE id=$1 AND status='active'`,[otherId]);
      if(!other.rowCount) throw new NotFoundException({code:'CHAT_USER_NOT_FOUND',message:'Etkin kullanıcı bulunamadı.'});
      const low=user.id<otherId?user.id:otherId;
      const high=user.id<otherId?otherId:user.id;
      const client=await this.db.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':' || $2))`,[low,high]);
        const found=await client.query(`SELECT id FROM conversations WHERE conversation_type='direct'
          AND direct_user_low=$1 AND direct_user_high=$2 AND archived_at IS NULL FOR UPDATE`,[low,high]);
        if(found.rowCount) {
          await client.query('COMMIT');
          return this.conversationDetails(user,found.rows[0].id);
        }
        const created=await client.query(`INSERT INTO conversations(conversation_type,direct_user_low,direct_user_high,created_by)
          VALUES('direct',$1,$2,$3) RETURNING id`,[low,high,user.id]);
        const id=created.rows[0].id;
        await client.query(`INSERT INTO conversation_members(conversation_id,user_id,member_role)
          VALUES($1,$2,'owner'),($1,$3,'member')`,[id,user.id,otherId]);
        await client.query('COMMIT');
        return this.conversationDetails(user,id);
      } catch(error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    }
    if(value.type!=='group') throw invalid('Sohbet türü geçersiz.');
    const title=textInput(value.title,1,100,'Grup adı');
    if(!Array.isArray(value.memberIds)||value.memberIds.some((id)=>typeof id!=='string')) throw invalid('Grup üyeleri geçersiz.');
    const memberIds=[...new Set((value.memberIds as string[]).filter((id)=>id!==user.id))];
    if(memberIds.length<1||memberIds.length>99||memberIds.some((id)=>!UUID.test(id))) throw invalid('Grup en az bir, en çok 99 ek üyeye sahip olabilir.');
    const active=await this.db.pool.query<{id:string}>(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,[memberIds]);
    if(active.rowCount!==memberIds.length) throw invalid('Etkin olmayan kullanıcı gruba eklenemez.');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const created=await client.query(`INSERT INTO conversations(conversation_type,title,created_by)
        VALUES('group',$1,$2) RETURNING id`,[title,user.id]);
      const id=created.rows[0].id;
      await client.query(`INSERT INTO conversation_members(conversation_id,user_id,member_role)
        SELECT $1,member_id,CASE WHEN member_id=$2 THEN 'owner' ELSE 'member' END
        FROM unnest($3::uuid[]) AS member_id`,[id,user.id,[user.id,...memberIds]]);
      await client.query(`INSERT INTO conversation_member_events(conversation_id,target_user_id,actor_user_id,event_type,next_role)
        SELECT $1,member_id,$2,'added',CASE WHEN member_id=$2 THEN 'owner' ELSE 'member' END
        FROM unnest($3::uuid[]) AS member_id`,[id,user.id,[user.id,...memberIds]]);
      await client.query('COMMIT');
      return this.conversationDetails(user,id);
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async conversationDetails(user: AuthUser,id: string) {
    assertUuid(id);
    await this.assertMember(this.db.pool,id,user.id);
    const [conversation,members,pinned]=await Promise.all([
      this.db.query(`SELECT id,conversation_type AS "type",title,created_by AS "createdBy",created_at AS "createdAt"
        FROM conversations WHERE id=$1 AND archived_at IS NULL`,[id]),
      this.db.query(`SELECT u.id,u.display_name AS "displayName",u.username,u.job_title AS "jobTitle",
          u.department,u.avatar_key AS "avatarKey",cm.member_role AS "role",cm.joined_at AS "joinedAt"
        FROM conversation_members cm JOIN users u ON u.id=cm.user_id
        WHERE cm.conversation_id=$1 AND cm.left_at IS NULL AND u.status='active'
        ORDER BY CASE cm.member_role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.display_name`,[id]),
      this.db.query(`SELECT m.id,m.body,m.created_at AS "createdAt",u.display_name AS "senderName"
        FROM messages m JOIN users u ON u.id=m.sender_id
        WHERE m.conversation_id=$1 AND m.pinned_at IS NOT NULL AND m.deleted_at IS NULL
        ORDER BY m.pinned_at DESC LIMIT 5`,[id]),
    ]);
    if(!conversation.rowCount) throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
    const mine=members.rows.find((m)=>m.id===user.id);
    return {conversation:conversation.rows[0],members:members.rows,myRole:mine?.role??'member',pinned:pinned.rows};
  }

  async messages(user: AuthUser,id: string,beforeCreatedAt?: string,beforeId?: string) {
    assertUuid(id);
    await this.assertMember(this.db.pool,id,user.id);
    if((beforeCreatedAt===undefined)!==(beforeId===undefined)) throw invalid('Mesaj sayfalama imleci geçersiz.');
    if(beforeCreatedAt && (Number.isNaN(Date.parse(beforeCreatedAt))||!UUID.test(beforeId!))) throw invalid('Mesaj sayfalama imleci geçersiz.');
    const rows=await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",m.sender_id AS "senderId",
          u.display_name AS "senderName",u.avatar_key AS "senderAvatarKey",m.body,m.reply_to_id AS "replyToId",
          parent.body AS "replyBody",parent_user.display_name AS "replySenderName",m.version,
          m.created_at AS "createdAt",m.edited_at AS "editedAt",m.deleted_at AS "deletedAt",
          m.pinned_at AS "pinnedAt",(m.sender_id=$4) AS "isMine",
          COALESCE((SELECT json_agg(json_build_object(
            'code',reaction_code,'count',reaction_count,'reactedByMe',reacted_by_me
          ) ORDER BY reaction_code) FROM (
            SELECT mr.reaction_code,count(*)::int AS reaction_count,
              bool_or(mr.user_id=$4) AS reacted_by_me
            FROM message_reactions mr WHERE mr.message_id=m.id GROUP BY mr.reaction_code
          ) rx),'[]'::json) AS reactions,
          COALESCE(ARRAY(
            SELECT reader.display_name
            FROM conversation_read_cursors rc
            JOIN messages read_to ON read_to.id=rc.last_read_message_id
            JOIN conversation_members reader_members ON reader_members.conversation_id=rc.conversation_id
              AND reader_members.user_id=rc.user_id AND reader_members.left_at IS NULL
            JOIN users reader ON reader.id=rc.user_id
            WHERE rc.conversation_id=m.conversation_id AND rc.user_id<>m.sender_id
              AND (read_to.created_at,read_to.id)>=(m.created_at,m.id)
            ORDER BY reader.display_name
          ),ARRAY[]::text[]) AS "readBy",
          link.task_id AS "linkedTaskId"
       FROM messages m JOIN users u ON u.id=m.sender_id
       LEFT JOIN messages parent ON parent.id=m.reply_to_id
       LEFT JOIN users parent_user ON parent_user.id=parent.sender_id
       LEFT JOIN message_task_links link ON link.message_id=m.id
       WHERE m.conversation_id=$1 AND ($2::timestamptz IS NULL OR (m.created_at,m.id)<($2::timestamptz,$3::uuid))
       ORDER BY m.created_at DESC,m.id DESC LIMIT 51`,
      [id,beforeCreatedAt??null,beforeId??null,user.id],
    );
    const hasMore=rows.rows.length>50;
    const selected=hasMore?rows.rows.slice(0,50):rows.rows;
    selected.reverse();
    const oldest=selected[0];
    return {messages:selected,page:{hasMore,nextCursor:hasMore&&oldest?{createdAt:oldest.createdAt,id:oldest.id}:null}};
  }

  async sendMessage(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const value=objectInput(input);
    const body=textInput(value.body,1,4000,'Mesaj');
    const replyTo=value.replyToId===undefined||value.replyToId===null?null:uuidInput(value.replyToId,'Yanıt mesajı');
    const clientRequestId=value.clientRequestId===undefined?randomUUID():uuidInput(value.clientRequestId,'İstek kimliği');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.requireMember(client,id,user.id);
      if(replyTo) {
        const parent=await client.query(`SELECT id FROM messages WHERE id=$1 AND conversation_id=$2 AND deleted_at IS NULL`,[replyTo,id]);
        if(!parent.rowCount) throw invalid('Yanıt verilen mesaj bulunamadı.');
      }
      const inserted=await client.query(`INSERT INTO messages(conversation_id,sender_id,client_request_id,body,reply_to_id)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(sender_id,client_request_id) DO NOTHING
        RETURNING id,created_at AS "createdAt",version`,[id,user.id,clientRequestId,body,replyTo]);
      let message=inserted.rows[0];
      if(!message) {
        const existing=await client.query(`SELECT id,created_at AS "createdAt",version FROM messages
          WHERE sender_id=$1 AND client_request_id=$2`,[user.id,clientRequestId]);
        message=existing.rows[0];
      } else {
        await client.query(`INSERT INTO message_events(message_id,conversation_id,actor_user_id,event_type)
          VALUES($1,$2,$3,'created')`,[message.id,id,user.id]);
        await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1`,[id]);
        await client.query(`INSERT INTO chat_notifications(recipient_user_id,actor_user_id,conversation_id,message_id,idempotency_key)
          SELECT cm.user_id,$2,$1,$3,'chat.message:'||$3::text||':'||cm.user_id::text
          FROM conversation_members cm JOIN users u ON u.id=cm.user_id
          WHERE cm.conversation_id=$1 AND cm.user_id<>$2 AND cm.left_at IS NULL AND u.status='active'
          ON CONFLICT(idempotency_key) DO NOTHING`,[id,user.id,message.id]);
      }
      await client.query('COMMIT');
      return {message:{id:message.id,createdAt:message.createdAt,version:message.version,clientRequestId}};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async editMessage(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const value=objectInput(input);
    const body=textInput(value.body,1,4000,'Mesaj');
    const version=positiveVersion(value.version);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const updated=await client.query(`UPDATE messages m SET body=$1,edited_at=now(),version=version+1
        FROM conversation_members cm
        WHERE m.id=$2 AND m.sender_id=$3 AND m.version=$4 AND m.deleted_at IS NULL
          AND cm.conversation_id=m.conversation_id AND cm.user_id=$3 AND cm.left_at IS NULL
        RETURNING m.id,m.conversation_id AS "conversationId",m.version,m.edited_at AS "editedAt"`,[body,id,user.id,version]);
      if(!updated.rowCount) {
        const exists=await client.query(`SELECT m.version,m.sender_id,m.deleted_at FROM messages m
          JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 AND cm.left_at IS NULL
          WHERE m.id=$1`,[id,user.id]);
        if(!exists.rowCount) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Mesaj bulunamadı.'});
        if(exists.rows[0].sender_id!==user.id) throw new ForbiddenException({code:'MESSAGE_EDIT_DENIED',message:'Yalnızca kendi mesajınızı düzenleyebilirsiniz.'});
        if(exists.rows[0].version!==version) throw new ConflictException({code:'MESSAGE_CHANGED',message:'Mesaj başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.'});
        throw new ConflictException({code:'MESSAGE_DELETED',message:'Silinmiş mesaj düzenlenemez.'});
      }
      await client.query(`INSERT INTO message_events(message_id,conversation_id,actor_user_id,event_type,details)
        VALUES($1,$2,$3,'edited',$4)`,[id,updated.rows[0].conversationId,user.id,{version:updated.rows[0].version}]);
      await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1`,[updated.rows[0].conversationId]);
      await client.query('COMMIT');
      return {message:updated.rows[0]};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async deleteMessage(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const version=positiveVersion(objectInput(input).version);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query(`SELECT m.conversation_id,m.sender_id,m.version,m.deleted_at
        FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id
        WHERE m.id=$1 AND cm.user_id=$2 AND cm.left_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!found.rowCount) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Mesaj bulunamadı.'});
      const old=found.rows[0];
      if(old.sender_id!==user.id) throw new ForbiddenException({code:'MESSAGE_DELETE_DENIED',message:'Yalnızca kendi mesajınızı silebilirsiniz.'});
      if(old.version!==version) throw new ConflictException({code:'MESSAGE_CHANGED',message:'Mesaj başka bir işlemde değiştirildi. Yenileyip tekrar deneyin.'});
      if(old.deleted_at) throw new ConflictException({code:'MESSAGE_DELETED',message:'Mesaj zaten silinmiş.'});
      await client.query(`UPDATE messages SET body='',deleted_at=now(),edited_at=now(),version=version+1,
        pinned_at=NULL,pinned_by=NULL WHERE id=$1`,[id]);
      await client.query(`INSERT INTO message_events(message_id,conversation_id,actor_user_id,event_type)
        VALUES($1,$2,$3,'deleted')`,[id,old.conversation_id,user.id]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async react(user: AuthUser,id: string,input: unknown,remove=false) {
    assertUuid(id);
    const reaction=textInput(objectInput(input).reaction,1,4,'Tepki');
    if(!(REACTIONS as readonly string[]).includes(reaction)) throw invalid('Desteklenmeyen tepki.');
    const allowed=await this.db.query(`SELECT m.conversation_id FROM messages m
      JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 AND cm.left_at IS NULL
      WHERE m.id=$1 AND m.deleted_at IS NULL`,[id,user.id]);
    if(!allowed.rowCount) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Mesaj bulunamadı.'});
    if(remove) await this.db.query(`DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND reaction_code=$3`,[id,user.id,reaction]);
    else await this.db.query(`INSERT INTO message_reactions(message_id,user_id,reaction_code)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[id,user.id,reaction]);
    return {ok:true};
  }

  async markRead(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const messageId=uuidInput(objectInput(input).messageId,'Okunma imleci');
    const result=await this.db.query(`SELECT m.id,m.created_at FROM messages m
      JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 AND cm.left_at IS NULL
      WHERE m.id=$1 AND m.conversation_id=$3`,[messageId,user.id,id]);
    if(!result.rowCount) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Okunma imleci mesajı bulunamadı.'});
    await this.db.query(`INSERT INTO conversation_read_cursors(conversation_id,user_id,last_read_message_id)
      VALUES($1,$2,$3)
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_message_id=EXCLUDED.last_read_message_id,updated_at=now()
      WHERE (SELECT created_at FROM messages WHERE id=conversation_read_cursors.last_read_message_id)
        < (SELECT created_at FROM messages WHERE id=EXCLUDED.last_read_message_id)`,[id,user.id,messageId]);
    await this.db.query(`UPDATE chat_notifications n SET read_at=COALESCE(read_at,now())
      FROM messages notified
      WHERE n.message_id=notified.id AND n.recipient_user_id=$1 AND n.conversation_id=$2
        AND (notified.created_at,notified.id)<=(SELECT m.created_at,m.id FROM messages m WHERE m.id=$3)`,[user.id,id,messageId]);
    return {ok:true};
  }

  async search(user: AuthUser,queryInput: unknown) {
    if(typeof queryInput!=='string') throw invalid('Arama metni geçersiz.');
    const query=queryInput.trim().slice(0,80);
    if(query.length<2) throw invalid('Arama için en az iki karakter girin.');
    const result=await this.db.query(
      `SELECT m.id,m.conversation_id AS "conversationId",c.title,c.conversation_type AS "type",
        CASE WHEN c.conversation_type='direct' THEN (
          SELECT u.display_name FROM conversation_members cm JOIN users u ON u.id=cm.user_id
          WHERE cm.conversation_id=c.id AND cm.user_id<>$1 AND cm.left_at IS NULL LIMIT 1
        ) ELSE c.title END AS "conversationName",
        m.body,m.created_at AS "createdAt",u.display_name AS "senderName"
       FROM messages m JOIN conversations c ON c.id=m.conversation_id
       JOIN users u ON u.id=m.sender_id
       JOIN conversation_members cm ON cm.conversation_id=c.id AND cm.user_id=$1 AND cm.left_at IS NULL
       WHERE c.archived_at IS NULL AND m.deleted_at IS NULL AND m.body ILIKE '%'||$2||'%'
       ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,[user.id,query]);
    return {results:result.rows};
  }

  async createTaskFromMessage(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const value=objectInput(input);
    const title=value.title===undefined?null:textInput(value.title,1,240,'Görev başlığı');
    const assigneeId=value.assigneeId===undefined?user.id:uuidInput(value.assigneeId,'Sorumlu');
    const projectId=value.projectId===undefined||value.projectId===null?null:uuidInput(value.projectId,'Proje');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await this.requireMember(client,id,user.id);
      const source=await client.query(`SELECT m.id,m.body,m.conversation_id FROM messages m
        JOIN conversation_members cm ON cm.conversation_id=m.conversation_id AND cm.user_id=$2 AND cm.left_at IS NULL
        WHERE m.id=$1 AND m.deleted_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!source.rowCount) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Kaynak mesaj bulunamadı.'});
      const existing=await client.query(`SELECT task_id FROM message_task_links WHERE message_id=$1`,[id]);
      if(existing.rowCount) {
        const task=await client.query(`SELECT id,title FROM tasks WHERE id=$1`,[existing.rows[0].task_id]);
        await client.query('COMMIT');
        return {task:task.rows[0],alreadyLinked:true};
      }
      const active=await client.query(`SELECT id FROM users WHERE id=$1 AND status='active'`,[assigneeId]);
      if(!active.rowCount) throw invalid('Etkin olmayan kullanıcıya görev atanamaz.');
      if(projectId) {
        const access=await client.query(`SELECT count(*) FILTER (WHERE pm.user_id=$2)::int AS actor_member,
            count(*) FILTER (WHERE pm.user_id=$3)::int AS assignee_member
          FROM project_members pm JOIN projects p ON p.id=pm.project_id
          WHERE pm.project_id=$1 AND p.archived_at IS NULL AND p.status<>'archived'`,[projectId,user.id,assigneeId]);
        if(!access.rows[0].actor_member||!access.rows[0].assignee_member) throw new ForbiddenException({code:'PROJECT_ACCESS_DENIED',message:'Proje üyeliği ve sorumlu üyeliği gerekiyor.'});
      }
      const messageBody=source.rows[0].body as string;
      const taskTitle=title??messageBody.trim().slice(0,240);
      const inserted=await client.query(`INSERT INTO tasks(title,description,status,priority,created_by,assignee_id,project_id)
        VALUES($1,$2,'open','normal',$3,$4,$5)
        RETURNING id,title,status,priority,created_by AS "createdBy",assignee_id AS "assigneeId",project_id AS "projectId",version`,
        [taskTitle,messageBody,user.id,assigneeId,projectId]);
      const task=inserted.rows[0];
      await client.query(`INSERT INTO task_audit_events(task_id,actor_user_id,action,changes)
        VALUES($1,$2,'created',$3)`,[task.id,user.id,{source:'chat.message',messageId:id}]);
      await client.query(`INSERT INTO message_task_links(message_id,task_id,created_by) VALUES($1,$2,$3)`,[id,task.id,user.id]);
      await client.query('COMMIT');
      return {task,alreadyLinked:false};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async pin(user: AuthUser,id: string,unpin=false) {
    assertUuid(id);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const found=await client.query(`SELECT m.conversation_id,m.deleted_at,cm.member_role,c.conversation_type
        FROM messages m JOIN conversation_members cm ON cm.conversation_id=m.conversation_id
        JOIN conversations c ON c.id=m.conversation_id
        WHERE m.id=$1 AND cm.user_id=$2 AND cm.left_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!found.rowCount||found.rows[0].deleted_at) throw new NotFoundException({code:'MESSAGE_NOT_FOUND',message:'Mesaj bulunamadı.'});
      const {conversation_id:conversationId,member_role:role,conversation_type:type}=found.rows[0];
      if(type==='group'&&role!=='owner'&&role!=='admin') throw new ForbiddenException({code:'CHAT_PIN_DENIED',message:'Grup sohbetinde sabitleme yalnızca yöneticilere açıktır.'});
      await client.query(`UPDATE messages SET pinned_at=$1,pinned_by=$2,version=version+1 WHERE id=$3`,[unpin?null:new Date(),unpin?null:user.id,id]);
      await client.query(`INSERT INTO message_events(message_id,conversation_id,actor_user_id,event_type)
        VALUES($1,$2,$3,$4)`,[id,conversationId,user.id,unpin?'unpinned':'pinned']);
      await client.query('COMMIT');
      return {ok:true};
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async addMembers(user: AuthUser,id: string,input: unknown) {
    assertUuid(id);
    const value=objectInput(input);
    if(!Array.isArray(value.userIds)||value.userIds.length<1||value.userIds.length>50||value.userIds.some((x)=>typeof x!=='string'||!UUID.test(x))) throw invalid('Eklenecek üyeler geçersiz.');
    const ids=[...new Set(value.userIds as string[])].filter((x)=>x!==user.id);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const role=await client.query(`SELECT c.conversation_type,cm.member_role FROM conversations c
        JOIN conversation_members cm ON cm.conversation_id=c.id
        WHERE c.id=$1 AND cm.user_id=$2 AND cm.left_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!role.rowCount) throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
      if(role.rows[0].conversation_type!=='group') throw invalid('Bire bir sohbete üye eklenemez.');
      if(role.rows[0].member_role!=='owner'&&role.rows[0].member_role!=='admin') throw new ForbiddenException({code:'CHAT_MEMBER_MANAGE_DENIED',message:'Üye yönetimi grup yöneticilerine açıktır.'});
      const active=await client.query(`SELECT id FROM users WHERE id=ANY($1::uuid[]) AND status='active'`,[ids]);
      if(active.rowCount!==ids.length) throw invalid('Etkin olmayan kullanıcı gruba eklenemez.');
      await client.query(`INSERT INTO conversation_members(conversation_id,user_id,member_role)
        SELECT $1,member_id,'member' FROM unnest($2::uuid[]) AS member_id
        ON CONFLICT(conversation_id,user_id) DO UPDATE SET left_at=NULL,member_role='member',joined_at=now()`,[id,ids]);
      await client.query(`INSERT INTO conversation_member_events(conversation_id,target_user_id,actor_user_id,event_type,next_role)
        SELECT $1,member_id,$3,'added','member' FROM unnest($2::uuid[]) AS member_id`,[id,ids,user.id]);
      await client.query(`UPDATE conversations SET updated_at=now() WHERE id=$1`,[id]);
      await client.query('COMMIT');
      return this.conversationDetails(user,id);
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async updateMemberRole(user: AuthUser,id: string,targetId: string,input: unknown) {
    assertUuid(id); assertUuid(targetId);
    const value=objectInput(input);
    if(value.role!=='admin'&&value.role!=='member') throw invalid('Grup üyesi rolü geçersiz.');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const actor=await client.query(`SELECT c.conversation_type,actor.member_role
        FROM conversations c JOIN conversation_members actor ON actor.conversation_id=c.id
        WHERE c.id=$1 AND actor.user_id=$2 AND actor.left_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!actor.rowCount) throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
      if(actor.rows[0].conversation_type!=='group') throw invalid('Bire bir sohbette üye rolü bulunmaz.');
      if(actor.rows[0].member_role!=='owner') throw new ForbiddenException({code:'CHAT_ROLE_MANAGE_DENIED',message:'Üye rolleri yalnızca grup sahibi tarafından değiştirilebilir.'});
      const target=await client.query(`SELECT member_role FROM conversation_members
        WHERE conversation_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE`,[id,targetId]);
      if(!target.rowCount) throw new NotFoundException({code:'CHAT_MEMBER_NOT_FOUND',message:'Sohbet üyesi bulunamadı.'});
      const previous=target.rows[0].member_role as string;
      if(previous==='owner') throw new ConflictException({code:'CHAT_OWNER_IMMUTABLE',message:'Sohbet sahibi rolü bu ekrandan değiştirilemez.'});
      if(previous===value.role) { await client.query('COMMIT'); return this.conversationDetails(user,id); }
      await client.query(`UPDATE conversation_members SET member_role=$1 WHERE conversation_id=$2 AND user_id=$3`,[value.role,id,targetId]);
      await client.query(`INSERT INTO conversation_member_events(conversation_id,target_user_id,actor_user_id,event_type,previous_role,next_role)
        VALUES($1,$2,$3,'role_changed',$4,$5)`,[id,targetId,user.id,previous,value.role]);
      await client.query('COMMIT');
      return this.conversationDetails(user,id);
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  async removeMember(user: AuthUser,id: string,targetId: string) {
    assertUuid(id); assertUuid(targetId);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const members=await client.query(`SELECT cm.member_role,c.conversation_type FROM conversation_members cm
        JOIN conversations c ON c.id=cm.conversation_id
        WHERE cm.conversation_id=$1 AND cm.user_id=$2 AND cm.left_at IS NULL FOR UPDATE`,[id,user.id]);
      if(!members.rowCount) throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
      const target=await client.query(`SELECT member_role FROM conversation_members
        WHERE conversation_id=$1 AND user_id=$2 AND left_at IS NULL FOR UPDATE`,[id,targetId]);
      if(!target.rowCount) throw new NotFoundException({code:'CHAT_MEMBER_NOT_FOUND',message:'Sohbet üyesi bulunamadı.'});
      if(user.id!==targetId&&members.rows[0].member_role!=='owner'&&members.rows[0].member_role!=='admin') throw new ForbiddenException({code:'CHAT_MEMBER_MANAGE_DENIED',message:'Bu üye için kaldırma yetkiniz yok.'});
      if(target.rows[0].member_role==='owner'&&(members.rows[0].conversation_type==='group'||user.id!==targetId)) throw new ConflictException({code:'CHAT_OWNER_REQUIRED',message:'Grup sahibi ayrılmadan önce sahipliği devretmelidir.'});
      await client.query(`UPDATE conversation_members SET left_at=now() WHERE conversation_id=$1 AND user_id=$2`,[id,targetId]);
      await client.query(`INSERT INTO conversation_member_events(conversation_id,target_user_id,actor_user_id,event_type,previous_role)
        VALUES($1,$2,$3,'removed',$4)`,[id,targetId,user.id,target.rows[0].member_role]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  private async requireMember(client: {query: (sql:string,params?:any[])=>Promise<any>},id:string,userId:string) {
    const result=await client.query(`SELECT 1 FROM conversation_members cm JOIN conversations c ON c.id=cm.conversation_id
      JOIN users u ON u.id=cm.user_id
      WHERE cm.conversation_id=$1 AND cm.user_id=$2 AND cm.left_at IS NULL
        AND c.archived_at IS NULL AND u.status='active'`,[id,userId]);
    if(!result.rowCount) throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
  }

  private async assertMember(pool: {query:(sql:string,params?:any[])=>Promise<any>},id:string,userId:string) {
    await this.requireMember(pool,id,userId);
  }
}

function objectInput(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value)) throw invalid('İstek alanlarını kontrol edin.');
  return value as Record<string,unknown>;
}
function textInput(value:unknown,min:number,max:number,label:string):string{
  if(typeof value!=='string') throw invalid(label+' geçersiz.');
  const text=value.trim();
  if(text.length<min||text.length>max) throw invalid(label+' '+min+'–'+max+' karakter arasında olmalıdır.');
  return text;
}
function uuidInput(value:unknown,label:string):string{
  if(typeof value!=='string'||!UUID.test(value)) throw invalid(label+' kimliği geçersiz.');
  return value;
}
function assertUuid(value:string):void{if(!UUID.test(value)) throw invalid('Kayıt kimliği geçersiz.');}
function positiveVersion(value:unknown):number{
  if(!Number.isInteger(value)||Number(value)<1) throw invalid('Kayıt sürümü geçersiz; yenileyip tekrar deneyin.');
  return Number(value);
}
function invalid(message:string):BadRequestException{
  return new BadRequestException({code:'INVALID_CHAT_REQUEST',message});
}
