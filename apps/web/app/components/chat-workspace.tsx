import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
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
type ChatAttachment = {id:string;originalName:string;mimeType:string;byteSize:number;createdAt:string};
type Message = {
  id:string;conversationId:string;senderId:string;senderName:string;senderAvatarKey:string;body:string;
  replyToId:string|null;replyBody:string|null;replySenderName:string|null;version:number;
  createdAt:string;editedAt:string|null;deletedAt:string|null;pinnedAt:string|null;
  isMine:boolean;reactions:Reaction[];readBy:string[];linkedTaskId:string|null;attachments:ChatAttachment[];
};
type DirectoryPerson = {
  id:string;displayName:string;username:string;email?:string;jobTitle?:string;department?:string;avatarKey?:string;roles?:string[];
};
type ChatDetail = {conversation:{id:string;type:'direct'|'group';title:string|null};members:ChatMember[];myRole:string;pinned:Array<{id:string;body:string;senderName:string;createdAt:string}>};
type ActiveCall = {
  id:string;conversationId:string;callerUserId:string;calleeUserId:string;mediaType:'audio'|'video';
  status:'ringing'|'accepted';createdAt:string;acceptedAt:string|null;expiresAt:string;peerName:string;
  peerAvatarKey:string|null;isCaller:boolean;
};
type CallSignal = {id:string;senderUserId:string;signalType:'offer'|'answer'|'ice_candidate';payload:Record<string,any>};


const reactions=['👍','❤️','😂','🎉','👀','🙏','✅','🔥'];
const roleLabel=(role:string)=>({owner:'Sohbet sahibi',admin:'Yönetici',member:'Üye'}[role]??role);
const timeLabel=(value:string)=>new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const dateLabel=(value:string)=>new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'short'}).format(new Date(value));
const fileSizeLabel=(bytes:number)=>{
  if(bytes<1024)return bytes+' B';
  if(bytes<1024*1024)return (bytes/1024).toFixed(0)+' KB';
  return (bytes/(1024*1024)).toFixed(1)+' MB';
};

export function ChatWorkspace({
  request,
  people,
  currentUserId,
  projects,
  canCreate,
  canUpdate,
  canDelete,
  canCreateTask,
  canViewTasks,
  isActive,
  startUserId,
  initialConversationId,
  onStartConsumed,
  onTaskOpen,
}:{
  request:Request;
  people:DirectoryPerson[];
  currentUserId:string;
  projects:Array<{id:string;name:string;status:string}>;
  canCreate:boolean;
  canUpdate:boolean;
  canDelete:boolean;
  canCreateTask:boolean;
  canViewTasks:boolean;
  isActive:boolean;
  startUserId?:string|null;
  initialConversationId?:string|null;
  onStartConsumed:()=>void;
  onTaskOpen:(taskId:string)=>void;
}) {
  const [conversations,setConversations]=useState<Conversation[]>([]);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [mobileThreadOpen,setMobileThreadOpen]=useState(false);
  const [mobileContextOpen,setMobileContextOpen]=useState(false);
  const [detail,setDetail]=useState<ChatDetail|null>(null);
  const [messages,setMessages]=useState<Message[]>([]);
  const [hasMoreMessages,setHasMoreMessages]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const [realtimeConnected,setRealtimeConnected]=useState(false);
  const [loading,setLoading]=useState(true);
  const [messageLoading,setMessageLoading]=useState(false);
  const [error,setError]=useState('');
  const [draft,setDraft]=useState('');
  const [pendingFiles,setPendingFiles]=useState<File[]>([]);
  const [recording,setRecording]=useState(false);
  const [recordingError,setRecordingError]=useState('');
  const [activeCall,setActiveCall]=useState<ActiveCall|null>(null);
  const [callError,setCallError]=useState('');
  const [callBusy,setCallBusy]=useState(false);
  const [callPeerReady,setCallPeerReady]=useState(0);
  const [localStream,setLocalStream]=useState<MediaStream|null>(null);
  const [remoteStream,setRemoteStream]=useState<MediaStream|null>(null);
  const [microphoneEnabled,setMicrophoneEnabled]=useState(true);
  const [cameraEnabled,setCameraEnabled]=useState(true);
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
  const [taskDraftMessage,setTaskDraftMessage]=useState<Message|null>(null);
  const [taskDraftTitle,setTaskDraftTitle]=useState('');
  const [taskDraftAssigneeId,setTaskDraftAssigneeId]=useState(currentUserId);
  const [taskDraftProjectId,setTaskDraftProjectId]=useState('');
  const scrollRef=useRef<HTMLDivElement|null>(null);
  const attachmentInputRef=useRef<HTMLInputElement|null>(null);
  const selectedConversationIdRef=useRef<string|null>(selectedId);
  const composerDraftsRef=useRef(new Map<string,{draft:string;pendingFiles:File[];replyTo:Message|null}>());
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recordingStreamRef=useRef<MediaStream|null>(null);
  const recordingChunksRef=useRef<Blob[]>([]);
  const recordingTimeoutRef=useRef<number|null>(null);
  const peerConnectionRef=useRef<RTCPeerConnection|null>(null);
  const localStreamRef=useRef<MediaStream|null>(null);
  const remoteAudioRef=useRef<HTMLAudioElement|null>(null);
  const remoteVideoRef=useRef<HTMLVideoElement|null>(null);
  const localVideoRef=useRef<HTMLVideoElement|null>(null);
  const lastCallSignalIdRef=useRef('0');
  const pendingIceCandidatesRef=useRef<RTCIceCandidateInit[]>([]);
  const processingCallSignalsRef=useRef(false);
  const callSetupRef=useRef(false);
  const callPollTimerRef=useRef<number|null>(null);
  const pendingScrollRestore=useRef<{height:number;top:number}|null>(null);
  const initialLoadDone=useRef(false);
  const lastExternalTarget=useRef<string|null>(null);
  const messageHistoryLoaded=useRef(false);
  const selected=useMemo(()=>conversations.find(item=>item.id===selectedId)??null,[conversations,selectedId]);
  const [conversationFilter,setConversationFilter]=useState<'all'|'direct'|'group'|'unread'>('all');
  const visibleConversations=useMemo(()=>conversations.filter(item=>{
    if(conversationFilter==='direct')return item.type==='direct';
    if(conversationFilter==='group')return item.type==='group';
    if(conversationFilter==='unread')return item.unreadCount>0;
    return true;
  }),[conversations,conversationFilter]);

  function switchConversation(id:string|null) {
    const previousId=selectedConversationIdRef.current;
    if(previousId===id) {
      setSelectedId(id);
      return;
    }
    if(previousId)composerDraftsRef.current.set(previousId,{draft,pendingFiles,replyTo});
    selectedConversationIdRef.current=id;
    const nextDraft=id?composerDraftsRef.current.get(id):undefined;
    if(id)composerDraftsRef.current.delete(id);
    setSelectedId(id);
    setDraft(nextDraft?.draft??'');
    setPendingFiles(nextDraft?.pendingFiles??[]);
    setReplyTo(nextDraft?.replyTo??null);
    setSendState('idle');
    setEditingId(null);
    setEditingBody('');
    setSearchTargetMessageId(null);
    setHasMoreMessages(false);
    setLoadingOlder(false);
    setDetail(null);
    setMessages([]);
    setMessageLoading(false);
    pendingScrollRestore.current=null;
    messageHistoryLoaded.current=false;
    setError('');
  }

  const loadConversations=useCallback(async()=>{
    const result=await request('chat/conversations');
    const list=(result.conversations??[]) as Conversation[];
    setConversations(list);
    return list;
  },[request]);

  const loadDetail=useCallback(async(id:string)=>{
    const result=await request('chat/conversations/'+id);
    if(selectedConversationIdRef.current!==id)return;
    setDetail(result as ChatDetail);
  },[request]);

  const loadMessages=useCallback(async(id:string,markRead=true,preserveHistory=false)=>{
    const result=await request('chat/conversations/'+id+'/messages');
    if(selectedConversationIdRef.current!==id)return [];
    const list=(result.messages??[]) as Message[];
    const hadHistory=preserveHistory&&messageHistoryLoaded.current;
    setMessages(current=>{
      if(!hadHistory||current.length===0)return list;
      const latestIds=new Set(list.map(item=>item.id));
      const older=current.filter(item=>!latestIds.has(item.id));
      return [...older,...list];
    });
    setHasMoreMessages(current => hadHistory
      ? current && Boolean(result.page?.hasMore)
      : Boolean(result.page?.hasMore));
    messageHistoryLoaded.current=true;
    if(markRead&&canUpdate&&list.length) {
      const latest=list[list.length-1];
      await request('chat/conversations/'+id+'/read','POST',{messageId:latest.id});
      setConversations(items=>items.map(item=>item.id===id?{...item,unreadCount:0}:item));
    }
    return list;
  },[request,canUpdate]);

  const openConversation=useCallback(async(id:string)=>{
    switchConversation(id);
    setMobileThreadOpen(true);
    setMessageLoading(true);
    try {
      await Promise.all([loadDetail(id),loadMessages(id)]);
    } catch(cause) {
      if(selectedConversationIdRef.current===id)setError(cause instanceof Error?cause.message:'Sohbet yüklenemedi.');
    } finally {
      if(selectedConversationIdRef.current===id)setMessageLoading(false);
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
    let disposed=false;
    let refreshing=false;
    let refreshAgain=false;
    let fallbackTimer:number|null=null;

    const refresh=async()=>{
      if(disposed||document.visibilityState!=='visible')return;
      if(refreshing){refreshAgain=true;return;}
      refreshing=true;
      try{
        do{
          refreshAgain=false;
          await loadConversations();
          const activeId=selectedId;
          if(activeId){
            await Promise.all([
              loadDetail(activeId),
              loadMessages(activeId,true,true),
            ]);
          }
        }while(refreshAgain&&!disposed);
      }catch{
        // REST remains authoritative; bounded fallback retries transient failures.
      }finally{refreshing=false;}
    };

    const startFallback=()=>{
      setRealtimeConnected(false);
      if(fallbackTimer===null)fallbackTimer=window.setInterval(()=>void refresh(),15000);
    };
    const stopFallback=()=>{
      if(fallbackTimer!==null)window.clearInterval(fallbackTimer);
      fallbackTimer=null;
      setRealtimeConnected(true);
    };

    const source=new EventSource('/api/chat/events');
    source.onerror=()=>startFallback();

    const connectionState=(event:Event)=>{
      try{
        const state=JSON.parse((event as MessageEvent<string>).data) as {realtime?:boolean};
        if(state.realtime===true){
          stopFallback();
          void refresh();
        }else startFallback();
      }catch{startFallback();}
    };

    const conversationUpdated=(event:Event)=>{
      let update:{conversationId?:string;eventType?:string;accessRevoked?:boolean};
      try{update=JSON.parse((event as MessageEvent<string>).data) as typeof update;}
      catch{return;}
      if(update.eventType==='call.changed')void refreshActiveCall();
      if(update.conversationId===selectedId&&update.accessRevoked===true){
        const revokedId=selectedConversationIdRef.current;
        switchConversation(null);
        if(revokedId)composerDraftsRef.current.delete(revokedId);
        setError('Bu sohbetten çıkarıldınız; erişiminiz kaldırıldı.');
        void loadConversations().catch(()=>undefined);
        return;
      }
      void (async()=>{
        await loadConversations();
        if(update.conversationId!==selectedId)return;
        await loadDetail(selectedId);
        await loadMessages(selectedId,update.eventType!=='read.changed',true);
      })().catch(()=>undefined);
    };

    const onVisibilityChange=()=>{
      if(document.visibilityState==='visible')void refresh();
    };

    source.addEventListener('ready',connectionState);
    source.addEventListener('heartbeat',connectionState);
    source.addEventListener('conversation.updated',conversationUpdated);
    document.addEventListener('visibilitychange',onVisibilityChange);

    return ()=>{
      disposed=true;
      source.close();
      if(fallbackTimer!==null)window.clearInterval(fallbackTimer);
      document.removeEventListener('visibilitychange',onVisibilityChange);
      setRealtimeConnected(false);
    };
  },[selectedId,loadConversations,loadDetail,loadMessages]);

  useEffect(()=>()=> {
    const recorder=recorderRef.current;
    if(recorder&&recorder.state!=='inactive'){
      recorder.onstop=null;
      recorder.stop();
    }
    recordingStreamRef.current?.getTracks().forEach(track=>track.stop());
    if(recordingTimeoutRef.current!==null)window.clearTimeout(recordingTimeoutRef.current);
  },[]);

  useEffect(()=>{
    selectedConversationIdRef.current=selectedId;
    setRecordingError('');
    if(recorderRef.current&&recorderRef.current.state!=='inactive'){
      recorderRef.current.onstop=null;
      recorderRef.current.stop();
    }
    recordingStreamRef.current?.getTracks().forEach(track=>track.stop());
    recordingStreamRef.current=null;
    recorderRef.current=null;
    if(recordingTimeoutRef.current!==null)window.clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current=null;
    setRecording(false);
  },[selectedId]);

  useEffect(()=>{
    const refresh=()=>{void refreshActiveCall();};
    refresh();
    const timer=window.setInterval(refresh,isActive?2500:10000);
    return ()=>window.clearInterval(timer);
  },[isActive]);

  useEffect(()=>{
    if(remoteStream&&remoteAudioRef.current)remoteAudioRef.current.srcObject=remoteStream;
    if(remoteStream&&remoteVideoRef.current)remoteVideoRef.current.srcObject=remoteStream;
    if(localStream&&localVideoRef.current)localVideoRef.current.srcObject=localStream;
  },[remoteStream,localStream]);

  useEffect(()=>{
    if(!activeCall||activeCall.status!=='accepted')return;
    const timer=window.setInterval(()=>{
      void request('chat/calls/'+activeCall.id+'/heartbeat','POST',{}).catch(()=>undefined);
    },20000);
    return ()=>window.clearInterval(timer);
  },[activeCall?.id,activeCall?.status,request]);

  useEffect(()=>{
    if(!activeCall||!peerConnectionRef.current||callSetupRef.current)return;
    const timer=window.setInterval(()=>void processCallSignals(activeCall.id),1200);
    callPollTimerRef.current=timer;
    return ()=>{
      window.clearInterval(timer);
      if(callPollTimerRef.current===timer)callPollTimerRef.current=null;
    };
  },[activeCall?.id,activeCall?.status,callPeerReady]);

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
    const conversationId=selectedId;
    const oldest=messages[0];
    const element=scrollRef.current;
    if(element)pendingScrollRestore.current={height:element.scrollHeight,top:element.scrollTop};
    setLoadingOlder(true);
    try{
      const path='chat/conversations/'+conversationId+'/messages?beforeCreatedAt='+encodeURIComponent(oldest.createdAt)+'&beforeId='+encodeURIComponent(oldest.id);
      const result=await request(path);
      if(selectedConversationIdRef.current!==conversationId)return;
      const older=(result.messages??[]) as Message[];
      setMessages(current=>{
        const known=new Set(current.map(item=>item.id));
        return [...older.filter(item=>!known.has(item.id)),...current];
      });
      setHasMoreMessages(Boolean(result.page?.hasMore));
    }catch(cause){
      pendingScrollRestore.current=null;
      if(selectedConversationIdRef.current===conversationId)setError(cause instanceof Error?cause.message:'Eski mesajlar yüklenemedi.');
    }finally{
      if(selectedConversationIdRef.current===conversationId)setLoadingOlder(false);
    }
  }

  async function refreshActiveCall(){
    try{
      const result=await request('chat/calls/active');
      const next=(result.call??null) as ActiveCall|null;
      const previous=activeCallIdRef.current;
      if(!next&&previous){
        closeLocalCall();
        setCallError('Arama sona erdi veya bağlantı zaman aşımına uğradı.');
      }
      activeCallIdRef.current=next?.id??null;
      setActiveCall(next);
    }catch{
      // A transient call-state lookup must not tear down an active peer connection.
    }
  }

  function closeLocalCall(){
    if(callPollTimerRef.current!==null)window.clearInterval(callPollTimerRef.current);
    callPollTimerRef.current=null;
    const peer=peerConnectionRef.current;
    peerConnectionRef.current=null;
    activeCallIdRef.current=null;
    callSetupRef.current=false;
    if(peer){peer.onicecandidate=null;peer.ontrack=null;peer.onconnectionstatechange=null;peer.close();}
    localStreamRef.current?.getTracks().forEach(track=>track.stop());
    localStreamRef.current=null;
    pendingIceCandidatesRef.current=[];
    lastCallSignalIdRef.current='0';
    setLocalStream(null);
    setRemoteStream(null);
    setMicrophoneEnabled(true);
    setCameraEnabled(true);
    processingCallSignalsRef.current=false;
    setCallPeerReady(value=>value+1);
  }

  async function getCallMedia(mediaType:'audio'|'video'){
    if(!navigator.mediaDevices?.getUserMedia){
      throw new Error('Mikrofon/kamera için HTTPS veya localhost güvenli bağlamı gerekir.');
    }
    const configuration=await request('chat/call-configuration');
    const stream=await navigator.mediaDevices.getUserMedia({
      audio:true,
      video:mediaType==='video'?{width:{ideal:1280},height:{ideal:720},facingMode:'user'}:false,
    });
    localStreamRef.current=stream;
    setLocalStream(stream);
    setMicrophoneEnabled(stream.getAudioTracks().some(track=>track.enabled));
    setCameraEnabled(stream.getVideoTracks().some(track=>track.enabled));
    const peer=new RTCPeerConnection({iceServers:(configuration.iceServers??[]) as RTCIceServer[]});
    peerConnectionRef.current=peer;
    for(const track of stream.getTracks())peer.addTrack(track,stream);
    peer.ontrack=event=>{
      const incoming=event.streams[0];
      if(incoming)setRemoteStream(incoming);
    };
    const callId=activeCallIdRef.current;
    peer.onicecandidate=event=>{
      if(!event.candidate||!callId)return;
      const candidate=event.candidate.toJSON();
      void request('chat/calls/'+callId+'/signals','POST',{
        signalType:'ice_candidate',payload:candidate,
      }).catch(()=>setCallError('Ağ bağlantı adayı gönderilemedi.'));
    };
    peer.onconnectionstatechange=()=>{
      if(peer.connectionState==='failed'){
        setCallError('Bu ağlar arasında bağlantı kurulamadı. Şirket ağ yöneticisiyle ağ erişim kısıtlarını kontrol edin.');
      }else if(peer.connectionState==='disconnected'){
        setCallError('Bağlantı kesildi; yeniden bağlanması bekleniyor.');
      }else if(peer.connectionState==='connected'){
        setCallError('');
      }
    };
    lastCallSignalIdRef.current='0';
    pendingIceCandidatesRef.current=[];
    setCallPeerReady(value=>value+1);
    return peer;
  }

  const activeCallIdRef=useRef<string|null>(null);
  useEffect(()=>{activeCallIdRef.current=activeCall?.id??null;},[activeCall?.id]);
  useEffect(()=>()=> {
    const callId=activeCallIdRef.current;
    if(callId)void request('chat/calls/'+callId+'/end','POST',{}).catch(()=>undefined);
    if(callPollTimerRef.current!==null)window.clearInterval(callPollTimerRef.current);
    peerConnectionRef.current?.close();
    peerConnectionRef.current=null;
    localStreamRef.current?.getTracks().forEach(track=>track.stop());
    localStreamRef.current=null;
  },[request]);

  async function sendCallSignal(callId:string,signalType:'offer'|'answer'|'ice_candidate',payload:Record<string,unknown>){
    await request('chat/calls/'+callId+'/signals','POST',{signalType,payload});
  }

  async function flushIceCandidates(peer:RTCPeerConnection){
    if(!peer.remoteDescription)return;
    const queued=pendingIceCandidatesRef.current.splice(0);
    for(const candidate of queued)await peer.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async function processCallSignals(callId:string){
    const peer=peerConnectionRef.current;
    if(!peer||callSetupRef.current||processingCallSignalsRef.current)return;
    processingCallSignalsRef.current=true;
    try{
      const result=await request('chat/calls/'+callId+'/signals?afterId='+encodeURIComponent(lastCallSignalIdRef.current));
      const signals=(result.signals??[]) as CallSignal[];
      for(const signal of signals){
        if(signal.signalType==='answer'&&peer.signalingState==='have-local-offer'&&!peer.remoteDescription){
          await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          await flushIceCandidates(peer);
        }else if(signal.signalType==='offer'&&!peer.remoteDescription){
          await peer.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          await flushIceCandidates(peer);
        }else if(signal.signalType==='ice_candidate'){
          const candidate=signal.payload as RTCIceCandidateInit;
          if(peer.remoteDescription)await peer.addIceCandidate(new RTCIceCandidate(candidate));
          else pendingIceCandidatesRef.current.push(candidate);
        }
        lastCallSignalIdRef.current=signal.id;
      }
    }catch(cause){
      setCallError(cause instanceof Error?cause.message:'Arama sinyalleşmesi alınamadı.');
    }finally{processingCallSignalsRef.current=false;}
  }

  async function startCall(mediaType:'audio'|'video'){
    if(!selectedId||selected?.type!=='direct'||!canCreate||activeCall||callBusy)return;
    setCallBusy(true);setCallError('');
    try{
      const created=await request('chat/conversations/'+selectedId+'/calls','POST',{mediaType});
      const call={...created.call,peerName:selected.displayName,peerAvatarKey:selected.avatarKey,isCaller:true} as ActiveCall;
      activeCallIdRef.current=call.id;
      setActiveCall(call);
      try{
        const peer=await getCallMedia(mediaType);
        const offer=await peer.createOffer();
        await peer.setLocalDescription(offer);
        await sendCallSignal(call.id,'offer',{type:offer.type,sdp:offer.sdp??''});
      }catch(mediaError){
        await request('chat/calls/'+call.id+'/end','POST',{}).catch(()=>undefined);
        closeLocalCall();activeCallIdRef.current=null;setActiveCall(null);
        throw mediaError;
      }
    }catch(cause){
      setCallError(cause instanceof Error?cause.message:'Arama başlatılamadı.');
    }finally{setCallBusy(false);}
  }

  async function acceptCall(){
    if(!activeCall||activeCall.isCaller||activeCall.status!=='ringing'||callBusy)return;
    setCallBusy(true);setCallError('');
    callSetupRef.current=true;
    const callId=activeCall.id;
    activeCallIdRef.current=callId;
    try{
      await request('chat/calls/'+callId+'/accept','POST',{});
      const peer=await getCallMedia(activeCall.mediaType);
      const offerResult=await request('chat/calls/'+callId+'/signals?afterId=0');
      const signals=(offerResult.signals??[]) as CallSignal[];
      const offer=signals.find(signal=>signal.signalType==='offer');
      if(!offer)throw new Error('Arama teklifi henüz ulaşmadı. Tekrar deneyin.');
      await peer.setRemoteDescription(new RTCSessionDescription(offer.payload as RTCSessionDescriptionInit));
      for(const signal of signals){
        if(signal.signalType==='ice_candidate')await peer.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
        lastCallSignalIdRef.current=signal.id;
      }
      const answer=await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendCallSignal(callId,'answer',{type:answer.type,sdp:answer.sdp??''});
      setActiveCall(current=>current?{...current,status:'accepted'}:current);
      switchConversation(activeCall.conversationId);
      setMobileThreadOpen(true);
      await Promise.all([loadDetail(activeCall.conversationId),loadMessages(activeCall.conversationId,true,true)]);
    }catch(cause){
      setCallError(cause instanceof Error?cause.message:'Arama kabul edilemedi.');
      if(activeCall)await request('chat/calls/'+activeCall.id+'/end','POST',{}).catch(()=>undefined);
      closeLocalCall();setActiveCall(null);
    }finally{
      callSetupRef.current=false;
      setCallPeerReady(value=>value+1);
      setCallBusy(false);
    }
  }

  async function declineCall(){
    if(!activeCall||activeCall.isCaller||callBusy)return;
    setCallBusy(true);
    try{await request('chat/calls/'+activeCall.id+'/decline','POST',{});setActiveCall(null);closeLocalCall();}
    catch(cause){setCallError(cause instanceof Error?cause.message:'Arama reddedilemedi.');}
    finally{setCallBusy(false);}
  }

  async function endCall(){
    if(!activeCall||callBusy)return;
    setCallBusy(true);
    try{await request('chat/calls/'+activeCall.id+'/end','POST',{});setActiveCall(null);closeLocalCall();}
    catch(cause){setCallError(cause instanceof Error?cause.message:'Arama bitirilemedi.');}
    finally{setCallBusy(false);}
  }

  function toggleMicrophone(){
    const enabled=!(localStreamRef.current?.getAudioTracks().every(track=>track.enabled)??false);
    localStreamRef.current?.getAudioTracks().forEach(track=>track.enabled=enabled);
    setMicrophoneEnabled(enabled);
  }

  function toggleCamera(){
    const enabled=!(localStreamRef.current?.getVideoTracks().every(track=>track.enabled)??false);
    localStreamRef.current?.getVideoTracks().forEach(track=>track.enabled=enabled);
    setCameraEnabled(enabled);
  }

  async function uploadAttachments(files:File[],caption:string,targetConversationId=selectedId,replyMessageId=replyTo?.id??null) {
    if(!canCreate||!targetConversationId||files.length===0||sending)return;
    const replySnapshot=replyTo?.id===replyMessageId?replyTo:null;
    if(files.length>5){setError('Bir mesajda en fazla 5 dosya gönderebilirsiniz.');return;}
    if(files.some(file=>file.size<1||file.size>12*1024*1024)||files.reduce((total,file)=>total+file.size,0)>24*1024*1024){
      setError('Her dosya en fazla 12 MB, bir mesajdaki toplam ekler en fazla 24 MB olabilir.');
      return;
    }
    const form=new FormData();
    form.append('caption',caption);
    if(replyMessageId)form.append('replyToId',replyMessageId);
    form.append('clientRequestId',crypto.randomUUID());
    for(const file of files)form.append('files',file,file.name);
    setSending(true);setSendState('idle');setError('');
    try{
      await request('chat/conversations/'+targetConversationId+'/attachments','POST',form);
      if(selectedConversationIdRef.current===targetConversationId){
        setSendState('sent');
        setDraft(current=>current.trim()===caption?'':current);
        setPendingFiles([]);
        setReplyTo(null);
        await Promise.all([loadMessages(targetConversationId,true,true),loadConversations()]);
      }else{
        composerDraftsRef.current.delete(targetConversationId);
        await loadConversations();
      }
    }catch(cause){
      if(selectedConversationIdRef.current===targetConversationId){
        setSendState('failed');
        setError(cause instanceof Error?cause.message:'Dosya gönderilemedi. Seçtiğiniz dosyalar korunmuştur.');
      }else{
        const saved=composerDraftsRef.current.get(targetConversationId)??{draft:'',pendingFiles:[],replyTo:null};
        composerDraftsRef.current.set(targetConversationId,{
          draft:saved.draft||caption,
          pendingFiles:saved.pendingFiles.length?saved.pendingFiles:files,
          replyTo:saved.replyTo??replySnapshot,
        });
      }
    }finally{setSending(false);}
  }

  async function sendMessage(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value=draft.trim();
    if(!canCreate||!selectedId||sending||recording)return;
    if(pendingFiles.length){
      await uploadAttachments([...pendingFiles],value,selectedId,replyTo?.id??null);
      return;
    }
    if(!value)return;
    const targetConversationId=selectedId;
    setSending(true);setSendState('idle');setError('');
    const clientRequestId=crypto.randomUUID();
    const currentReply=replyTo?.id??null;
    const replySnapshot=currentReply?messages.find(item=>item.id===currentReply)??null:null;
    setDraft('');setReplyTo(null);

    // A committed POST is the send result. A later list refresh must never turn
    // a saved message into a visible "send failed" state or restore its draft.
    let posted:Record<string,any>;
    try {
      posted=await request('chat/conversations/'+targetConversationId+'/messages','POST',{
        body:value,replyToId:currentReply,clientRequestId,
      });
    } catch(cause) {
      const reason=cause instanceof Error?cause.message:'Mesaj gönderilemedi. Metin korunmuştur.';
      if(selectedConversationIdRef.current===targetConversationId){
        setDraft(current=>current||value);
        setReplyTo(current=>current??replySnapshot);
        setSendState('failed');
        setError(reason);
      }else{
        const saved=composerDraftsRef.current.get(targetConversationId)??{draft:'',pendingFiles:[],replyTo:null};
        composerDraftsRef.current.set(targetConversationId,{
          ...saved,
          draft:saved.draft||value,
          replyTo:saved.replyTo??replySnapshot,
        });
      }
      setSending(false);
      return;
    }

    if(selectedConversationIdRef.current===targetConversationId){
      setSendState('sent');
      const savedMessage=posted?.message;
      if(typeof savedMessage?.id==='string'){
        const me=people.find(person=>person.id===currentUserId);
        const optimistic:Message={
          id:savedMessage.id,
          conversationId:targetConversationId,
          senderId:currentUserId,
          senderName:me?.displayName??'Siz',
          senderAvatarKey:me?.avatarKey??'',
          body:value,
          replyToId:currentReply,
          replyBody:replySnapshot?.body??null,
          replySenderName:replySnapshot?.senderName??null,
          version:Number(savedMessage.version)||1,
          createdAt:typeof savedMessage.createdAt==='string'?savedMessage.createdAt:new Date().toISOString(),
          editedAt:null,
          deletedAt:null,
          pinnedAt:null,
          isMine:true,
          reactions:[],
          readBy:[],
          linkedTaskId:null,
          attachments:[],
        };
        setMessages(current=>current.some(item=>item.id===optimistic.id)?current:[...current,optimistic]);
      }
      try {
        await loadMessages(targetConversationId,true,true);
      } catch {
        setError('Mesaj sunucuya kaydedildi; ancak sohbet geçmişi yenilenemedi. Gönderdiğiniz metin korunuyor.');
      }
    }else{
      composerDraftsRef.current.delete(targetConversationId);
    }

    try {
      await loadConversations();
    } catch {
      setError(current=>current||'Mesaj gönderildi; sohbet listesi yenilenemedi. Sayfayı yenilediğinizde kayıt görünür.');
    }
    setSending(false);
  }

  async function startVoiceRecording(){
    if(!canCreate||!selectedId||sending||recording)return;
    setRecordingError('');
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
      setRecordingError('Bu tarayıcı ses kaydını desteklemiyor. Güncel Chrome veya Edge kullanın.');
      return;
    }
    const targetConversationId=selectedId;
    const replyMessageId=replyTo?.id??null;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(selectedConversationIdRef.current!==targetConversationId){
        stream.getTracks().forEach(track=>track.stop());
        return;
      }
      const candidates=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'];
      const mimeType=candidates.find(type=>MediaRecorder.isTypeSupported(type));
      const recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      recordingStreamRef.current=stream;
      recorderRef.current=recorder;
      recordingChunksRef.current=[];
      recorder.ondataavailable=event=>{if(event.data.size)recordingChunksRef.current.push(event.data);};
      recorder.onerror=()=>setRecordingError('Ses kaydı sırasında bir hata oluştu.');
      recorder.onstop=()=>{
        if(recordingTimeoutRef.current!==null)window.clearTimeout(recordingTimeoutRef.current);
        recordingTimeoutRef.current=null;
        stream.getTracks().forEach(track=>track.stop());
        recordingStreamRef.current=null;
        recorderRef.current=null;
        setRecording(false);
        const blob=new Blob(recordingChunksRef.current,{type:recorder.mimeType||'audio/webm'});
        recordingChunksRef.current=[];
        if(!blob.size){setRecordingError('Ses kaydı boş olduğu için gönderilmedi.');return;}
        if(blob.size>12*1024*1024){setRecordingError('Ses kaydı 12 MB sınırını aştı. Daha kısa bir kayıt deneyin.');return;}
        const normalizedMime=(blob.type||'audio/webm').split(';')[0].toLowerCase();
        const extension=normalizedMime==='audio/ogg'?'ogg':normalizedMime==='audio/mp4'?'m4a':'webm';
        const file=new File([blob],'sesli-mesaj-'+Date.now()+'.'+extension,{type:normalizedMime});
        void uploadAttachments([file],'',targetConversationId,replyMessageId);
      };
      recorder.start(1000);
      setRecording(true);
      recordingTimeoutRef.current=window.setTimeout(()=>stopVoiceRecording(),120000);
    }catch(cause){
      recordingStreamRef.current?.getTracks().forEach(track=>track.stop());
      recordingStreamRef.current=null;
      recorderRef.current=null;
      setRecording(false);
      setRecordingError(cause instanceof Error?cause.message:'Mikrofon erişimi sağlanamadı.');
    }
  }

  function stopVoiceRecording(){
    const recorder=recorderRef.current;
    if(recorder&&recorder.state!=='inactive')recorder.stop();
  }

  async function openSearchResult(result:Record<string,any>) {
    if(typeof result.conversationId!=='string'||typeof result.id!=='string')return;
    const conversationId=result.conversationId as string;
    const targetId=result.id as string;
    switchConversation(conversationId);
    setError('');
    setSearchOpen(false);
    setMessageLoading(true);
    try {
      const [detailResult,firstPage]=await Promise.all([
        request('chat/conversations/'+conversationId),
        request('chat/conversations/'+conversationId+'/messages'),
      ]);
      let collected=(firstPage.messages??[]) as Message[];
      let page=firstPage.page;
      let pageCount=0;
      while(page?.hasMore&&!collected.some(message=>message.id===targetId)&&pageCount<100) {
        if(selectedConversationIdRef.current!==conversationId)return;
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
      if(selectedConversationIdRef.current!==conversationId)return;
      setDetail(detailResult as ChatDetail);
      setMessages(collected);
      messageHistoryLoaded.current=true;
      setHasMoreMessages(Boolean(page?.hasMore));
      const found=collected.some(message=>message.id===targetId);
      if(found) {
        setSearchTargetMessageId(targetId);
        const latest=collected[collected.length-1];
        if(latest&&canUpdate) {
          await request('chat/conversations/'+conversationId+'/read','POST',{messageId:latest.id});
          if(selectedConversationIdRef.current===conversationId)setConversations(items=>items.map(item=>item.id===conversationId?{...item,unreadCount:0}:item));
        }
        await loadConversations();
      } else {
        setError('Aranan mesaj bulundu ancak son 5.000 mesaj içinde yüklenemedi. Aramayı daraltıp yeniden deneyin.');
      }
    } catch(cause) {
      if(selectedConversationIdRef.current===conversationId)setError(cause instanceof Error?cause.message:'Arama sonucundaki mesaj açılamadı.');
    } finally {
      if(selectedConversationIdRef.current===conversationId)setMessageLoading(false);
    }
  }

  async function startDirect(person:DirectoryPerson) {
    if(!canCreate)return;
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
    if(!canCreate||!groupName.trim()||groupMembers.length===0)return;
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
    if(!canUpdate||actionBusy)return;
    setActionBusy(true);
    try {
      const current=message.reactions.find(item=>item.code===code)?.reactedByMe;
      await request('chat/messages/'+message.id+'/reactions',current?'DELETE':'POST',{reaction:code});
      if(selectedId)await loadMessages(selectedId,false,true);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Tepki kaydedilemedi.');}
    finally {setActionBusy(false);}
  }

  async function editMessage(message:Message) {
    if(!canUpdate||!editingBody.trim())return;
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id,'PATCH',{body:editingBody,version:message.version});
      setEditingId(null);setEditingBody('');
      if(selectedId)await loadMessages(selectedId,false);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj düzenlenemedi.');}
    finally {setActionBusy(false);}
  }

  async function deleteMessage(message:Message) {
    if(!canDelete)return;
    if(!window.confirm('Bu mesajı silmek istiyor musunuz? Mesaj metni temizlenecek.'))return;
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id,'DELETE',{version:message.version});
      if(selectedId)await Promise.all([loadMessages(selectedId,false,true),loadConversations()]);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj silinemedi.');}
    finally {setActionBusy(false);}
  }

  async function togglePin(message:Message) {
    if(!canUpdate)return;
    setActionBusy(true);
    try {
      await request('chat/messages/'+message.id+(message.pinnedAt?'/unpin':'/pin'),'POST',{});
      if(selectedId)await Promise.all([loadDetail(selectedId),loadMessages(selectedId,false,true)]);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Mesaj sabitlenemedi.');}
    finally {setActionBusy(false);}
  }

  function openTaskDraft(message:Message) {
    if(!canCreateTask)return;
    setTaskDraftMessage(message);
    setTaskDraftTitle(message.body.trim().slice(0,240));
    setTaskDraftAssigneeId(currentUserId);
    setTaskDraftProjectId('');
  }

  async function createTaskFromMessage(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!canCreateTask||!taskDraftMessage||!taskDraftTitle.trim()||!taskDraftAssigneeId)return;
    setActionBusy(true);
    try {
      const result=await request('chat/messages/'+taskDraftMessage.id+'/create-task','POST',{
        title:taskDraftTitle.trim(),
        assigneeId:taskDraftAssigneeId,
        projectId:taskDraftProjectId||null,
      });
      setTaskDraftMessage(null);
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
    if(!canUpdate||!selectedId||addMemberIds.length===0)return;
    setActionBusy(true);
    try {
      const result=await request('chat/conversations/'+selectedId+'/members','POST',{userIds:addMemberIds});
      setDetail(result as ChatDetail);setShowAddMembers(false);setAddMemberIds([]);
      await loadConversations();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Üyeler eklenemedi.');}
    finally {setActionBusy(false);}
  }

  async function updateMemberRole(member:ChatMember,role:'admin'|'member'|'owner') {
    if(!canUpdate||!selectedId)return;
    if(role==='owner'&&!window.confirm(member.displayName+' sohbet sahibi olacak; sizin rolünüz yöneticiye dönüşecek. Devam edilsin mi?'))return;
    setActionBusy(true);
    try {
      const result=await request('chat/conversations/'+selectedId+'/members/'+member.id+'/role','PATCH',{role});
      setDetail(result as ChatDetail);
    } catch(cause) {setError(cause instanceof Error?cause.message:'Üye rolü değiştirilemedi.');}
    finally {setActionBusy(false);}
  }

  async function removeMember(member:ChatMember) {
    if(!canDelete||!selectedId||!window.confirm(member.displayName+' kişisini bu sohbetten çıkarmak istiyor musunuz?'))return;
    setActionBusy(true);
    try {
      await request('chat/conversations/'+selectedId+'/members/'+member.id,'DELETE',{});
      if(member.id===currentUserId){
        const removedId=selectedConversationIdRef.current;
        switchConversation(null);
        if(removedId)composerDraftsRef.current.delete(removedId);
      }
      else await loadDetail(selectedId);
      await loadConversations();
    } catch(cause) {setError(cause instanceof Error?cause.message:'Sohbet üyeliği değiştirilemedi.');}
    finally {setActionBusy(false);}
  }

  const activePeople=people.filter(person=>person.id!==currentUserId);
  const canManage=Boolean(canUpdate&&(detail?.myRole==='owner'||detail?.myRole==='admin'));

  return (
    <section className={"chat-workspace"+(mobileThreadOpen?" chat-mobile-thread-open":"")} aria-label="Şirket içi sohbet">
      <aside className="chat-rail">
        <div className="chat-rail-heading">
          <div><span className="eyebrow">EKİP İLETİŞİMİ</span><h2>Sohbetler</h2></div>
          {canCreate&&<button type="button" className="chat-icon-button" onClick={()=>setShowNewGroup(true)} title="Grup oluştur" aria-label="Grup oluştur">＋</button>}
        </div>
        <form className="chat-search-form" onSubmit={searchMessages}>
          <span aria-hidden="true">⌕</span>
          <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Mesajlarda ara…" aria-label="Mesajlarda ara"/>
          <button type="submit" disabled={actionBusy||search.trim().length<2}>Ara</button>
        </form>
        <div className="chat-list-filters" role="group" aria-label="Sohbet filtresi">
          {([
            ['all','Tümü'],
            ['direct','Birebir'],
            ['group','Gruplar'],
            ['unread','Okunmamış'],
          ] as const).map(([value,label])=><button key={value} type="button" aria-pressed={conversationFilter===value} onClick={()=>setConversationFilter(value)}>{label}</button>)}
        </div>
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
           ):visibleConversations.length===0?(
            <div className="chat-list-empty"><strong>Bu filtrede sohbet yok</strong><span>Başka bir filtre seçin veya bir çalışanla yeni sohbet başlatın.</span></div>
          ):visibleConversations.map(conversation=>(
            <button type="button" key={conversation.id} className={'chat-conversation-item'+(selectedId===conversation.id?' selected':'')} onClick={()=>void openConversation(conversation.id)}>
              {conversation.type==='group'
                ? <span className="chat-conversation-avatar">✦</span>
                : <EmployeeAvatar avatarKey={conversation.avatarKey} name={conversation.displayName} size="md"/>}
              <span className="chat-conversation-copy"><strong>{conversation.displayName||'Sohbet'}</strong><span>{conversation.lastSenderName?conversation.lastSenderName+': ':''}{conversation.lastMessage??'Henüz mesaj yok'}</span></span>
              <span className="chat-conversation-meta">{conversation.lastMessageAt&&<time>{timeLabel(conversation.lastMessageAt)}</time>}{conversation.unreadCount>0&&<b>{conversation.unreadCount>99?'99+':conversation.unreadCount}</b>}</span>
            </button>
          ))}
        </div>
        <div className="chat-rail-bottom"><span>{visibleConversations.length} / {conversations.length} konuşma</span><span>{realtimeConnected?'Canlı bağlantı':'Yedek bağlantı'}</span></div>
      </aside>

      <main className="chat-thread">
        {selected&&detail?(
          <>
            <header className="chat-thread-header">
              <button type="button" className="chat-mobile-back" onClick={()=>setMobileThreadOpen(false)} aria-label="Sohbet listesine dön">‹</button>
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
              <div className="chat-thread-actions">
                <span className={'chat-live-indicator'+(realtimeConnected?'':' is-fallback')}><i/> {realtimeConnected?'Canlı bağlantı':'Yedek bağlantı'}</span>
                {canCreate&&selected.type==='direct'&&!activeCall&&<>
                  <button type="button" className="chat-icon-button chat-call-header-button" onClick={()=>void startCall('audio')} disabled={callBusy} aria-label="Sesli arama başlat" title="Sesli arama">☎</button>
                  <button type="button" className="chat-icon-button chat-call-header-button" onClick={()=>void startCall('video')} disabled={callBusy} aria-label="Görüntülü arama başlat" title="Görüntülü arama">▣</button>
                </>}
                <button type="button" className="chat-icon-button" onClick={()=>{setSideTab('members');setMobileContextOpen(true);}} title="Sohbet ayrıntıları" aria-label="Sohbet ayrıntıları">ⓘ</button>
              </div>
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
                              message.deletedAt
                                ? <p className="chat-message-deleted">Bu mesaj silindi.</p>
                                : (message.attachments?.length??0)===0||!message.body.startsWith('📎 ')
                                  ? <p>{message.body}</p>
                                  : null
                            )}
                            {!message.deletedAt&&(message.attachments?.length??0)>0&&(
                              <div className="chat-attachments">
                                {message.attachments.map(attachment=>{
                                  const contentUrl='/api/chat/attachments/'+attachment.id+'/content';
                                  if(attachment.mimeType.startsWith('image/'))return (
                                    <a className="chat-attachment-image" href={contentUrl} target="_blank" rel="noreferrer" key={attachment.id}>
                                      <img src={contentUrl} alt={attachment.originalName} loading="lazy"/>
                                    </a>
                                  );
                                  if(attachment.mimeType.startsWith('audio/'))return (
                                    <div className="chat-attachment-audio" key={attachment.id}>
                                      <span>♫ {attachment.originalName}</span>
                                      <audio controls preload="metadata" src={contentUrl}/>
                                    </div>
                                  );
                                  if(attachment.mimeType.startsWith('video/'))return (
                                    <div className="chat-attachment-video" key={attachment.id}>
                                      <video controls preload="metadata" src={contentUrl}/>
                                      <span>{attachment.originalName} · {fileSizeLabel(attachment.byteSize)}</span>
                                    </div>
                                  );
                                  return (
                                    <a className="chat-attachment-file" href={'/api/chat/attachments/'+attachment.id+'/download'} key={attachment.id}>
                                      <span className="chat-attachment-file-icon">↧</span>
                                      <span><strong>{attachment.originalName}</strong><small>{fileSizeLabel(attachment.byteSize)}</small></span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                            {!message.deletedAt&&(
                              <>
                                <div className="chat-message-tools">
                                  {canCreate&&<button type="button" onClick={()=>setReplyTo(message)} title="Yanıtla">↶ Yanıtla</button>}
                                  {message.linkedTaskId&&canViewTasks&&<button type="button" onClick={()=>onTaskOpen(message.linkedTaskId!)} title="Bağlı görevi aç">✓ Görevi aç</button>}
                                  {!message.linkedTaskId&&canCreateTask&&<button type="button" onClick={()=>openTaskDraft(message)} title="Mesajdan görev oluştur">＋ Görev</button>}
                                  {canUpdate&&(!message.isMine||detail.myRole==='owner'||detail.myRole==='admin')&&<button type="button" onClick={()=>void togglePin(message)}>{message.pinnedAt?'Sabitlemeyi kaldır':'Sabitle'}</button>}
                                  {canUpdate&&message.isMine&&<button type="button" onClick={()=>{setEditingId(message.id);setEditingBody(message.body);}}>Düzenle</button>}
                                  {canDelete&&message.isMine&&<button type="button" onClick={()=>void deleteMessage(message)}>Sil</button>}
                                </div>
                                <div className="chat-reactions">
                                  {message.reactions.map(item=>canUpdate?<button type="button" key={item.code} className={item.reactedByMe?'reacted':''} onClick={()=>void toggleReaction(message,item.code)}>{item.code} {item.count}</button>:<span key={item.code} className="chat-reaction-count">{item.code} {item.count}</span>)}
                                  {canUpdate&&<div className="chat-reaction-picker">{reactions.map(code=><button type="button" key={code} onClick={()=>void toggleReaction(message,code)} aria-label={code}>{code}</button>)}</div>}
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
            {canCreate ? <form className="chat-composer" onSubmit={sendMessage}>
              {replyTo&&<div className="chat-replying"><span><strong>{replyTo.senderName}</strong> mesajına yanıt veriliyor</span><p>{replyTo.body.slice(0,120)}</p><button type="button" onClick={()=>setReplyTo(null)} aria-label="Yanıtı iptal et">×</button></div>}
              {pendingFiles.length>0&&<div className="chat-pending-files" aria-label="Gönderilmeye hazır dosyalar">
                {pendingFiles.map((file,index)=><div key={file.name+'-'+index}><span>{file.name} · {fileSizeLabel(file.size)}</span><button type="button" onClick={()=>setPendingFiles(items=>items.filter((_,fileIndex)=>fileIndex!==index))} aria-label={file.name+' dosyasını kaldır'}>×</button></div>)}
              </div>}
              <div className="chat-composer-media">
                <input
                  ref={attachmentInputRef}
                  type="file"
                  multiple
                  hidden
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,audio/*"
                  onChange={event=>{
                    const chosen=Array.from(event.currentTarget.files??[]);
                    event.currentTarget.value='';
                    if(chosen.length>5){setError('Bir mesajda en fazla 5 dosya seçebilirsiniz.');return;}
                    if(chosen.some(file=>file.size<1||file.size>12*1024*1024)||chosen.reduce((total,file)=>total+file.size,0)>24*1024*1024){
                      setError('Her dosya en fazla 12 MB, toplam ekler en fazla 24 MB olabilir.');return;
                    }
                    setPendingFiles(chosen);setError('');
                  }}
                />
                <button type="button" className="chat-media-button" onClick={()=>attachmentInputRef.current?.click()} disabled={sending||recording} aria-label="Fotoğraf veya dosya ekle" title="Fotoğraf veya dosya ekle">＋</button>
                {recording
                  ? <button type="button" className="chat-record-button is-recording" onClick={stopVoiceRecording} aria-label="Ses kaydını bitir"><i/> Kaydı bitir</button>
                  : <button type="button" className="chat-record-button" onClick={()=>void startVoiceRecording()} disabled={sending||pendingFiles.length>0} aria-label="Sesli mesaj kaydet" title="Sesli mesaj kaydet">🎙 Sesli mesaj</button>}
                {recording&&<span className="chat-recording-live" role="status">Kayıt sürüyor · en fazla 2 dakika</span>}
                {recordingError&&<span className="chat-recording-error" role="alert">{recordingError}</span>}
              </div>
              <textarea value={draft} onChange={event=>setDraft(event.target.value)} maxLength={4000} rows={2} placeholder={replyTo?'Yanıtınızı yazın…':'Mesajınızı yazın…'} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}/>
              <div className="chat-composer-bottom"><span>{sendState==='sent'?'Mesaj gönderildi':sendState==='failed'?'Gönderim başarısız · İçerik korundu':recording?'Kaydı bitirerek sesli mesajı gönderin':'Enter ile gönder · Shift + Enter ile satır ekle'}</span><span>{draft.length}/4000</span><button type="submit" disabled={sending||recording||(!draft.trim()&&pendingFiles.length===0)}>{sending?'Gönderiliyor…':pendingFiles.length?'Dosyaları gönder':'Gönder'} <b>↗</b></button></div>
            </form> : <div className="chat-readonly-note">Bu konuşmaları görüntüleme yetkiniz var; mesaj gönderme izniniz bulunmuyor.</div>}
          </>
        ):(
          <div className="chat-no-selection"><span>✧</span><strong>Bir sohbet seçin</strong><p>Sol taraftan konuşma seçin veya çalışan rehberinden yeni bir sohbet başlatın.</p></div>
        )}
      </main>

      <aside className={"chat-context"+(mobileContextOpen?" mobile-context-open":"")}>
        <div className="chat-context-tabs"><button type="button" className={sideTab==='members'?'active':''} onClick={()=>setSideTab('members')}>Üyeler</button><button type="button" className={sideTab==='pinned'?'active':''} onClick={()=>setSideTab('pinned')}>Sabitlenenler</button><button type="button" className="chat-context-close" onClick={()=>setMobileContextOpen(false)} aria-label="Ayrıntıları kapat">×</button></div>
        {!selected||!detail?<div className="chat-context-empty">Sohbet ayrıntıları seçildiğinde burada görünür.</div>:sideTab==='members'?(
          <>
            <div className="chat-context-heading"><strong>{detail.members.length} üye</strong>{selected.type==='group'&&canManage&&<button type="button" onClick={()=>setShowAddMembers(value=>!value)}>Üye ekle ＋</button>}</div>
            <div className="chat-member-list">
              {detail.members.map(member=>(
                <div className="chat-member-row" key={member.id}>
                  <EmployeeAvatar avatarKey={member.avatarKey} name={member.displayName} size="md"/>
                  <div><strong>{member.displayName}</strong><span>{member.jobTitle||member.department||member.username}</span><small>{roleLabel(member.role)}</small></div>
                  {canUpdate&&selected.type==='group'&&detail.myRole==='owner'&&member.id!==currentUserId&&member.role!=='owner'&&(
                    <select className="chat-member-role-select" value={member.role} onChange={event=>void updateMemberRole(member,event.target.value as 'admin'|'member'|'owner')} disabled={actionBusy} aria-label={member.displayName+' rolü'}>
                      <option value="member">Üye</option><option value="admin">Yönetici</option><option value="owner">Sohbet sahibi</option>
                    </select>
                  )}
                  {canDelete&&selected.type==='group'&&member.id!==currentUserId&&canManage&&member.role!=='owner'&&<button type="button" title="Üyeyi çıkar" onClick={()=>void removeMember(member)}>×</button>}
                </div>
              ))}
            </div>
            {selected.type==='group'&&detail.myRole!=='owner'&&(
              <div className="chat-leave-group">
                <button type="button" disabled={actionBusy} onClick={()=>{
                  const me=detail.members.find(member=>member.id===currentUserId);
                  if(me)void removeMember(me);
                }}>Gruptan ayrıl</button>
              </div>
            )}
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
        
      </aside>

      {activeCall&&typeof document!=='undefined'&&createPortal(
        <div className="chat-call-backdrop">
          {activeCall.status==='ringing'&&!activeCall.isCaller?(
            <section className="chat-call-card chat-incoming-call" role="dialog" aria-modal="true" aria-label="Gelen arama">
              <div className="chat-call-avatar">{activeCall.mediaType==='video'?'▣':'☎'}</div>
              <span className="chat-call-kicker">GELEN {activeCall.mediaType==='video'?'GÖRÜNTÜLÜ':'SESLİ'} ARAMA</span>
              <h2>{activeCall.peerName||'ENCEV PULSE kullanıcısı'}</h2>
              <p>Bu sohbetten gelen aramayı kabul edebilir veya reddedebilirsiniz.</p>
              <div className="chat-call-actions">
                <button type="button" className="chat-call-decline" onClick={()=>void declineCall()} disabled={callBusy}>Reddet</button>
                <button type="button" className="chat-call-accept" onClick={()=>void acceptCall()} disabled={callBusy}>{callBusy?'Bağlanıyor…':'Kabul et'}</button>
              </div>
            </section>
          ):(
            <section className="chat-call-card chat-active-call" role="dialog" aria-modal="true" aria-label="Aktif arama">
              <header><div><span className="chat-call-kicker">{activeCall.mediaType==='video'?'GÖRÜNTÜLÜ ARAMA':'SESLİ ARAMA'}</span><h2>{activeCall.peerName||'Sohbet katılımcısı'}</h2><p>{activeCall.status==='ringing'?'Aranıyor…':remoteStream?'Bağlantı kuruldu':'Bağlantı kuruluyor…'}</p></div><span className="chat-call-state-dot"/></header>
              {activeCall.mediaType==='video'?(
                <div className="chat-call-video-stage">
                  <video ref={remoteVideoRef} autoPlay playsInline className="chat-call-remote-video"/>
                  {localStream&&<video ref={localVideoRef} autoPlay playsInline muted className="chat-call-local-video"/>}
                  {!remoteStream&&<div className="chat-call-video-placeholder">Karşı tarafın görüntüsü bekleniyor…</div>}
                </div>
              ):(
                <div className="chat-call-audio-stage">
                  <div className="chat-call-avatar">☎</div>
                  <audio ref={remoteAudioRef} autoPlay/>
                  <span>{remoteStream?'Ses bağlantısı etkin':'Karşı tarafın sesi bekleniyor…'}</span>
                </div>
              )}
              
              {callError&&<p className="chat-call-error" role="alert">{callError}</p>}
              <div className="chat-call-actions">
                <button type="button" className={!microphoneEnabled?'is-off':''} onClick={toggleMicrophone} disabled={!localStream} aria-label={microphoneEnabled?'Mikrofonu kapat':'Mikrofonu aç'}>{microphoneEnabled?'🎙 Mikrofon':'Mikrofon kapalı'}</button>
                {activeCall.mediaType==='video'&&<button type="button" className={!cameraEnabled?'is-off':''} onClick={toggleCamera} disabled={!localStream} aria-label={cameraEnabled?'Kamerayı kapat':'Kamerayı aç'}>{cameraEnabled?'▣ Kamera':'Kamera kapalı'}</button>}
                <button type="button" className="chat-call-decline" onClick={()=>void endCall()} disabled={callBusy}>{callBusy?'Kapatılıyor…':'Aramayı bitir'}</button>
              </div>
            </section>
          )}
        </div>
        ,document.body
      )}
      {callError&&!activeCall&&typeof document!=='undefined'&&createPortal(
        <div className="chat-error chat-call-global-error" role="alert">{callError}<button type="button" onClick={()=>setCallError('')}>×</button></div>,
        document.body
      )}
      {error&&<div className="chat-error" role="alert">{error}<button type="button" onClick={()=>setError('')}>×</button></div>}

      {canCreateTask&&taskDraftMessage&&(
        <div className="chat-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)setTaskDraftMessage(null);}}>
          <form className="chat-group-modal chat-task-modal" onSubmit={createTaskFromMessage}>
            <div>
              <span className="eyebrow">MESAJDAN GÖREV</span>
              <h2>Yeni görev oluştur</h2>
              <p>Mesaj içeriği açıklama olarak eklenecek; görev başlığını ve sorumlusunu belirleyin.</p>
            </div>
            <label className="chat-modal-field">
              <span>Görev başlığı</span>
              <input value={taskDraftTitle} onChange={event=>setTaskDraftTitle(event.target.value)} maxLength={240} required/>
            </label>
            <label className="chat-modal-field">
              <span>Sorumlu</span>
              <select value={taskDraftAssigneeId} onChange={event=>setTaskDraftAssigneeId(event.target.value)} required>
                {people.map(person=><option key={person.id} value={person.id}>{person.displayName}{person.department?' · '+person.department:''}</option>)}
              </select>
            </label>
            <label className="chat-modal-field">
              <span>Proje</span>
              <select value={taskDraftProjectId} onChange={event=>setTaskDraftProjectId(event.target.value)}>
                <option value="">Projeye bağlama</option>
                {projects.filter(project=>project.status!=='archived').map(project=><option key={project.id} value={project.id}>{project.name}</option>)}
              </select>
            </label>
            <div className="chat-task-source">
              <strong>Kaynak mesaj</strong>
              <p>{taskDraftMessage.body}</p>
              <span>{taskDraftMessage.senderName} · {timeLabel(taskDraftMessage.createdAt)}</span>
            </div>
            <div className="chat-modal-footer">
              <button type="button" className="secondary-button" onClick={()=>setTaskDraftMessage(null)}>Vazgeç</button>
              <button type="submit" className="primary-button" disabled={actionBusy||!taskDraftTitle.trim()||!taskDraftAssigneeId}>{actionBusy?'Oluşturuluyor…':'Görevi oluştur'}</button>
            </div>
          </form>
        </div>
      )}

      {canCreate&&showNewGroup&&(
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
