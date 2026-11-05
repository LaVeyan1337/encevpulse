import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Script } from 'node:vm';
import { test } from 'node:test';

test('Workspace usability: project categories, multi-opinion flow, calendar scopes, chat filters and drawer portal', async () => {
  const paths = {
    workspace: '../app/components/workspace.tsx',
    opinions: '../app/components/institution-opinions-workspace.tsx',
    opinionService: '../../api/src/ced/ced.service.ts',
    opinionController: '../../api/src/ced/ced.controller.ts',
    projectService: '../../api/src/tasks/tasks.service.ts',
    projectMigration: '../../../drizzle/0014_project_types_and_opinion_statuses.sql',
    cedMigration: '../../../drizzle/0015_project_scoped_institution_opinions.sql',
    contactMigration: '../../../drizzle/0018_institution_contact_directory.sql',
    institutionDefaults: '../../api/src/ced/institution-defaults.ts',
    projectStyles: '../app/projects.css',
    opinionStyles: '../app/institution-opinions.css',
    calendar: '../app/components/calendar-workspace.tsx',
    calendarStyles: '../app/calendar.css',
    calendarApiService: '../../api/src/calendar/calendar.service.ts',
    calendarMigration: '../../../drizzle/0016_calendar_ced_event_types.sql',
    calendarController: '../../api/src/calendar/calendar.controller.ts',
    cedService: '../../api/src/ced/ced.service.ts',
    chat: '../app/components/chat-workspace.tsx',
    chatStyles: '../app/people-chat.css',
    chatCallsService: '../../api/src/chat/chat-calls.service.ts',
    chatCallsController: '../../api/src/chat/chat.controller.ts',
    chatCallsMigration: '../../../drizzle/0020_chat_webrtc_calls.sql',
    chatCallsDocs: '../../../docs/WEBRTC_CALLS.md',
    chatService: '../../api/src/chat/chat.service.ts',
    chatController: '../../api/src/chat/chat.controller.ts',
    chatUploadGuard: '../../api/src/chat/chat-upload.guard.ts',
    chatAttachmentValidation: '../../api/src/chat/chat-attachments.ts',
    chatAttachmentMigration: '../../../drizzle/0019_chat_attachments.sql',
    drawer: '../app/components/drawer.tsx',
    glass: '../app/bitrix-glass.css',
    extensionManifest: '../../../browser_extension/manifest.json',
    extensionWorker: '../../../browser_extension/service-worker.js',
    extensionPopup: '../../../browser_extension/popup.js',
    extensionContent: '../../../browser_extension/content-script.js',
    extensionOptions: '../../../browser_extension/options.js',
  };
  const entries = await Promise.all(Object.entries(paths).map(async ([key, path]) => [
    key, await readFile(new URL(path, import.meta.url), 'utf8'),
  ]));
  const source = Object.fromEntries(entries);

  assert.match(source.workspace,/projectTypeLabels/);
  assert.match(source.workspace,/id="project-type"/);
  assert.match(source.workspace,/id="project-edit-type"/);
  assert.match(source.workspace,/projectTab === 'opinions'/);
  assert.match(source.workspace,/projectTab === 'ced'/);
  assert.match(source.workspace,/import \{ CedWorkspace \}/);
  assert.match(source.workspace,/hasModulePermission\('eced'\) \? 'ced'/);
  for(const type of ['res','ges','maden','yk_ges','storage']) {
    assert.match(source.projectMigration,new RegExp(type));
    assert.match(source.projectStyles,new RegExp('project-kind-'+type));
  }
  assert.match(source.projectService,/project_type AS "projectType"/);
  assert.match(source.projectService,/projectType/);

  assert.match(source.opinions,/Yeni görüş ekle/);
  assert.match(source.opinions,/async function saveOpinion/);
  assert.match(source.opinions,/ced\/projects\//);
  assert.match(source.opinions,/ced\/opinions\//);
  for(const status of ['waiting','positive','negative','revision','other_request']) {
    assert.match(source.opinions,new RegExp("value:'"+status+"'"));
    assert.match(source.opinionService,new RegExp("'"+status+"'"));
  }
  assert.match(source.opinionController,/@Post\('projects\/:projectId\/opinions'\)/);
  assert.match(source.opinionService,/INSERT INTO ced_institution_opinions\(project_id,case_id/);
  assert.match(source.opinionService,/private async auditProject/);
  assert.match(source.opinionService,/row\.case_origin !== 'opinion_workspace'/);
  assert.match(source.opinionService,/stageLockedByPtd/);
  assert.match(source.opinionService,/const initialStatus: StageStatus = ptdLocked/);
  assert.match(source.opinionService,/PTD kararı verilmeden sonraki ÇED aşamaları etkinleştirilemez/);
  assert.match(source.opinionService,/const ROUTES = \['ek1_cbd', 'ek2_ptd'\]/);
  assert.match(source.cedMigration,/ALTER COLUMN case_id DROP NOT NULL/);
  assert.match(source.cedMigration,/case_origin IN \('process','opinion_workspace'\)/);
  assert.match(source.cedMigration,/SET project_id = c\.project_id\s+FROM ced_cases c/);
  assert.match(source.cedMigration,/DISABLE TRIGGER ced_audit_events_append_only/);
  assert.match(source.opinionStyles,/\.opinions-add-button/);
  assert.match(source.opinionStyles,/\.opinions-editor-grid/);
  assert.match(source.opinions,/Kurum rehberi/);
  assert.match(source.opinions,/contactPhone/);
  assert.match(source.opinions,/contactEmail/);
  assert.match(source.opinions,/contactAddress/);
  assert.match(source.opinions,/ced\/contacts/);
  assert.match(source.opinions,/ced\/projects\/'\+projectId\+'\/opinions\/defaults/);
  assert.match(source.opinionController,/@Get\('contacts'\)/);
  assert.match(source.opinionController,/@Delete\('opinions\/:opinionId'\)/);
  assert.match(source.opinionController,/@Post\('projects\/:projectId\/opinions\/defaults'\)/);
  assert.match(source.opinionService,/async listInstitutionContacts/);
  assert.match(source.opinionService,/async addDefaultOpinionDrafts/);
  assert.match(source.opinionService,/async archiveOpinion/);
  assert.match(source.opinionService,/saveInstitutionContact/);
  assert.match(source.contactMigration,/CREATE TABLE ced_institution_contacts/);
  assert.match(source.contactMigration,/ADD COLUMN contact_id/);
  assert.match(source.institutionDefaults,/DEFAULT_INSTITUTION_NAMES/);
  assert.match(source.projectService,/DEFAULT_INSTITUTION_NAMES/);

  assert.match(source.calendar,/type CalendarScope = 'all'\|'personal'\|'corporate'/);
  assert.match(source.calendar,/type EventType = .*'presentation'.*'site_visit'.*'hkt'.*'idk'/);
  assert.match(source.calendar,/presentation: 'Sunum'/);
  assert.match(source.calendar,/site_visit: 'Yer Görme'/);
  assert.match(source.calendar,/hkt: 'Halkın Katılım Toplantısı \(HKT\)'/);
  assert.match(source.calendar,/idk: 'İDK Toplantısı'/);
  assert.match(source.calendar,/calendar-scope-switch/);
  assert.match(source.calendar,/scope==='personal'\?event\.visibility==='personal'/);
  assert.match(source.calendar,/scope==='personal'\?event\.visibility==='personal':event\.visibility==='shared'/);
  assert.match(source.calendarStyles,/\.calendar-scope-switch/);
  for(const kind of ['presentation','site_visit','hkt','idk']) assert.match(source.calendarStyles,new RegExp('calendar-entry-'+kind));
  assert.match(source.calendarApiService,/includeCompanyMilestones: boolean/);
  for(const eventType of ['presentation','site_visit','hkt','idk']) {
    assert.match(source.calendarApiService,new RegExp("'"+eventType+"'"));
    assert.match(source.calendarMigration,new RegExp("'"+eventType+"'"));
  }
  assert.match(source.calendarApiService,/includeCompanyMilestones\),/);
  assert.match(source.calendarController,/includeOpinions, true/);
  assert.match(source.cedService,/companyWide = false/);
  assert.match(source.cedService,/if \(includeCed \|\| companyWide\)/);
  assert.match(source.cedService,/if \(includeOpinions \|\| companyWide\)/);
  assert.match(source.cedService,/\$4::boolean OR p\.created_by=\$3/);

  assert.match(source.chat,/conversationFilter/);
  assert.match(source.chat,/mobileThreadOpen/);
  assert.match(source.chat,/chat-mobile-back/);
  assert.match(source.chatStyles,/chat-mobile-thread-open/);
  assert.match(source.chat,/\['unread','Okunmamış'\]/);
  assert.match(source.chat,/visibleConversations\.map/);
  assert.match(source.chatStyles,/\.chat-message\.own \.chat-message-content/);
  assert.match(source.chatStyles,/\.chat-list-filters/);
  assert.match(source.chat,/RTCPeerConnection/);
  assert.match(source.chat,/getUserMedia/);
  assert.match(source.chat,/MediaRecorder/);
  assert.match(source.chat,/async function startCall/);
  assert.match(source.chat,/async function acceptCall/);
  assert.match(source.chat,/processCallSignals/);
  assert.ok(source.chat.includes("request('chat/calls/'+activeCall.id+'/heartbeat'"));
  assert.match(source.chat,/chat-call-video-stage/);
  assert.ok(source.chat.includes('createPortal'));
  assert.ok(source.chat.includes('document.body'));
  assert.ok(source.chat.includes('isActive?2500:10000'));
  assert.ok(source.workspace.includes("hasModulePermission('chat') && ("));
  assert.ok(source.workspace.includes('chat-workspace-host'));
  assert.ok(source.workspace.includes("isActive={section === 'chat'}"));
  assert.ok(source.chatStyles.includes('.chat-workspace-host.is-background{display:none}'));
  assert.ok(source.chatStyles.includes('.chat-call-backdrop{position:fixed;inset:0;z-index:1200'));
  assert.ok(source.chatStyles.includes('.chat-call-global-error'));
  assert.match(source.chatStyles,/\.chat-call-backdrop/);
  assert.match(source.chatStyles,/\.chat-call-video-stage/);
  assert.match(source.chatCallsController,/@Post\('calls\/:id\/heartbeat'\)/);
  assert.match(source.chatCallsController,/@Post\('calls\/:id\/signals'\)/);
  assert.match(source.chatCallsService,/async startCall/);
  assert.match(source.chatCallsService,/async acceptCall/);
  assert.match(source.chatCallsService,/async heartbeat/);
  assert.match(source.chatCallsService,/createHmac\('sha1'/);
  assert.match(source.chatCallsService,/CHAT_TURN_SHARED_SECRET/);
  assert.match(source.chatCallsService,/CHAT_CALL_BUSY/);
  assert.match(source.chatCallsMigration,/CREATE TABLE chat_calls/);
  assert.match(source.chatCallsMigration,/CREATE TABLE chat_call_signals/);
  assert.match(source.chatCallsMigration,/caller_heartbeat_at/);
  assert.match(source.chatCallsMigration,/callee_heartbeat_at/);
  assert.ok(source.chatCallsService.includes("caller_heartbeat_at<now()-interval '120 seconds'"));
  assert.ok(source.chatCallsService.includes("callee_heartbeat_at IS NULL"));
  assert.match(source.chatCallsDocs,/E2EE/);
  assert.match(source.chatCallsDocs,/TURN/);

  assert.match(source.chat,/uploadAttachments/);
  assert.match(source.chat,/startVoiceRecording/);
  assert.match(source.chat,/MediaRecorder/);
  assert.match(source.chat,/chat-attachment-audio/);
  assert.match(source.chat,/chat-attachment-image/);
  assert.match(source.chat,/chat-composer-media/);
  assert.match(source.chatService,/async sendAttachments/);
  assert.match(source.chatService,/async getAttachment/);
  assert.match(source.chatService,/CHAT_ATTACHMENT_USER_QUOTA_BYTES/);
  assert.match(source.chatController,/FilesInterceptor\('files'/);
  assert.match(source.chatController,/attachments\/:id\/content/);
  assert.match(source.chatUploadGuard,/authorizeRequest\(request,true,'multipart'\)/);
  assert.match(source.chatAttachmentValidation,/contentMatches/);
  assert.match(source.chatAttachmentValidation,/CHAT_ATTACHMENT_MAX_TOTAL_BYTES/);
  assert.match(source.chatAttachmentMigration,/CREATE TABLE chat_attachments/);
  assert.match(source.chatAttachmentMigration,/chat_attachments_content_retention/);
  assert.match(source.workspace,/data instanceof FormData/);

  assert.match(source.drawer,/createPortal/);
  assert.match(source.drawer,/document\.body/);
  assert.match(source.drawer,/visually top-most drawer/);
  assert.match(source.drawer,/topLayer\.contains\(opener\)/);
  assert.match(source.extensionManifest,/"scripting"/);
  assert.doesNotMatch(source.extensionManifest,/"content_scripts"/);
  assert.match(source.extensionPopup,/chrome\.scripting\.executeScript/);
  assert.match(source.extensionContent,/__encevPulseAccountObserver/);
  assert.match(source.extensionContent,/PROFILE_SELECTORS/);
  assert.doesNotMatch(source.extensionContent,/document\.cookie|localStorage|sessionStorage|innerHTML|outerHTML|document\.body\.innerText/);
  for(const [name,code] of Object.entries({
    'service-worker.js':source.extensionWorker,
    'popup.js':source.extensionPopup,
    'content-script.js':source.extensionContent,
    'options.js':source.extensionOptions,
  })) new Script(code,{filename:name});
  assert.doesNotThrow(()=>JSON.parse(source.extensionManifest));
  assert.match(source.glass,/select option,select optgroup/);
  assert.match(source.glass,/:root\[data-theme='light'\] select option/);
});
