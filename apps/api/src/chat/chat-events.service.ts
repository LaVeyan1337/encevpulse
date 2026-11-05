import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Observable } from 'rxjs';
import { DatabaseService } from '../database/database.service.js';

const CHANNEL='pulse_chat_events';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ChatEventType='message.changed'|'membership.changed'|'reaction.changed'|'read.changed'|'task.linked'|'call.changed';
interface ChatNotification {conversationId:string;eventType:ChatEventType;affectedUserId?:string|null;}

@Injectable()
export class ChatEventsService implements OnModuleInit,OnModuleDestroy {
  private listener:PoolClient|null=null;
  private reconnectTimer:ReturnType<typeof setTimeout>|null=null;
  private reconnectAttempt=0;
  private shuttingDown=false;
  private readonly subscribers=new Map<string,Set<(event:MessageEvent)=>void>>();

  constructor(@Inject(DatabaseService) private readonly db:DatabaseService) {}

  async onModuleInit():Promise<void>{await this.connectListener();}

  subscribe(userId:string,verifySession:()=>Promise<boolean>):Observable<MessageEvent>{
    return new Observable<MessageEvent>(subscriber=>{
      let listeners=this.subscribers.get(userId);
      if(!listeners){listeners=new Set();this.subscribers.set(userId,listeners);}
      const send=(event:MessageEvent)=>subscriber.next(event);
      listeners.add(send);
      subscriber.next({type:'ready',data:{realtime:Boolean(this.listener)}});

      let lastSessionCheck=Date.now();
      let verifying=false;
      const heartbeat=setInterval(async()=>{
        if(verifying||subscriber.closed)return;
        verifying=true;
        try{
          if(Date.now()-lastSessionCheck>=60_000){
            const active=await verifySession();
            lastSessionCheck=Date.now();
            if(!active){subscriber.complete();return;}
          }
          if(!subscriber.closed)subscriber.next({type:'heartbeat',data:{realtime:Boolean(this.listener)}});
        }catch{
          subscriber.complete();
        }finally{verifying=false;}
      },25_000);

      return ()=>{
        clearInterval(heartbeat);
        listeners?.delete(send);
        if(listeners?.size===0)this.subscribers.delete(userId);
      };
    });
  }

  async onModuleDestroy():Promise<void>{
    this.shuttingDown=true;
    if(this.reconnectTimer)clearTimeout(this.reconnectTimer);
    this.reconnectTimer=null;
    const client=this.listener;
    this.listener=null;
    if(client){
      try{await client.query('UNLISTEN '+CHANNEL);client.release();}
      catch{client.release(true);}
    }
    this.subscribers.clear();
  }

  private async connectListener():Promise<void>{
    if(this.shuttingDown||this.listener)return;
    let client:PoolClient|null=null;
    try{
      client=await this.db.pool.connect();
      client.on('notification',(notification:{channel?:string;payload?:string})=>{
        if(notification.channel!==CHANNEL||!notification.payload)return;
        let payload:ChatNotification;
        try{payload=JSON.parse(notification.payload) as ChatNotification;}catch{return;}
        if(!payload||!UUID.test(payload.conversationId)||
          !['message.changed','membership.changed','reaction.changed','read.changed','task.linked','call.changed'].includes(payload.eventType))return;
        if(payload.affectedUserId&&!UUID.test(payload.affectedUserId))return;
        void this.dispatch(payload).catch(()=>undefined);
      });
      client.on('error',()=>this.listenerFailed(client!));
      await client.query('LISTEN '+CHANNEL);
      if(this.shuttingDown){client.release();return;}
      this.listener=client;
      this.reconnectAttempt=0;
      this.publishAll({type:'ready',data:{realtime:true}});
    }catch{
      if(client&&this.listener!==client){try{client.release(true);}catch{/* already released */}}
      this.scheduleReconnect();
    }
  }

  private listenerFailed(client:PoolClient):void{
    if(this.listener!==client)return;
    this.listener=null;
    try{client.release(true);}catch{/* connection is already closed */}
    this.publishAll({type:'ready',data:{realtime:false}});
    this.scheduleReconnect();
  }

  private scheduleReconnect():void{
    if(this.shuttingDown||this.reconnectTimer)return;
    const delay=Math.min(30_000,1_000*(2**Math.min(this.reconnectAttempt,5)));
    this.reconnectAttempt+=1;
    this.reconnectTimer=setTimeout(()=>{
      this.reconnectTimer=null;
      void this.connectListener();
    },delay);
    this.reconnectTimer.unref?.();
  }

  private async dispatch(payload:ChatNotification):Promise<void>{
    const result=await this.db.query<{userId:string}>(
      `SELECT cm.user_id AS "userId"
       FROM conversation_members cm
       JOIN users u ON u.id=cm.user_id AND u.status='active'
       JOIN conversations c ON c.id=cm.conversation_id AND c.archived_at IS NULL
       WHERE cm.conversation_id=$1 AND cm.left_at IS NULL`,
      [payload.conversationId],
    );
    const activeMembers=new Set(result.rows.map(row=>row.userId));
    const recipients=new Set(activeMembers);
    if(payload.eventType==='membership.changed'&&payload.affectedUserId){
      const affected=await this.db.query<{id:string}>(
        'SELECT id FROM users WHERE id=$1 AND status=\'active\'',[payload.affectedUserId],
      );
      if(affected.rowCount)recipients.add(payload.affectedUserId);
    }
    for(const userId of recipients){
      this.publishUser(userId,{
        type:'conversation.updated',
        data:{
          conversationId:payload.conversationId,
          eventType:payload.eventType,
          accessRevoked:Boolean(payload.affectedUserId===userId&&!activeMembers.has(userId)),
        },
      });
    }
  }

  private publishUser(userId:string,event:MessageEvent):void{
    for(const send of this.subscribers.get(userId)??[])send(event);
  }

  private publishAll(event:MessageEvent):void{
    for(const userId of this.subscribers.keys())this.publishUser(userId,event);
  }
}