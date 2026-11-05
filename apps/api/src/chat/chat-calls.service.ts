import { createHmac } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { AuthUser } from '../auth/auth.service.js';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNAL_TYPES=['offer','answer','ice_candidate'] as const;
type SignalType=typeof SIGNAL_TYPES[number];

@Injectable()
export class ChatCallsService {
  constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}

  async iceConfiguration(user:AuthUser) {
    const stunUrls=urls(process.env.CHAT_STUN_URLS??'',['stun:']);
    const turnUrls=urls(process.env.CHAT_TURN_URLS??'',['turn:','turns:']);
    const secret=String(process.env.CHAT_TURN_SHARED_SECRET??'');
    const ttlRaw=Number(process.env.CHAT_TURN_TTL_SECONDS??43200);
    const ttl=Number.isInteger(ttlRaw)&&ttlRaw>=600&&ttlRaw<=86400?ttlRaw:43200;
    const iceServers:Array<Record<string,string|string[]>>=[];
    if(stunUrls.length)iceServers.push({urls:stunUrls});
    if(turnUrls.length&&secret.length>=32) {
      const expires=Math.floor(Date.now()/1000)+ttl;
      const username=expires+':'+user.id;
      const credential=createHmac('sha1',secret).update(username).digest('base64');
      iceServers.push({urls:turnUrls,username,credential});
    }
    return {
      iceServers,
      relayConfigured:iceServers.some(server=>{
        const entries=Array.isArray(server.urls)?server.urls:[server.urls];
        return entries.some(value=>typeof value==='string'&&value.startsWith('turn'));
      }),
      credentialExpiresAt:turnUrls.length&&secret.length>=32?new Date((Math.floor(Date.now()/1000)+ttl)*1000).toISOString():null,
    };
  }

  async startCall(user:AuthUser,conversationId:string,input:unknown) {
    assertUuid(conversationId);
    const value=objectInput(input);
    assertKeys(value,['mediaType']);
    const mediaType=enumValue(value.mediaType,['audio','video'] as const,'Arama türü');
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const conversation=await client.query<{type:string}>(
        `SELECT c.conversation_type AS type FROM conversations c
         JOIN conversation_members mine ON mine.conversation_id=c.id AND mine.user_id=$2 AND mine.left_at IS NULL
         WHERE c.id=$1 AND c.archived_at IS NULL FOR UPDATE OF c`,
        [conversationId,user.id],
      );
      if(!conversation.rowCount)throw new NotFoundException({code:'CONVERSATION_NOT_FOUND',message:'Sohbet bulunamadı.'});
      if(conversation.rows[0].type!=='direct')throw invalid('Bu sürümde aramalar bire bir sohbetlerde kullanılabilir.');
      const peers=await client.query<{id:string}>(
        `SELECT cm.user_id AS id FROM conversation_members cm
         JOIN users u ON u.id=cm.user_id AND u.status='active'
         WHERE cm.conversation_id=$1 AND cm.left_at IS NULL AND cm.user_id<>$2`,
        [conversationId,user.id],
      );
      if(peers.rowCount!==1)throw new ConflictException({code:'CHAT_CALL_PEER_UNAVAILABLE',message:'Bire bir sohbetin diğer katılımcısı etkin değil.'});
      const peerId=peers.rows[0].id;
      const lockIds=[user.id,peerId].sort();
      for(const lockId of lockIds)await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('chat-call-user:'||$1::text))`,[lockId],
      );
      await client.query(
        `UPDATE chat_calls SET status='missed',ended_at=now()
         WHERE status='ringing' AND expires_at<=now()`,
      );
      await client.query(
        `UPDATE chat_calls call_row SET status='ended',ended_at=now()
         WHERE call_row.status IN ('ringing','accepted')
           AND (call_row.status='accepted' AND call_row.last_heartbeat_at<now()-interval '120 seconds'
             OR NOT EXISTS(SELECT 1 FROM conversation_members member
               WHERE member.conversation_id=call_row.conversation_id AND member.user_id=call_row.caller_user_id AND member.left_at IS NULL)
             OR NOT EXISTS(SELECT 1 FROM conversation_members member
               WHERE member.conversation_id=call_row.conversation_id AND member.user_id=call_row.callee_user_id AND member.left_at IS NULL))`,
      );
      const busy=await client.query(
        `SELECT id FROM chat_calls WHERE status IN ('ringing','accepted')
          AND (caller_user_id=ANY($1::uuid[]) OR callee_user_id=ANY($1::uuid[]))
         LIMIT 1`,
        [[user.id,peerId]],
      );
      if(busy.rowCount)throw new ConflictException({code:'CHAT_CALL_BUSY',message:'Katılımcılardan biri başka bir görüşmede veya gelen aramayı yanıtlamayı bekliyor.'});
      const inserted=await client.query<{id:string;createdAt:Date;expiresAt:Date}>(
        `INSERT INTO chat_calls(conversation_id,caller_user_id,callee_user_id,media_type,status,expires_at)
         VALUES($1,$2,$3,$4,'ringing',now()+interval '45 seconds')
         RETURNING id,created_at AS "createdAt",expires_at AS "expiresAt"`,
        [conversationId,user.id,peerId,mediaType],
      );
      await client.query('COMMIT');
      return {call:{id:inserted.rows[0].id,conversationId,callerUserId:user.id,calleeUserId:peerId,
        mediaType,status:'ringing',createdAt:inserted.rows[0].createdAt,expiresAt:inserted.rows[0].expiresAt}};
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }

  async activeCall(user:AuthUser) {
    await this.db.query(
      `UPDATE chat_calls SET status='missed',ended_at=now()
       WHERE status='ringing' AND expires_at<=now()`,
    );
    await this.db.query(
      `UPDATE chat_calls call_row SET status='ended',ended_at=now()
       WHERE call_row.status IN ('ringing','accepted')
         AND (NOT EXISTS(
           SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=call_row.conversation_id
             AND cm.user_id=call_row.caller_user_id AND cm.left_at IS NULL
         ) OR NOT EXISTS(
           SELECT 1 FROM conversation_members cm WHERE cm.conversation_id=call_row.conversation_id
             AND cm.user_id=call_row.callee_user_id AND cm.left_at IS NULL
         ))`,
    );
    await this.db.query(
      `UPDATE chat_calls SET status='ended',ended_at=now()
       WHERE status='accepted' AND last_heartbeat_at<now()-interval '120 seconds'`,
    );
    const result=await this.db.query(
      `SELECT call_row.id,call_row.conversation_id AS "conversationId",
        call_row.caller_user_id AS "callerUserId",call_row.callee_user_id AS "calleeUserId",
        call_row.media_type AS "mediaType",call_row.status,call_row.created_at AS "createdAt",
        call_row.accepted_at AS "acceptedAt",call_row.expires_at AS "expiresAt",
        conversation.conversation_type AS "conversationType",conversation.title AS "conversationTitle",
        CASE WHEN call_row.caller_user_id=$1 THEN callee.display_name ELSE caller.display_name END AS "peerName",
        CASE WHEN call_row.caller_user_id=$1 THEN callee.avatar_key ELSE caller.avatar_key END AS "peerAvatarKey",
        (call_row.caller_user_id=$1) AS "isCaller"
       FROM chat_calls call_row
       JOIN conversations conversation ON conversation.id=call_row.conversation_id AND conversation.archived_at IS NULL
       JOIN conversation_members mine ON mine.conversation_id=call_row.conversation_id AND mine.user_id=$1 AND mine.left_at IS NULL
       JOIN users caller ON caller.id=call_row.caller_user_id AND caller.status='active'
       JOIN users callee ON callee.id=call_row.callee_user_id AND callee.status='active'
       WHERE call_row.status IN ('ringing','accepted')
         AND (call_row.caller_user_id=$1 OR call_row.callee_user_id=$1)
       ORDER BY call_row.created_at DESC LIMIT 1`,
      [user.id],
    );
    return {call:result.rows[0]??null};
  }

  async acceptCall(user:AuthUser,callId:string) {
    assertUuid(callId);
    const result=await this.db.query(
      `UPDATE chat_calls SET status='accepted',accepted_at=now(),last_heartbeat_at=now()
       WHERE id=$1 AND callee_user_id=$2 AND status='ringing' AND expires_at>now()
         AND EXISTS(SELECT 1 FROM conversation_members callee_member
           WHERE callee_member.conversation_id=chat_calls.conversation_id AND callee_member.user_id=$2 AND callee_member.left_at IS NULL)
         AND EXISTS(SELECT 1 FROM conversation_members caller_member
           WHERE caller_member.conversation_id=chat_calls.conversation_id AND caller_member.user_id=chat_calls.caller_user_id AND caller_member.left_at IS NULL)
       RETURNING id,conversation_id AS "conversationId",media_type AS "mediaType",
         caller_user_id AS "callerUserId",callee_user_id AS "calleeUserId",status,accepted_at AS "acceptedAt"`,
      [callId,user.id],
    );
    if(!result.rowCount)throw new ConflictException({code:'CHAT_CALL_NOT_ANSWERABLE',message:'Arama artık yanıtlanabilir durumda değil.'});
    return {call:result.rows[0]};
  }

  async declineCall(user:AuthUser,callId:string) {
    assertUuid(callId);
    const result=await this.db.query(
      `UPDATE chat_calls SET status='declined',ended_at=now()
       WHERE id=$1 AND callee_user_id=$2 AND status='ringing'
       RETURNING id`,
      [callId,user.id],
    );
    if(!result.rowCount)throw new ConflictException({code:'CHAT_CALL_NOT_DECLINABLE',message:'Gelen arama artık reddedilebilir durumda değil.'});
    return {ok:true};
  }

  async endCall(user:AuthUser,callId:string) {
    assertUuid(callId);
    const result=await this.db.query(
      `UPDATE chat_calls SET status=CASE WHEN status='ringing' AND caller_user_id=$2 THEN 'cancelled' ELSE 'ended' END,
         ended_at=now()
       WHERE id=$1 AND (caller_user_id=$2 OR callee_user_id=$2) AND status IN ('ringing','accepted')
       RETURNING id,status`,
      [callId,user.id],
    );
    if(!result.rowCount)throw new ConflictException({code:'CHAT_CALL_NOT_ACTIVE',message:'Arama zaten sona ermiş.'});
    return {call:result.rows[0]};
  }

  async heartbeat(user:AuthUser,callId:string) {
    assertUuid(callId);
    const result=await this.db.query(
      `UPDATE chat_calls call_row SET last_heartbeat_at=now()
       WHERE call_row.id=$1 AND (call_row.caller_user_id=$2 OR call_row.callee_user_id=$2)
         AND call_row.status='accepted'
         AND (SELECT count(*) FROM conversation_members member
           WHERE member.conversation_id=call_row.conversation_id
             AND member.user_id=ANY(ARRAY[call_row.caller_user_id,call_row.callee_user_id])
             AND member.left_at IS NULL)=2`,
      [callId,user.id],
    );
    if(!result.rowCount)throw new ConflictException({code:'CHAT_CALL_NOT_ACTIVE',message:'Etkin arama bulunamadı.'});
    return {ok:true};
  }

  async sendSignal(user:AuthUser,callId:string,input:unknown) {
    assertUuid(callId);
    const value=objectInput(input);
    assertKeys(value,['signalType','payload']);
    const signalType=enumValue(value.signalType,SIGNAL_TYPES,'Sinyal türü') as SignalType;
    const payload=validateSignalPayload(signalType,value.payload);
    const client=await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const call=await client.query<{
        conversation_id:string;caller_user_id:string;callee_user_id:string;status:string;
      }>(
        `SELECT conversation_id,caller_user_id,callee_user_id,status
         FROM chat_calls WHERE id=$1 FOR UPDATE`,[callId],
      );
      if(!call.rowCount)throw new NotFoundException({code:'CHAT_CALL_NOT_FOUND',message:'Arama bulunamadı.'});
      const row=call.rows[0];
      if(user.id!==row.caller_user_id&&user.id!==row.callee_user_id)throw new NotFoundException({code:'CHAT_CALL_NOT_FOUND',message:'Arama bulunamadı.'});
      const participants=await client.query(
        `SELECT count(*)::int AS count FROM conversation_members
         WHERE conversation_id=$1 AND user_id=ANY($2::uuid[]) AND left_at IS NULL`,
        [row.conversation_id,[row.caller_user_id,row.callee_user_id]],
      );
      if(participants.rows[0].count!==2)throw new NotFoundException({code:'CHAT_CALL_NOT_FOUND',message:'Arama bulunamadı.'});
      if(!['ringing','accepted'].includes(row.status))throw new ConflictException({code:'CHAT_CALL_CLOSED',message:'Sona ermiş aramaya sinyal gönderilemez.'});
      if(signalType==='offer'&&user.id!==row.caller_user_id)throw invalid('Arama teklifini yalnızca arayan taraf gönderebilir.');
      if(signalType==='answer'&&(user.id!==row.callee_user_id||row.status!=='accepted'))throw invalid('Arama yanıtı yalnızca aramayı kabul eden katılımcı tarafından gönderilebilir.');
      if(signalType==='ice_candidate') {
        const count=await client.query<{count:number}>(
          `SELECT count(*)::int AS count FROM chat_call_signals
           WHERE call_id=$1 AND sender_user_id=$2 AND signal_type='ice_candidate'`,[callId,user.id],
        );
        if(count.rows[0].count>=64)throw invalid('Bu aramada ICE sinyal sınırına ulaşıldı.');
      }
      const inserted=await client.query(
        `INSERT INTO chat_call_signals(call_id,conversation_id,sender_user_id,signal_type,payload)
         VALUES($1,$2,$3,$4,$5) RETURNING id::text AS id,created_at AS "createdAt"`,
        [callId,row.conversation_id,user.id,signalType,payload],
      );
      await client.query(`UPDATE chat_calls SET last_heartbeat_at=now() WHERE id=$1`,[callId]);
      await client.query('COMMIT');
      return {signal:inserted.rows[0]};
    }catch(error){await client.query('ROLLBACK');throw error;}
    finally{client.release();}
  }

  async listSignals(user:AuthUser,callId:string,afterIdInput?:string) {
    assertUuid(callId);
    const afterId=afterIdInput===undefined?'0':afterIdInput;
    if(!/^(0|[1-9][0-9]{0,18})$/.test(afterId))throw invalid('Arama sinyali imleci geçersiz.');
    const result=await this.db.query(
      `SELECT signal.id::text AS id,signal.sender_user_id AS "senderUserId",
        signal.signal_type AS "signalType",signal.payload,signal.created_at AS "createdAt"
       FROM chat_call_signals signal
       JOIN chat_calls call_row ON call_row.id=signal.call_id
       JOIN conversation_members member ON member.conversation_id=call_row.conversation_id
         AND member.user_id=$2 AND member.left_at IS NULL
       WHERE signal.call_id=$1 AND (call_row.caller_user_id=$2 OR call_row.callee_user_id=$2)
         AND signal.sender_user_id<>$2 AND signal.id>$3::bigint
       ORDER BY signal.id LIMIT 101`,
      [callId,user.id,afterId],
    );
    const hasMore=result.rows.length>100;
    const signals=hasMore?result.rows.slice(0,100):result.rows;
    return {signals,nextAfterId:signals.length?signals[signals.length-1].id:afterId,hasMore};
  }
}

function validateSignalPayload(type:SignalType,input:unknown):Record<string,unknown>{
  const value=objectInput(input);
  if(type==='offer'||type==='answer'){
    assertKeys(value,['type','sdp']);
    if(value.type!==type||typeof value.sdp!=='string'||value.sdp.length<1||value.sdp.length>16000)throw invalid('WebRTC SDP içeriği geçersiz.');
    return {type,sdp:value.sdp};
  }
  assertKeys(value,['candidate','sdpMid','sdpMLineIndex','usernameFragment']);
  if(typeof value.candidate!=='string'||value.candidate.length<1||value.candidate.length>2048)throw invalid('ICE adayı geçersiz.');
  if(value.sdpMid!==null&&value.sdpMid!==undefined&&(typeof value.sdpMid!=='string'||value.sdpMid.length>100))throw invalid('ICE medya kimliği geçersiz.');
  if(value.sdpMLineIndex!==null&&value.sdpMLineIndex!==undefined&&(!Number.isInteger(value.sdpMLineIndex)||Number(value.sdpMLineIndex)<0||Number(value.sdpMLineIndex)>128))throw invalid('ICE medya satırı geçersiz.');
  if(value.usernameFragment!==null&&value.usernameFragment!==undefined&&(typeof value.usernameFragment!=='string'||value.usernameFragment.length>100))throw invalid('ICE kullanıcı parçası geçersiz.');
  return {
    candidate:value.candidate,
    sdpMid:value.sdpMid??null,
    sdpMLineIndex:value.sdpMLineIndex??null,
    usernameFragment:value.usernameFragment??null,
  };
}

function urls(value:string,schemes:string[]):string[]{
  return [...new Set(value.split(',').map(item=>item.trim()).filter(item=>item&&schemes.some(scheme=>item.toLowerCase().startsWith(scheme))))].slice(0,8);
}
function objectInput(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid('İstek alanlarını kontrol edin.');
  return value as Record<string,unknown>;
}
function assertKeys(value:Record<string,unknown>,allowed:string[]){
  if(Object.keys(value).some(key=>!allowed.includes(key)))throw invalid('İstek alanlarını kontrol edin.');
}
function enumValue<const T extends readonly string[]>(value:unknown,allowed:T,label:string):T[number]{
  if(typeof value!=='string'||!allowed.includes(value))throw invalid(label+' geçersiz.');
  return value;
}
function assertUuid(value:string){
  if(!UUID.test(value))throw invalid('Arama kimliği geçersiz.');
}
function invalid(message:string){return new BadRequestException({code:'INVALID_CHAT_CALL',message});}
