import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { EmployeeAvatar } from './avatars';

type Request = (path:string,method?:string,data?:unknown)=>Promise<Record<string,any>>;
type Conversation = {
  id:string;type:'direct'|'group';title:string|null;displayName:string;avatarKey:string|null;lastMessage:string|null;
  lastMessageAt:string|null;lastSenderId:string|null;lastSenderName:string|null;unreadCount:number;
  memberCount:number;myRole:'owner'|'admin'|'member';
};
type ChatMember = {
  id:string;displayName:string;username:string;jobTitle:string;department:string;avatarKey:string;
  role:'owner'|'admin'|'member';joinedAt:string;
};
type Reaction = {code:string;count:number;reactedByMe:boolean};
type Message = {
  id:string;conversationId:string;senderId:string;senderName:string;senderAvatarKey:string;body:string;
  replyToId:string|null;replyBody:string|null;replySenderName:string|null;version:number;
  createdAt:string;editedAt:string|null;deletedAt:string|null;pinnedAt:string|null;
  isMine:boolean;reactions:Reaction[];readBy:string[];linkedTaskId:string|null;
};
type DirectoryPerson = {
  id:string;displayName:string;username:string;email?:string;jobTitle?:string;department?:string;avatarKey?:string;roles?:string[];
};
type ChatDetail = {conversation:{id:string;type:'direct'|'group';title:string|null};members:ChatMember[];myRole:string;pinned:Array<{id:string;body:string;senderName:string;createdAt:string}>};

const reactions=['👍','❤️','😂','🎉','👀','🙏','✅','🔥'];
const roleLabel=(role:string)=>({owner:'Sohbet sahibi',admin:'Yönetici',member:'Üye'}[role]??role);
const timeLabel=(value:string)=>new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const dateLabel=(value:string)=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(new Date(value));

export function ChatWorkspace({
  request,
  people,
  currentUserId,
  startUserId,
  initialConversationId,
  onStartConsumed,
  onTaskOpen,
}:{
  request:Request;
  people:DirectoryPerson[];
  currentUserId:string;
  startUserId?:string|null;
  initialConversationId?:string|null;
  onStartConsumed:()=>void;
  onTaskOpen:(taskId:string)=>void;
}) {
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [detail,setDetail]=useState<ChatDetail|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [hasMoreMessages,setHasMoreMessages]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const [loading,setLoading]=useState(true);
  const [messageLoading,setMessageLoading]=useState(false);
  const [error,setError]=useState('');
  const [draft,setDraft]=useState('');
  const [replyTo,setReplyTo]=useState<Message|null>(null);
  const [sending,setSending]=useState(false);
  const [sendState,setSendState]=useState<'idle'|'sent'|'failed'>('idle');
  const [editingId,setEditingId]=useState<string|null>(null);
  const [editingBody,setEditingBody]=useState('');
  const [sideTab,setSideTab]=useState<'members'|'pinned'>('members');
  const [showNewGroup,setShowNewGroup]=useState(false);
  const [groupName,setGroupName]=useState('');
  const [groupMembers,setGroupMembers]=useState<string[]>([]);
  const [showAddMembers,setShowAddMembers]=useState(false);
  const [addMemberIds,setAddMemberIds]=useState<string[]>([]);
  const [search,setSearch]=useState('');
  const [searchResults,setSearchResults]=useState<Array<Record<string,any>>>([]);
  const [searchOpen,setSearchOpen]=useState(false);
  const [searchTargetMessageId,setSearchTargetMessageId]=useState<string|null>(null);
  const [actionBusy,setActionBusy]=useState(false);
  const scrollRef=useRef<HTMLDivElement|null>(null);
  const pendingScrollRestore=useRef<{height:number;top:number}|null>(null);
  const initialLoadDone=useRef(false);
  const lastExternalTarget=useRef<string|null>(null);
  const selected=useMemo(()=>conversations.find(item=>item.id===selectedId)??null,[conversations,selectedId]);

  const loadConversations=useCallback(async()=>{
    const result=await request('chat/conversations');
    const list=(result.conversations??[]) as Conversation[];
    setConversations(list);
    return list;
  },[request]);

  const loadDetail=useCallback(async(id:string)=>{
    const result=await request('chat/conversations/'+id);
    setDetail(result as ChatDetail);
  },[request]);

  const loadMessages=useCallback(async(id:string,markRead=true,preserveHistory=false)=>{
    const result=await request('chat/conversations/'+id+'/messages');
    const list=(result.messages??[]) as Message[];
    setMessages(current=>{
      if(!preserveHistory||current.length===0)return list;
      const latestIds=new Set(list.map(item=>item.id));
      const older=current.filter(item=>!latestIds.has(item.id));
      return [...older,...list];
    });
    setHasMoreMessages(Boolean(result.page?.hasMore));
    if(markRead&&list.length) {
      const latest=list[list.length-1];
      await request('chat/conversations/'+id+'/read','POST',{messageId:latest.id});
      setConversations(items=>items.map(item=>item.id===id?{...item,unreadCount:0}:item));
    }
    return list;
  },[request,currentUserId]);

  const openConversation=useCallback(async(id:string)=>{
    setSelectedId(id);
    setError('');
    setDetail(null);
    setMessages([]);
    setMessageLoading(true);
    try {
      await Promise.all([loadDetail(id),loadMessages(id)]);
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Sohbet yüklenemedi.');
    } finally {
      setMessageLoading(false);
    }
  },[loadDetail,loadMessages]);

  useEffect(()=>{
    let cancelled=false;
    const externalTarget=startUserId?('user:'+startUserId):initialConversationId?('conversation:'+initialConversationId):null;
    if(externalTarget===null) {
      if(lastExternalTarget.current!==null) {
        lastExternalTarget.current=null;
        return;
      }
      if(initialLoadDone.current)return;
    } else if(lastExternalTarget.current===externalTarget) {
      return;
    }
    void (async()=>{
      setLoading(true);
      try {
        const list=await loadConversations();
        if(cancelled)return;
        if(startUserId) {
          const created=await request('chat/conversations','POST',{type:'direct',userId:startUserId});
          if(cancelled)return;
          const id=created.conversation?.id??created.id;
          await loadConversations();
          if(cancelled)return;
          await openConversation(id);
          if(cancelled)return;
          lastExternalTarget.current=externalTarget;
          onStartConsumed();
        } else if(initialConversationId) {
          await openConversation(initialConversationId);
          if(cancelled)return;
          lastExternalTarget.current=externalTarget;
          onStartConsumed();
        } else {
          if(list.length) {
            await openConversation(list[0].id);
            if(cancelled)return;
          }
          initialLoadDone.current=true;
        }
      } catch(cause) {
        if(!cancelled)setError(cause instanceof Error?cause.message:'Sohbet listesi alınamadı.');
      } finally {
        if(!cancelled)setLoading(false);
      }
    })();
    return ()=>{cancelled=true;};
  },[loadConversations,openConversation,request,startUserId,initialConversationId,onStartConsumed]);

  useEffect(()=>{
    if(!selectedId)return;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=='visible'||sending||actionBusy)return;
      void Promise.all([loadConversations(),loadMessages(selectedId,true,true)]).catch(()=>undefined);
    },2800);
    return ()=>window.clearInterval(timer);
  },[selectedId,loadConversations,loadMessages,sending,actionBusy]);

  useEffect(()=>{
    const element=scrollRef.current;
    if(!element)return;
    const restore=pendingScrollRestore.current;
    if(restore){
      element.scrollTop=restore.top+(element.scrollHeight-restore.height);
      pendingScrollRestore.current=null;
    }else{
      element.scrollTop=element.scrollHeight;
    }
  },[messages.length,selectedId]);

  useEffect(()=>{
    if(!searchTargetMessageId)return;
    const target=document.getElementById('message-'+searchTargetMessageId);
    if(target){
      target.scrollIntoView({behavior:'smooth',block:'center'});
      setSearchTargetMessageId(null);
    }
  },[messages,searchTargetMessageId]);

  async function loadOlderMessages() {
    if(!selectedId||!hasMoreMessages||loadingOlder||messages.length===0)return;
    const oldest=messages[0];
    const element=scrollRef.current;
    if(element)pendingScrollRestore.current={height:element.scrollHeight,top:element.scrollTop};
    setLoadingOlder(true);
    try{
      const path='chat/conversations/'+selectedId+'/messages?beforeCreatedAt='+encodeURIComponent(oldest.createdAt)+'&beforeId='+encodeURIComponent(oldest.id);
      const result=await request(path);
      const older=(result.messages??[]) as Message[];
      setMessages(current=>{
        const known=new Set(current.map(item=>item.id));
        return [...older.filter(item=>!known.has(item.id)),...current];
      });
      setHasMoreMessages(Boolean(result.page?.hasMore));
    }catch(cause){
      pendingScrollRestore.current=null;
      setError(cause instanceof Error?cause.message:'Eski mesajlar yüklenemedi.');
    }finally{setLoadingOlder(false);}
  }

  async function sendMessage(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value=draft.trim();
    if(!selectedId||!value||sending)return;
    setSending(true);setSendState('idle');setError('');
    const clientRequestId=crypto.randomUUID();
    const currentReply=replyTo?.id??null;
    setDraft('');setReplyTo(null);
    try {
      await request('chat/conversations/'+selectedId+'/messages','POST',{
        body:value,replyToId:currentReply,clientRequestId,
      });
      setSendState('sent');
      await Promise.all([loadMessages(selectedId),loadConversations()]);
    } catch(cause) {
      setDraft(value);
      setReplyTo(currentReply?messages.find(item=>item.id===currentReply)??null:null);
      setSendState('failed');
      setError(cause instanceof Error?cause.message:'Mesaj gönderilemedi. Metin korunmuştur.');
    } finally {setSending(false);}
  }

  async function openSearchResult(result:Record<string,any>) {
    if(typeof result.conversationId!=='string'||typeof result.id!=='string')return;
    const conversationId=result.conversationId as string;
    const targetId=result.id as string;
    setSelectedId(conversationId);
    setError('');
    setSearchOpen(false);
    setDetail(null);
    setMessages([]);
    setMessageLoading(true);
    setSearchTargetMessageId(null);
    try {
      const [detailResult,firstPage]=await Promise.all([
        request('chat/conversations/'+conversationId),
        request('chat/conversations/'+conversationId+'/messages'),
      ]);
      let collected=(firstPage.messages??[]) as Message[];
      let page=firstPage.page;
      let pageCount=0;
      while(page?.hasMore&&!collected.some(message=>message.id===targetId)&&pageCount<100) {
        const cursor=page.nextCursor as {createdAt:string;id:string}|null;
        if(!cursor)break;
        const next=await request(
          'chat/conversations/'+conversationId+'/messages?beforeCreatedAt='+
          encodeURIComponent(cursor.createdAt)+'&beforeId='+encodeURIComponent(cursor.id),
        );
        const older=(next.messages??[]) as Message[];
        collected=[...older,...collected];
        page=next.page;
        pageCount+=1;
      }
      setDetail(detailResult as ChatDetail);
      setMessages(collected);
      setHasMoreMessages(Boolean(page?.hasMore));
      const found=collected.some(message=>message.id===targetId);
      if(found) {
        setSearchTargetMessageId(targetId);
        const latest=collected[collected.length-1];
        if(latest) {
          await request('chat/conversations/'+conversationId+'/read','POST',{messageId:latest.id});
          setConversations(items=>items.map(item=>item.id===conversationId?{...item,unreadCount:0}:item));
        }
        await loadConversations();
      } else {
        setError('Aranan mesaj bulundu ancak son 5.000 mesaj içinde yüklenemedi. Aramayı daraltıp yeniden deneyin.');
      }
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'Arama sonucundaki mesaj açılamadı.');
    } finally {setMessageLoading(false);}
  }

  async function startDirect(person:DirectoryPerson) {
    setActionBusy(true);setError('');
    try {
      const result=await request('chat/conversations','POST',{type:'direct',userId:person.id});
      await loadConversations();
      await openConversation(result.conversation?.id??result.id);
      onStartConsumed();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Sohbet başlatılamadı.');}
    finally {setActionBusy(false);}
  }

  async function createGroup(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!groupName.trim()||groupMembers.length===0)return;
    setActionBusy(true);setError('');
    try {
      const result=await request('chat/conversations','POST',{type:'group',title:groupName.trim(),memberIds:groupMembers});
      await loadConversations();
      setShowNewGroup(false);setGroupName('');setGroupMembers([]);
      await openConversation(result.conversation?.id??result.id);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Grup oluşturulamadı.');}
    finally {setActionBusy(false);}
  }

  async function toggleReaction(message:Message,code:string) {
    if(actionBusy)return;
    setActionBusy(true);
    try {
      const current=message.reactions.find(item=>item.code===code)?.reactedByMe;
      await request('chat/messages/'+message.id+'/reactions',current?'DELETE':'POST',{reaction:code});
      if(selectedId)await loadMessages(selectedId,false,true);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Tepki kaydedilemedi.');}
    finally {setActionBusy(false);}
  }

  async function editMessage(message:Message) {
    if(!editingBody.trim())return;
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id,'PATCH',{body:editingBody,version:message.version});
      setEditingId(null);setEditingBody('');
      if(selectedId)await loadMessages(selectedId,false);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj düzenlenemedi.');}
    finally {setActionBusy(false);}
  }

  async function deleteMessage(message:Message) {
    if(!window.confirm('Bu mesajı silmek istiyor musunuz? Mesaj metni temizlenecek.'))return;
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id,'DELETE',{version:message.version});
      if(selectedId)await Promise.all([loadMessages(selectedId,false,true),loadConversations()]);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj silinemedi.');}
    finally {setActionBusy(false);}
  }

  async function togglePin(message:Message) {
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id+(message.pinnedAt?'/unpin':'/pin'),'POST',{});
      if(selectedId)await Promise.all([loadDetail(selectedId),loadMessages(selectedId,false,true)]);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj sabitlenemedi.');}
    finally {setActionBusy(false);}
  }

  async function createTaskFromMessage(message:Message) {
    setActionBusy(true);
    try {
      const result=await request('chat/messages/'+message.id+'/create-task','POST',{});
      onTaskOpen(result.task.id);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesajdan görev oluşturulamadı.');}
    finally {setActionBusy(false);}
  }

  async function searchMessages(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(search.trim().length<2)return;
    setActionBusy(true);
    try {
      const result=await request('chat/search?q='+encodeURIComponent(search.trim()));
      setSearchResults(result.results??[]);setSearchOpen(true);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj araması yapılamadı.');}
    finally {setActionBusy(false);}
  }

  async function addMembers() {
    if(!selectedId||addMemberIds.length===0)return;
    setActionBusy(true);
    try {
      const result=await request('chat/conversations/'+selectedId+'/members','POST',{userIds:addMemberIds});
      setDetail(result as ChatDetail);setShowAddMembers(false);setAddMemberIds([]);
      await loadConversations();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Üyeler eklenemedi.');}
    finally {setActionBusy(false);}
  }

  async function updateMemberRole(member:ChatMember,role:'admin'|'member') {
    if(!selectedId)return;
    setActionBusy(true);
    try {
      const result=await request('chat/conversations/'+selectedId+'/members/'+member.id+'/role','PATCH',{role});
      setDetail(result as ChatDetail);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Üye rolü değiştirilemedi.');}
    finally {setActionBusy(false);}
  }

  async function removeMember(member:ChatMember) {
    if(!selectedId||!window.confirm(member.displayName+' kişisini bu sohbetten çıkarmak istiyor musunuz?'))return;
    setActionBusy(true);
    try {
      await request('chat/conversations/'+selectedId+'/members/'+member.id,'DELETE',{});
      if(member.id===currentUserId){setDetail(null);setSelectedId(null);setMessages([]);}
      else await loadDetail(selectedId);
      await loadConversations();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Sohbet üyeliği değiştirilemedi.');}
    finally {setActionBusy(false);}
  }

  const activePeople=people.filter(person=>person.id!==currentUserId);
  const canManage=detail?.myRole==='owner'||detail?.myRole==='admin';

  return (
    <section className="chat-workspace" aria-label="Şirket içi sohbet">
      <aside className="chat-rail">
        <div className="chat-rail-heading">
          <div><span className="eyebrow">EKİP İLETİŞİMİ</span><h2>Sohbetler</h2></div>
          <button type="button" className="chat-icon-button" onClick={()=>setShowNewGroup(true)} title="Grup oluştur" aria-label="Grup oluştur">＋</button>
        </div>
        <form className="chat-search-form" onSubmit={searchMessages}>
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Mesajlarda ara…" aria-label="Mesajlarda ara"/>
          <button type="submit" disabled={actionBusy||search.trim().length<2}>Ara</button>
        </form>
        {searchOpen&&(
          <div className="chat-search-results">
            <div className="chat-search-results-head"><strong>Arama sonuçları</strong><button type="button" onClick={()=>setSearchOpen(false)}>Kapat</button></div>
            {searchResults.length===0?<p>Eşleşen mesaj yok.</p>:searchResults.map((item,index)=>(
              <button type="button" key={item.id??index} onClick={()=>void openSearchResult(item)}>
                <strong>{item.conversationName}</strong><span>{item.senderName} · {timeLabel(item.createdAt)}</span><p>{item.body}</p>
              </button>
            ))}
          </div>
        )}
        <div className="chat-conversation-list">
          {loading?Array.from({length:6},(_,i)=><div className="chat-conversation-skeleton" key={i}><i/><span/><b/></div>):conversations.length===0?(
            <div className="chat-list-empty"><strong>Henüz sohbet yok</strong><span>Çalışan rehberinden bir kişi seçerek konuşma başlatın veya grup oluşturun.</span></div>
          ):conversations.map(conversation=>(
            <button type="button" key={conversation.id} className={'chat-conversation-item'+(selectedId===conversation.id?' selected':'')} onClick={()=>void openConversation(conversation.id)}>
              {conversation.type==='group'
                ? <span className="chat-conversation-avatar">✦</span>
                : <EmployeeAvatar avatarKey={conversation.avatarKey} name={conversation.displayName} size="md"/>}
              <span className="chat-conversation-copy"><strong>{conversation.displayName||'Sohbet'}</strong><span>{conversation.lastSenderName?conversation.lastSenderName+': ':''}{conversation.lastMessage??'Henüz mesaj yok'}</span></span>
              <span className="chat-conversation-meta">{conversation.lastMessageAt&&<time>{timeLabel(conversation.lastMessageAt)}</time>}{conversation.unreadCount>0&&<b>{conversation.unreadCount>99?'99+':conversation.unreadCount}</b>}</span>
            </button>
          ))}
        </div>
        <div className="chat-rail-bottom"><span>{conversations.length} konuşma</span><span>Mesajlar yaklaşık 3 saniyede yenilenir</span></div>
      </aside>

      <main className="chat-thread">
        {selected&&detail?(
          <>
            <header className="chat-thread-header">
              <div className="chat-thread-title">
                {selected.type==='group'
                  ? <span className="chat-thread-avatar">✦</span>
                  : <EmployeeAvatar
                      avatarKey={detail.members.find(member=>member.id!==currentUserId)?.avatarKey}
                      name={selected.displayName}
                      size="md"
                    />}
                <div><h2>{selected.displayName}</h2><span>{selected.type==='group'?detail.members.length+' üye':detail.members[0]?.jobTitle||detail.members[0]?.department||'Bire bir sohbet'}</span></div>
              </div>
              <div className="chat-thread-actions"><span className="chat-live-indicator"><i/> Otomatik yenileme</span><button type="button" className="chat-icon-button" onClick={()=>setSideTab('members')} title="Sohbet ayrıntıları" aria-label="Sohbet ayrıntıları">ⓘ</button></div>
            </header>
            {detail.pinned.length>0&&(
              <div className="chat-pinned-strip"><span>⌁ Sabit</span><strong>{detail.pinned[0].body}</strong><small>{detail.pinned[0].senderName}</small></div>
            )}
            <div className="chat-message-scroll" ref={scrollRef}>
              {!messageLoading&&hasMoreMessages&&(
                <div className="chat-load-older">
                  <button type="button" onClick={()=>void loadOlderMessages()} disabled={loadingOlder}>
                    {loadingOlder?'Eski mesajlar yükleniyor…':'Daha eski mesajları yükle'}
                  </button>
                </div>
              )}
              {messageLoading?(
                <div className="chat-message-skeleton" role="status" aria-busy="true">
                  {[0,1,2,3].map(i=><div className={'chat-message-ghost ghost-'+i} key={i}><i/><span/><span/></div>)}
                </div>
              ):messages.length===0?(
                <div className="chat-first-message"><span>✧</span><strong>Bu sohbet yeni başladı</strong><p>İlk mesajı göndererek konuşmayı başlatın.</p></div>
              ):(
                <div className="chat-message-list">
                  {messages.map((message,index)=>{
                    const previous=messages[index-1];
                    const showDate=!previous||new Date(previous.createdAt).toDateString()!==new Date(message.createdAt).toDateString();
                    return (
                      <div className="chat-message-group" key={message.id}>
                        {showDate&&<div className="chat-date-divider"><span>{dateLabel(message.createdAt)}</span></div>}
                        <article id={'message-'+message.id} className={'chat-message'+(message.isMine?' own':'')}>
                          {!message.isMine&&<EmployeeAvatar avatarKey={message.senderAvatarKey} name={message.senderName} size="sm"/>}
                          <div className="chat-message-content">
                            <div className="chat-message-meta">
                              <strong>{message.isMine?'Siz':message.senderName}</strong><time>{timeLabel(message.createdAt)}</time>
                              {message.editedAt&&!message.deletedAt&&<span>Düzenlendi</span>}
                              {message.pinnedAt&&<span className="chat-pinned-indicator">⌁ Sabit</span>}
                            </div>
                            {message.replyToId&&<div className="chat-reply-preview"><strong>{message.replySenderName??'Yanıtlanan mesaj'}</strong><span>{message.replyBody??'Bu mesaj silindi.'}</span></div>}
                            {editingId===message.id?(
                              <div className="chat-edit-box"><textarea value={editingBody} onChange={event=>setEditingBody(event.target.value)} maxLength={4000}/><div><button type="button" onClick={()=>{setEditingId(null);setEditingBody('');}}>Vazgeç</button><button type="button" disabled={actionBusy||!editingBody.trim()} onClick={()=>void editMessage(message)}>Kaydet</button></div></div>
                            ):(
                              <p className={message.deletedAt?'chat-message-deleted':''}>{message.deletedAt?'Bu mesaj silindi.':message.body}</p>
                            )}
                            {!message.deletedAt&&(
                              <>
                                <div className="chat-message-tools">
                                  <button type="button" onClick={()=>setReplyTo(message)} title="Yanıtla">↶ Yanıtla</button>
                                  <button type="button" onClick={()=>void createTaskFromMessage(message)} title="Mesajdan görev oluştur">＋ Görev</button>
                                  {(!message.isMine||detail.myRole==='owner'||detail.myRole==='admin')&&<button type="button" onClick={()=>void togglePin(message)}>{message.pinnedAt?'Sabitlemeyi kaldır':'Sabitle'}</button>}
                                  {message.isMine&&<button type="button" onClick={()=>{setEditingId(message.id);setEditingBody(message.body);}}>Düzenle</button>}
                                  {message.isMine&&<button type="button" onClick={()=>void deleteMessage(message)}>Sil</button>}
                                </div>
                                <div className="chat-reactions">
                                  {message.reactions.map(item=><button type="button" key={item.code} className={item.reactedByMe?'reacted':''} onClick={()=>void toggleReaction(message,item.code)}>{item.code} {item.count}</button>)}
                                  <div className="chat-reaction-picker">{reactions.map(code=><button type="button" key={code} onClick={()=>void toggleReaction(message,code)} aria-label={code}>{code}</button>)}</div>
                                </div>
                              </>
                            )}
                            <div className="chat-message-footer">
                              {message.linkedTaskId&&<span>✓ Göreve bağlı</span>}
                              {message.isMine&&message.readBy.length>0&&<span title={message.readBy.join(', ')}>Okundu · {message.readBy.length}</span>}
                            </div>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>
              {replyTo&&<div className="chat-replying"><span><strong>{replyTo.senderName}</strong> mesajına yanıt veriliyor</span><p>{replyTo.body.slice(0,120)}</p><button type="button" onClick={()=>setReplyTo(null)} aria-label="Yanıtı iptal et">×</button></div>}
              <textarea value={draft} onChange={event=>setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={replyTo?'Yanıtınızı yazın…':'Mesajınızı yazın…'} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
              <div className="chat-composer-bottom"><span>{sendState==='sent'?'Mesaj gönderildi':sendState==='failed'?'Gönderim başarısız · Metin korundu':'Enter ile gönder · Shift + Enter ile satır ekle'}</span><span>{draft.length}/4000</span><button type="submit" disabled={sending||!draft.trim()}>{sending?'Gönderiliyor…':'Gönder'} <b>↗</b></button></div>
            </form>
          </>
        ):(
          <div className="chat-no-selection"><span>✧</span><strong>Bir sohbet seçin</strong><p>Sol taraftan konuşma seçin veya çalışan rehberinden yeni bir sohbet başlatın.</p></div>
        )}
      </main>

      <aside className="chat-context">
        <div className="chat-context-tabs"><button type="button" className={sideTab==='members'?'active':''} onClick={()=>setSideTab('members')}>Üyeler</button><button type="button" className={sideTab==='pinned'?'active':''} onClick={()=>setSideTab('pinned')}>Sabitlenenler</button></div>
        {!selected||!detail?<div className="chat-context-empty">Sohbet ayrıntıları seçildiğinde burada görünür.</div>:sideTab==='members'?(
          <>
            <div className="chat-context-heading"><strong>{detail.members.length} üye</strong>{selected.type==='group'&&canManage&&<button type="button" onClick={()=>setShowAddMembers(value=>!value)}>Üye ekle ＋</button>}</div>
            <div className="chat-member-list">
              {detail.members.map(member=>(
                <div className="chat-member-row" key={member.id}>
                  <EmployeeAvatar avatarKey={member.avatarKey} name={member.displayName} size="md"/>
                  <div><strong>{member.displayName}</strong><span>{member.jobTitle||member.department||member.username}</span><small>{roleLabel(member.role)}</small></div>
                  {selected.type==='group'&&detail.myRole==='owner'&&member.id!==currentUserId&&member.role!=='owner'&&(
                    <select className="chat-member-role-select" value={member.role} onChange={event=>void updateMemberRole(member,event.target.value as 'admin'|'member')} disabled={actionBusy} aria-label={member.displayName+' rolü'}>
                      <option value="member">Üye</option><option value="admin">Yönetici</option>
                    </select>
                  )}
                  {selected.type==='group'&&member.id!==currentUserId&&canManage&&member.role!=='owner'&&<button type="button" title="Üyeyi çıkar" onClick={()=>void removeMember(member)}>×</button>}
                </div>
              ))}
            </div>
            {showAddMembers&&(
              <div className="chat-add-members">
                {activePeople.filter(person=>!detail.members.some(member=>member.id===person.id)).map(person=>(
                  <label key={person.id}><input type="checkbox" checked={addMemberIds.includes(person.id)} onChange={event=>setAddMemberIds(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/><EmployeeAvatar avatarKey={person.avatarKey} name={person.displayName} size="sm"/><span>{person.displayName}</span></label>
                ))}
                <button type="button" disabled={actionBusy||addMemberIds.length===0} onClick={()=>void addMembers()}>Seçilenleri ekle</button>
              </div>
            )}
            <div className="chat-role-note"><strong>Senin rolün</strong><span>{roleLabel(detail.myRole)}</span><p>Grup sahibi ve yöneticileri üye ekleyebilir, sabitleme yapabilir ve üyeleri yönetebilir.</p></div>
          </>
        ):(
          <div className="chat-pinned-list">
            {detail.pinned.length===0?<p>Henüz sabitlenmiş mesaj yok.</p>:detail.pinned.map(item=><button type="button" key={item.id} onClick={()=>{const target=document.getElementById('message-'+item.id);target?.scrollIntoView({behavior:'smooth',block:'center'});}}><strong>{item.senderName}</strong><span>{item.body}</span><time>{dateLabel(item.createdAt)}</time></button>)}
          </div>
        )}
        <div className="chat-context-footer"><span>Dosya ekleri bu sürümde güvenlik ve saklama politikası netleşene kadar kapalıdır.</span></div>
      </aside>

      {error&&<div className="chat-error" role="alert">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}

      {showNewGroup&&(
        <div className="chat-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setShowNewGroup(false);}}>
          <form className="chat-group-modal" onSubmit={createGroup}>
            <div><span className="eyebrow">YENİ KONUŞMA</span><h2>Grup sohbeti oluştur</h2><p>Bir ad verin ve ilk üyeleri seçin.</p></div>
            <label className="chat-modal-field"><span>Grup adı</span><input value={groupName} onChange={event=>setGroupName(event.target.value)} maxLength={100} required placeholder="Örn. Flora ve Fauna Ekibi"/></label>
            <div className="chat-modal-members"><strong>Üyeler ({groupMembers.length})</strong>{activePeople.map(person=><label key={person.id}><input type="checkbox" checked={groupMembers.includes(person.id)} onChange={event=>setGroupMembers(ids=>event.target.checked?[...ids,person.id]:ids.filter(id=>id!==person.id))}/><EmployeeAvatar avatarKey={person.avatarKey} name={person.displayName} size="sm"/><span>{person.displayName}</span><small>{person.department||'Birim belirtilmedi'}</small></label>)}</div>
            <div className="chat-modal-footer"><button type="button" className="secondary-button" onClick={()=>setShowNewGroup(false)}>Vazgeç</button><button type="submit" className="primary-button" disabled={actionBusy||!groupName.trim()||groupMembers.length===0}>Grubu oluştur</button></div>
          </form>
        </div>
      )}
    </section>
  );
}
