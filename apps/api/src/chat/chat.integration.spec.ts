import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';
import { ApplicationModule } from '../application.module.js';
import { PasswordHasher } from '../auth/password-hasher.js';

const ORIGIN = process.env.APP_ORIGIN ?? 'http://127.0.0.1:5173';
const PASSWORD = 'Yerel-Chat-Test-Parolasi-2026!';
interface Client { cookie:string; csrf:string }

type SseEventReader={
  next:(timeoutMs?:number)=>Promise<{event:string;data:string}|null>;
  close:()=>Promise<void>;
};

function createSseEventReader(reader:ReadableStreamDefaultReader<Uint8Array>):SseEventReader {
  const decoder=new TextDecoder();
  let buffer='';
  let pending:Promise<ReadableStreamReadResult<Uint8Array>>|null=null;
  return {
    async next(timeoutMs=4000) {
      while(true) {
        const frameBoundary=/\r?\n\r?\n/.exec(buffer);
        if(frameBoundary) {
          const boundary=frameBoundary.index;
          const block=buffer.slice(0,boundary);
          buffer=buffer.slice(boundary+frameBoundary[0].length);
          let event='message';
          const data:string[]=[];
          for(const line of block.split(/\r?\n/)) {
            if(line.startsWith('event:'))event=line.slice(6).trim();
            else if(line.startsWith('data:'))data.push(line.slice(5).trimStart());
          }
          if(data.length)return {event,data:data.join('\n')};
          continue;
        }
        pending??=reader.read();
        let timer:ReturnType<typeof setTimeout>|undefined;
        const result=await Promise.race([
          pending,
          new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),timeoutMs);}),
        ]);
        if(timer)clearTimeout(timer);
        if(result===null)return null;
        pending=null;
        if(result.done)return null;
        buffer+=decoder.decode(result.value,{stream:true});
      }
    },
    async close() {
      try{await reader.cancel();}catch{/* stream may already be closed */}
    },
  };
}

async function openChatEvents(base:string,client:Client):Promise<SseEventReader> {
  const response=await fetch(base+'/api/chat/events',{
    headers:{Origin:ORIGIN,Cookie:client.cookie,Accept:'text/event-stream'},
    signal:AbortSignal.timeout(5000),
  });
  assert.equal(response.status,200);
  assert.ok((response.headers.get('content-type')??'').startsWith('text/event-stream'));
  assert.ok(response.body);
  return createSseEventReader(response.body.getReader());
}

test('sohbet API: üyelik, roller, mesajlar, okundu bilgisi, arama ve görev bağlantısı', async (t) => {
  process.loadEnvFile(resolve(process.cwd(), '../../.env'));
  const pool = new Pool({
    host:process.env.DB_HOST ?? '127.0.0.1',
    port:Number(process.env.DB_PORT ?? 5432),
    database:process.env.DB_NAME ?? 'encev_pulse_dev',
    user:process.env.DB_USER ?? 'encev_dev',
    password:process.env.POSTGRES_PASSWORD,
    connectionTimeoutMillis:3000,
    application_name:'encev-pulse-chat-tests',
  });
  const suffix=randomBytes(5).toString('hex');
  const usernames=[`ca${suffix}`,`cb${suffix}`,`cc${suffix}`,`cd${suffix}`];
  const userIds:string[]=[];
  const conversationIds:string[]=[];
  const messageIds:string[]=[];
  const callIds:string[]=[];
  const taskIds:string[]=[];
  const eventStreams:SseEventReader[]=[];
  let aliceEvents:SseEventReader;
  let bobEvents:SseEventReader;
  let daveEvents:SseEventReader;
  let app:Awaited<ReturnType<typeof NestFactory.create>>|null=null;

  async function api(base:string,client:Client,path:string,method='GET',body?:unknown) {
    const response=await fetch(`${base}/api/${path}`,{
      method,
      headers:{
        Origin:ORIGIN,Cookie:client.cookie,
        ...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':client.csrf}),
      },
      ...(body===undefined?{}:{body:JSON.stringify(body)}),
    });
    const data=response.status===204?null:await response.json();
    return {response,data};
  }

  async function apiMultipart(base:string,client:Client,path:string,form:FormData,method='POST') {
    const response=await fetch(`${base}/api/${path}`,{
      method,
      headers:{Origin:ORIGIN,Cookie:client.cookie,'X-CSRF-Token':client.csrf},
      body:form,
    });
    const data=response.status===204?null:await response.json();
    return {response,data};
  }

  async function signIn(base:string,username:string):Promise<Client> {
    const challenge=await fetch(`${base}/api/auth/csrf`,{
      method:'POST',headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:'{}',
    });
    const challengeBody=await challenge.json() as {csrfToken:string};
    const response=await fetch(`${base}/api/auth/login`,{
      method:'POST',
      headers:{Origin:ORIGIN,'Content-Type':'application/json','X-CSRF-Token':challengeBody.csrfToken},
      body:JSON.stringify({identifier:username,password:PASSWORD}),
    });
    const result=await response.json() as {csrfToken:string};
    assert.equal(response.status,200);
    return {cookie:response.headers.get('set-cookie')!.split(';',1)[0],csrf:result.csrfToken};
  }

  try {
    const employee=await pool.query<{id:string}>("SELECT id FROM roles WHERE code='employee'");
    assert.ok(employee.rowCount,'0001 authentication migration must be applied');
    const hasher=new PasswordHasher();
    const hash=await hasher.hash(PASSWORD);
    for(let index=0;index<usernames.length;index++){
      const user=await pool.query<{id:string}>(
        `INSERT INTO users(username,email,display_name,job_title,department,avatar_key,password_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [usernames[index],`${usernames[index]}@encev.com.tr`,['Chat Owner','Chat Admin','Chat Member','Chat Observer'][index],
          ['Proje yöneticisi','Biyolog','ÇED uzmanı','Gözlemci'][index],['Projeler','Flora-Fauna','ÇED','Gözlem'][index],
          ['fox','panda','otter','deer'][index],hash],
      );
      userIds.push(user.rows[0].id);
      await pool.query(
        `INSERT INTO user_role_assignments(user_id,role_id,assigned_by) VALUES($1,$2,$1)`,
        [userIds[index],employee.rows[0].id],
      );
    }

    app=await NestFactory.create(ApplicationModule,{logger:['error']});
    app.setGlobalPrefix('api');
    await app.listen(0,'127.0.0.1');
    const base=`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    const [alice,bob,carol,dave]=await Promise.all(usernames.map(name=>signIn(base,name)));

    await t.test('çalışan rehberi gerçek meslek, birim ve avatar bilgilerini verir',async()=>{
      const result=await api(base,alice,'auth/people');
      assert.equal(result.response.status,200);
      const person=result.data.people.find((item:{id:string})=>item.id===userIds[1]);
      assert.equal(person.jobTitle,'Biyolog');
      assert.equal(person.department,'Flora-Fauna');
      assert.equal(person.avatarKey,'panda');
      assert.ok(Array.isArray(person.roles));
    });

    let groupId='';
    await t.test('grup oluşturma, üye ekleme ve üye rolü denetimli güncellenir',async()=>{
      const created=await api(base,alice,'chat/conversations','POST',{
        type:'group',title:'Chat fixture group',memberIds:[userIds[1]],
      });
      assert.equal(created.response.status,201,JSON.stringify(created.data));
      groupId=created.data.conversation.id;
      conversationIds.push(groupId);
      assert.equal(created.data.myRole,'owner');
      assert.equal(created.data.members.length,2);

      [aliceEvents,daveEvents]=await Promise.all([
        openChatEvents(base,alice),openChatEvents(base,dave),
      ]);
      eventStreams.push(aliceEvents,daveEvents);
      assert.equal((await aliceEvents.next())?.event,'ready');
      assert.equal((await daveEvents.next())?.event,'ready');
      const unauthenticated=await fetch(base+'/api/chat/events',{headers:{Origin:ORIGIN,Accept:'text/event-stream'}});
      assert.equal(unauthenticated.status,401);

      const outsider=await api(base,dave,`chat/conversations/${groupId}`);
      assert.equal(outsider.response.status,404);

      const added=await api(base,alice,`chat/conversations/${groupId}/members`,'POST',{userIds:[userIds[2]]});
      assert.equal(added.response.status,200);
      assert.equal(added.data.members.length,3);
      const membershipPush=await aliceEvents.next(5000);
      assert.ok(membershipPush);
      assert.equal(membershipPush.event,'conversation.updated');
      assert.equal(JSON.parse(membershipPush.data).eventType,'membership.changed');
      assert.equal(await daveEvents.next(250),null,'non-members must not receive conversation events');

      const roleChanged=await api(base,alice,`chat/conversations/${groupId}/members/${userIds[1]}/role`,'PATCH',{role:'admin'});
      assert.equal(roleChanged.response.status,200);
      const bobDetails=await api(base,bob,`chat/conversations/${groupId}`);
      assert.equal(bobDetails.data.myRole,'admin');

      const forbiddenRoleChange=await api(base,bob,`chat/conversations/${groupId}/members/${userIds[2]}/role`,'PATCH',{role:'admin'});
      assert.equal(forbiddenRoleChange.response.status,403);

      const memberEvents=await pool.query(
        `SELECT event_type,next_role FROM conversation_member_events WHERE conversation_id=$1 ORDER BY created_at,id`,[groupId],
      );
      assert.ok(memberEvents.rows.some(row=>row.event_type==='role_changed'&&row.next_role==='admin'));
      const rolePush=await aliceEvents.next(5000);
      assert.ok(rolePush);
      assert.equal(JSON.parse(rolePush.data).eventType,'membership.changed');
      assert.equal(await daveEvents.next(250),null);
    });

    let firstMessageId='';
    let replyMessageId='';
    await t.test('mesaj, yanıt, düzenleme, tepki, sabitleme, okundu ve arama',async()=>{
      bobEvents=await openChatEvents(base,bob);
      eventStreams.push(bobEvents);
      assert.equal((await bobEvents.next())?.event,'ready');
      const firstRequestId=randomUUID();
      const sent=await api(base,alice,`chat/conversations/${groupId}/messages`,'POST',{
        body:'Flora saha planı için toplantı yapalım.',clientRequestId:firstRequestId,
      });
      assert.equal(sent.response.status,201,JSON.stringify(sent.data));
      firstMessageId=sent.data.message.id;messageIds.push(firstMessageId);
      const messagePush=await bobEvents.next(5000);
      assert.ok(messagePush,'committed messages must notify active conversation members');
      assert.equal(messagePush.event,'conversation.updated');
      assert.equal(JSON.parse(messagePush.data).eventType,'message.changed');

      const retried=await api(base,alice,`chat/conversations/${groupId}/messages`,'POST',{
        body:'Flora saha planı için toplantı yapalım.',clientRequestId:firstRequestId,
      });
      assert.equal(retried.response.status,201);
      assert.equal(retried.data.message.id,firstMessageId);
      const conflictingRetry=await api(base,alice,`chat/conversations/${groupId}/messages`,'POST',{
        body:'Farklı içerik',clientRequestId:firstRequestId,
      });
      assert.equal(conflictingRetry.response.status,409);
      assert.equal(conflictingRetry.data.code,'MESSAGE_IDEMPOTENCY_CONFLICT');

      const reply=await api(base,bob,`chat/conversations/${groupId}/messages`,'POST',{
        body:'Perşembe günü uygunum.',replyToId:firstMessageId,clientRequestId:randomUUID(),
      });
      assert.equal(reply.response.status,201);
      replyMessageId=reply.data.message.id;messageIds.push(replyMessageId);

      const pngFixture=Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x00,0x01]);
      const uploadRequestId=randomUUID();
      const buildImageForm=()=>{
        const form=new FormData();
        form.append('caption','Flora saha fotoğrafı');
        form.append('replyToId',firstMessageId);
        form.append('clientRequestId',uploadRequestId);
        form.append('files',new Blob([new Uint8Array(pngFixture)],{type:'image/png'}),'flora-saha.png');
        return form;
      };
      const uploaded=await apiMultipart(base,alice,`chat/conversations/${groupId}/attachments`,buildImageForm());
      assert.equal(uploaded.response.status,201,JSON.stringify(uploaded.data));
      const attachmentMessageId=uploaded.data.message.id as string;
      messageIds.push(attachmentMessageId);
      assert.equal(uploaded.data.message.attachments.length,1);
      assert.equal(uploaded.data.message.attachments[0].originalName,'flora-saha.png');

      const repeatedUpload=await apiMultipart(base,alice,`chat/conversations/${groupId}/attachments`,buildImageForm());
      assert.equal(repeatedUpload.response.status,201,JSON.stringify(repeatedUpload.data));
      assert.equal(repeatedUpload.data.message.id,attachmentMessageId,'Aynı idempotency anahtarı ikinci mesaj veya ek oluşturmamalı.');

      const uploadedList=await api(base,alice,`chat/conversations/${groupId}/messages`);
      const uploadedMessage=uploadedList.data.messages.find((message:{id:string})=>message.id===attachmentMessageId);
      assert.ok(uploadedMessage);
      assert.equal(uploadedMessage.attachments.length,1);
      assert.equal(uploadedMessage.body,'Flora saha fotoğrafı');

      const attachmentUrl=`${base}/api/chat/attachments/${uploadedMessage.attachments[0].id}/content`;
      const downloaded=await fetch(attachmentUrl,{headers:{Origin:ORIGIN,Cookie:alice.cookie}});
      assert.equal(downloaded.status,200);
      assert.equal(downloaded.headers.get('content-type'),'image/png');
      assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),pngFixture);

      const forbiddenDownload=await fetch(attachmentUrl,{headers:{Origin:ORIGIN,Cookie:dave.cookie}});
      assert.equal(forbiddenDownload.status,404,'Sohbet üyesi olmayan kullanıcı eki görememeli.');

      const forgedForm=new FormData();
      forgedForm.append('caption','Sahte görsel');
      forgedForm.append('clientRequestId',randomUUID());
      forgedForm.append('files',new Blob(['<script>alert(1)</script>'],{type:'image/png'}),'sahte.png');
      const forgedUpload=await apiMultipart(base,alice,`chat/conversations/${groupId}/attachments`,forgedForm);
      assert.equal(forgedUpload.response.status,400,'MIME bildirimi uzantı ve dosya imzası kontrolünü atlamamalı.');

      const forbiddenDelete=await api(base,bob,`chat/messages/${attachmentMessageId}`,'DELETE',{version:1});
      assert.equal(forbiddenDelete.response.status,403,'Başka kullanıcının ekli mesajı silinememeli.');
      const removeAttachmentMessage=await api(base,alice,`chat/messages/${attachmentMessageId}`,'DELETE',{version:1});
      assert.equal(removeAttachmentMessage.response.status,204);
      const removedContent=await fetch(attachmentUrl,{headers:{Origin:ORIGIN,Cookie:alice.cookie}});
      assert.equal(removedContent.status,404,'Silinen mesajın ek içeriği sunulmamalı.');

      const pdfFixture=Buffer.from('%PDF-1.7\\nchat attachment fixture\\n%%EOF');
      const pdfForm=new FormData();
      pdfForm.append('caption','Toplantı tutanağı');
      pdfForm.append('clientRequestId',randomUUID());
      pdfForm.append('files',new Blob([new Uint8Array(pdfFixture)],{type:'application/pdf'}),'toplanti.pdf');
      const pdfUpload=await apiMultipart(base,alice,`chat/conversations/${groupId}/attachments`,pdfForm);
      assert.equal(pdfUpload.response.status,201,JSON.stringify(pdfUpload.data));
      const pdfMessageId=pdfUpload.data.message.id as string;
      messageIds.push(pdfMessageId);
      const pdfAttachmentId=pdfUpload.data.message.attachments[0].id as string;
      const blockedInlinePdf=await fetch(`${base}/api/chat/attachments/${pdfAttachmentId}/content`,{headers:{Origin:ORIGIN,Cookie:alice.cookie}});
      assert.equal(blockedInlinePdf.status,404,'PDF eki inline içerik uç noktasından sunulmamalı.');
      const forcedPdfDownload=await fetch(`${base}/api/chat/attachments/${pdfAttachmentId}/download`,{headers:{Origin:ORIGIN,Cookie:alice.cookie}});
      assert.equal(forcedPdfDownload.status,200);
      assert.equal(forcedPdfDownload.headers.get('content-type'),'application/octet-stream');
      assert.match(forcedPdfDownload.headers.get('content-disposition')??'',/attachment/);
      assert.deepEqual(Buffer.from(await forcedPdfDownload.arrayBuffer()),pdfFixture);
      const pdfDeleted=await api(base,alice,`chat/messages/${pdfMessageId}`,'DELETE',{version:1});
      assert.equal(pdfDeleted.response.status,204);

      const noEditPermission=await api(base,bob,`chat/messages/${firstMessageId}`,'PATCH',{
        body:'Başkasının mesajını düzenleme',version:1,
      });
      assert.equal(noEditPermission.response.status,403);

      const edited=await api(base,alice,`chat/messages/${firstMessageId}`,'PATCH',{
        body:'Flora saha planı için perşembe toplantısı yapalım.',version:1,
      });
      assert.equal(edited.response.status,200);
      assert.equal(edited.data.message.version,2);
      const stale=await api(base,alice,`chat/messages/${firstMessageId}`,'PATCH',{
        body:'Eski sürüm',version:1,
      });
      assert.equal(stale.response.status,409);

      const reacted=await api(base,bob,`chat/messages/${firstMessageId}/reactions`,'POST',{reaction:'👍'});
      assert.equal(reacted.response.status,201);
      const unreacted=await api(base,bob,`chat/messages/${firstMessageId}/reactions`,'DELETE',{reaction:'👍'});
      assert.equal(unreacted.response.status,200);

      const pinned=await api(base,bob,`chat/messages/${firstMessageId}/pin`,'POST',{});
      assert.equal(pinned.response.status,201);
      const details=await api(base,alice,`chat/conversations/${groupId}`);
      assert.equal(details.data.pinned.length,1);
      const unpinned=await api(base,bob,`chat/messages/${firstMessageId}/unpin`,'POST',{});
      assert.equal(unpinned.response.status,201);

      const marked=await api(base,bob,`chat/conversations/${groupId}/read`,'POST',{messageId:replyMessageId});
      assert.equal(marked.response.status,200);
      const messages=await api(base,alice,`chat/conversations/${groupId}/messages`);
      const first=messages.data.messages.find((message:{id:string})=>message.id===firstMessageId);
      assert.ok(first.readBy.includes('Chat Admin'));

      const search=await api(base,carol,'chat/search?q=perşembe');
      assert.equal(search.response.status,200);
      assert.ok(search.data.results.some((item:{id:string})=>item.id===replyMessageId));

      const list=await api(base,bob,'chat/conversations');
      assert.equal(list.response.status,200);
      assert.equal(list.data.conversations.find((item:{id:string})=>item.id===groupId).unreadCount,0);

      const notificationFeed=await api(base,alice,'notifications');
      assert.equal(notificationFeed.response.status,200);
      const chatNotification=notificationFeed.data.notifications.find(
        (item:{eventType:string;conversationId:string|null})=>item.eventType==='chat.message'&&item.conversationId===groupId,
      );
      assert.ok(chatNotification,'new chat messages must appear in the shared notification feed');
      assert.equal(notificationFeed.data.unreadCount,1);
      const markedNotification=await api(base,alice,`notifications/${chatNotification.id}/read`,'POST',{});
      assert.equal(markedNotification.response.status,204);
      const notificationAfterRead=await api(base,alice,'notifications');
      const readItem=notificationAfterRead.data.notifications.find((item:{id:string})=>item.id===chatNotification.id);
      assert.ok(readItem.readAt);
      assert.equal(notificationAfterRead.data.unreadCount,0);
    });

    await t.test('mesajdan görev üretimi tekil ve mesaj bağlantılıdır; mesaj silme tombstone bırakır',async()=>{
      const created=await api(base,bob,`chat/messages/${firstMessageId}/create-task`,'POST',{});
      assert.equal(created.response.status,201,JSON.stringify(created.data));
      taskIds.push(created.data.task.id);
      assert.equal(created.data.task.title,'Flora saha planı için perşembe toplantısı yapalım.');
      const duplicate=await api(base,bob,`chat/messages/${firstMessageId}/create-task`,'POST',{});
      assert.equal(duplicate.response.status,201);
      assert.equal(duplicate.data.alreadyLinked,true);

      const linkedMessages=await api(base,alice,`chat/conversations/${groupId}/messages`);
      assert.equal(linkedMessages.data.messages.find((item:{id:string})=>item.id===firstMessageId).linkedTaskId,created.data.task.id);

      const deleted=await api(base,bob,`chat/messages/${replyMessageId}`,'DELETE',{version:1});
      assert.equal(deleted.response.status,204);
      const after=await api(base,alice,`chat/conversations/${groupId}/messages`);
      const tombstone=after.data.messages.find((item:{id:string})=>item.id===replyMessageId);
      assert.ok(tombstone.deletedAt);
      assert.equal(tombstone.body,'');
    });

    await t.test('doğrudan sohbet açılır ve grup üyeliği kaldırılır',async()=>{
      const direct=await api(base,alice,'chat/conversations','POST',{type:'direct',userId:userIds[2]});
      assert.equal(direct.response.status,201);
      const directId=direct.data.conversation.id;
      conversationIds.push(directId);
      assert.equal(direct.data.conversation.type,'direct');

      const iceConfig=await api(base,alice,'chat/call-configuration');
      assert.equal(iceConfig.response.status,200);
      assert.ok(Array.isArray(iceConfig.data.iceServers));
      assert.equal(typeof iceConfig.data.relayConfigured,'boolean');

      const groupCall=await api(base,alice,`chat/conversations/${groupId}/calls`,'POST',{mediaType:'audio'});
      assert.equal(groupCall.response.status,400,'Grup araması ilk sürümde desteklenmediği için açıkça reddedilmeli.');

      const callCreated=await api(base,alice,`chat/conversations/${directId}/calls`,'POST',{mediaType:'audio'});
      assert.equal(callCreated.response.status,201,JSON.stringify(callCreated.data));
      const callId=callCreated.data.call.id as string;
      callIds.push(callId);
      assert.equal(callCreated.data.call.status,'ringing');
      assert.equal(callCreated.data.call.mediaType,'audio');

      const callerActive=await api(base,alice,'chat/calls/active');
      const calleeActive=await api(base,carol,'chat/calls/active');
      assert.equal(callerActive.data.call.id,callId);
      assert.equal(calleeActive.data.call.id,callId);

      const busyCall=await api(base,carol,`chat/conversations/${directId}/calls`,'POST',{mediaType:'video'});
      assert.equal(busyCall.response.status,409,'Etkin çağrısı olan katılımcıya ikinci çağrı başlatılamamalı.');

      const offer=await api(base,alice,`chat/calls/${callId}/signals`,'POST',{
        signalType:'offer',payload:{type:'offer',sdp:'v=0\\r\\no=- 1 1 IN IP4 127.0.0.1\\r\\ns=ENCEV test offer\\r\\nt=0 0'},
      });
      assert.equal(offer.response.status,201,JSON.stringify(offer.data));
      const duplicateOffer=await api(base,alice,`chat/calls/${callId}/signals`,'POST',{
        signalType:'offer',payload:{type:'offer',sdp:'v=0\\r\\ns=duplicate offer\\r\\nt=0 0'},
      });
      assert.equal(duplicateOffer.response.status,409,'Bir çağrıda ikinci SDP teklifi kabul edilmemeli.');
      const remoteOffer=await api(base,carol,`chat/calls/${callId}/signals?afterId=0`);
      assert.equal(remoteOffer.response.status,200);
      assert.equal(remoteOffer.data.signals.length,1);
      assert.equal(remoteOffer.data.signals[0].signalType,'offer');

      const outsiderSignals=await api(base,bob,`chat/calls/${callId}/signals?afterId=0`);
      assert.equal(outsiderSignals.response.status,404,'Sohbet dışındaki kullanıcı çağrı sinyallerini okuyamamalı.');
      const callerCannotAccept=await api(base,alice,`chat/calls/${callId}/accept`,'POST',{});
      assert.equal(callerCannotAccept.response.status,409,'Çağrıyı yalnızca aranan katılımcı kabul edebilir.');

      const acceptedCall=await api(base,carol,`chat/calls/${callId}/accept`,'POST',{});
      assert.equal(acceptedCall.response.status,201,JSON.stringify(acceptedCall.data));
      assert.equal(acceptedCall.data.call.status,'accepted');
      const aliceHeartbeat=await api(base,alice,`chat/calls/${callId}/heartbeat`,'POST',{});
      assert.equal(aliceHeartbeat.response.status,201,JSON.stringify(aliceHeartbeat.data));
      const carolHeartbeat=await api(base,carol,`chat/calls/${callId}/heartbeat`,'POST',{});
      assert.equal(carolHeartbeat.response.status,201,JSON.stringify(carolHeartbeat.data));
      const outsiderHeartbeat=await api(base,bob,`chat/calls/${callId}/heartbeat`,'POST',{});
      assert.equal(outsiderHeartbeat.response.status,409,'Sohbet dışındaki kullanıcı arama heartbeat kaydını yenileyememeli.');
      const answer=await api(base,carol,`chat/calls/${callId}/signals`,'POST',{
        signalType:'answer',payload:{type:'answer',sdp:'v=0\\r\\no=- 2 2 IN IP4 127.0.0.1\\r\\ns=ENCEV test answer\\r\\nt=0 0'},
      });
      assert.equal(answer.response.status,201,JSON.stringify(answer.data));
      const remoteAnswer=await api(base,alice,`chat/calls/${callId}/signals?afterId=${offer.data.signal.id}`);
      assert.equal(remoteAnswer.data.signals[0].signalType,'answer');
      const ice=await api(base,alice,`chat/calls/${callId}/signals`,'POST',{
        signalType:'ice_candidate',payload:{candidate:'candidate:1 1 UDP 2122260223 192.0.2.10 5000 typ host',sdpMid:'0',sdpMLineIndex:0},
      });
      assert.equal(ice.response.status,201,JSON.stringify(ice.data));
      const endedCall=await api(base,alice,`chat/calls/${callId}/end`,'POST',{});
      assert.equal(endedCall.response.status,201,JSON.stringify(endedCall.data));
      const closedSignals=await api(base,carol,`chat/calls/${callId}/signals?afterId=0`);
      assert.equal(closedSignals.response.status,200);
      assert.equal(closedSignals.data.signals.length,0,'Biten çağrının SDP/ICE sinyalleri artık istemciye sunulmamalı.');
      const endedHeartbeat=await api(base,alice,`chat/calls/${callId}/heartbeat`,'POST',{});
      assert.equal(endedHeartbeat.response.status,409,'Bitmiş çağrı heartbeat ile yeniden açılamamalı.');
      const noActiveAlice=await api(base,alice,'chat/calls/active');
      const noActiveCarol=await api(base,carol,'chat/calls/active');
      assert.equal(noActiveAlice.data.call,null);
      assert.equal(noActiveCarol.data.call,null);

      const rejectedCall=await api(base,alice,`chat/conversations/${directId}/calls`,'POST',{mediaType:'video'});
      assert.equal(rejectedCall.response.status,201,JSON.stringify(rejectedCall.data));
      callIds.push(rejectedCall.data.call.id);
      const declined=await api(base,carol,`chat/calls/${rejectedCall.data.call.id}/decline`,'POST',{});
      assert.equal(declined.response.status,201,JSON.stringify(declined.data));
      const noActiveAfterDecline=await api(base,alice,'chat/calls/active');
      assert.equal(noActiveAfterDecline.data.call,null);

      const leave=await api(base,carol,`chat/conversations/${directId}/members/${userIds[2]}`,'DELETE',{});
      assert.equal(leave.response.status,204);

      const removed=await api(base,alice,`chat/conversations/${groupId}/members/${userIds[2]}`,'DELETE',{});
      assert.equal(removed.response.status,204);
      const noLongerMember=await api(base,carol,`chat/conversations/${groupId}`);
      assert.equal(noLongerMember.response.status,404);

      const transfer=await api(base,alice,`chat/conversations/${groupId}/members/${userIds[1]}/role`,'PATCH',{role:'owner'});
      assert.equal(transfer.response.status,200);
      assert.equal(transfer.data.myRole,'admin');
      const newOwner=await api(base,bob,`chat/conversations/${groupId}`);
      assert.equal(newOwner.response.status,200);
      assert.equal(newOwner.data.myRole,'owner');

      const ownerLeave=await api(base,alice,`chat/conversations/${groupId}/members/${userIds[0]}`,'DELETE',{});
      assert.equal(ownerLeave.response.status,204);
      const formerOwner=await api(base,alice,`chat/conversations/${groupId}`);
      assert.equal(formerOwner.response.status,404);
      const remainingOwner=await api(base,bob,`chat/conversations/${groupId}`);
      assert.equal(remainingOwner.response.status,200);
      assert.equal(remainingOwner.data.myRole,'owner');
    });
  } finally {
    for(const stream of eventStreams)await stream.close();
    if(app) await app.close();
    const cleanup=await pool.connect();
    try {
      await cleanup.query('BEGIN');
      await cleanup.query('ALTER TABLE message_events DISABLE TRIGGER message_events_append_only');
      await cleanup.query('ALTER TABLE conversation_member_events DISABLE TRIGGER conversation_member_events_append_only');
      await cleanup.query('ALTER TABLE task_audit_events DISABLE TRIGGER task_audit_events_append_only');
      await cleanup.query('DELETE FROM chat_call_signals WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM chat_calls WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM chat_notifications WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM conversation_read_cursors WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM message_task_links WHERE message_id=ANY($1::uuid[])',[messageIds]);
      await cleanup.query('DELETE FROM chat_attachments WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM message_reactions WHERE message_id=ANY($1::uuid[])',[messageIds]);
      await cleanup.query('DELETE FROM message_events WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM conversation_member_events WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM messages WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM conversation_members WHERE conversation_id=ANY($1::uuid[])',[conversationIds]);
      await cleanup.query('DELETE FROM conversations WHERE id=ANY($1::uuid[])',[conversationIds]);
      if(taskIds.length){
        await cleanup.query('DELETE FROM task_audit_events WHERE task_id=ANY($1::uuid[])',[taskIds]);
        await cleanup.query('DELETE FROM tasks WHERE id=ANY($1::uuid[])',[taskIds]);
      }
      if(userIds.length){
        await cleanup.query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM user_role_assignments WHERE user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM auth_audit_events WHERE actor_user_id=ANY($1::uuid[]) OR target_user_id=ANY($1::uuid[])',[userIds]);
        await cleanup.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[userIds]);
      }
      await cleanup.query('ALTER TABLE task_audit_events ENABLE TRIGGER task_audit_events_append_only');
      await cleanup.query('ALTER TABLE conversation_member_events ENABLE TRIGGER conversation_member_events_append_only');
      await cleanup.query('ALTER TABLE message_events ENABLE TRIGGER message_events_append_only');
      await cleanup.query('COMMIT');
    } catch(error) {
      await cleanup.query('ROLLBACK');
      throw error;
    } finally { cleanup.release(); await pool.end(); }
  }
});
