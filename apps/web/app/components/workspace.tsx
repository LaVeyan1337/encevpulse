import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Drawer } from './drawer';
import { ChatWorkspace } from './chat-workspace';
import { PeopleDirectory } from './people-directory';
import { CalendarWorkspace } from './calendar-workspace';
import { CedWorkspace } from './ced-workspace';
import { EmployeeAvatar } from './avatars';
import { CommentListSkeleton, OverviewSkeleton, ProjectDetailSkeleton, ProjectGridSkeleton, TaskBoardSkeleton, TimelineSkeleton } from './skeletons';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  roles: string[];
  modulePermissions?:Array<{moduleKey:string;displayName:string;enabled:boolean;actions:string[]}>;
  jobTitle?: string;
  department?: string;
  avatarKey?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  assigneeName: string;
  projectId: string | null;
  projectName: string | null;
  startsOn: string | null;
  dueOn: string | null;
  version: number;
  createdBy: string;
  creatorName: string;
  archivedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Person {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  jobTitle?: string;
  department?: string;
  avatarKey?: string;
  roles?: string[];
}

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  taskCount: number;
  completedTaskCount: number;
  memberCount: number;
  ownerId?: string;
  ownerName?: string;
  startsOn?: string | null;
  targetOn?: string | null;
  version?: number;
  archivedAt?: string | null;
  statusBeforeArchive?: ProjectStatus | null;
}

export interface ProjectMember {
  id: string;
  displayName: string;
  username: string;
  isOwner: boolean;
  addedAt: string;
}

export interface ProjectTask {
  id: string;
  title: string;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string;
  assigneeName: string;
  startsOn: string | null;
  dueOn: string | null;
}

export interface ProjectActivity {
  id: string;
  eventType: 'created' | 'updated' | 'member_added' | 'member_removed' | 'archived' | 'restored';
  actorName: string | null;
  createdAt: string;
}

export interface ProjectDetails {
  project: Project & { createdBy: string; creatorName: string; updatedAt: string };
  members: ProjectMember[];
  tasks: ProjectTask[];
  activity: ProjectActivity[];
}

export interface Summary {
  assignedTotal: number;
  open: number;
  completed: number;
  overdue: number;
  upcoming: number;
}

export interface Notification {
  id: string;
  eventType: 'task.assigned' | 'task.comment' | 'chat.message';
  taskId: string | null;
  conversationId: string | null;
  taskTitle: string;
  actorName: string | null;
  preview: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  body: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  authorName: string;
  isMine: boolean;
}

export interface Activity {
  id: string;
  taskId: string;
  taskTitle: string;
  actorName: string | null;
  action: 'created' | 'updated' | 'archived' | 'restored';
  occurredAt: string;
}

export interface TaskActivityItem {
  id: string;
  taskId: string;
  action: 'created' | 'updated' | 'archived' | 'restored';
  occurredAt: string;
  actorName: string | null;
  changes?: Record<string, unknown>;
}

export type TaskStatus = 'open' | 'in_progress' | 'waiting' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Section = 'overview' | 'tasks' | 'projects' | 'calendar' | 'people' | 'chat' | 'users';

const columns: { value: TaskStatus; label: string }[] = [
  { value: 'open', label: 'Açık' },
  { value: 'in_progress', label: 'Devam ediyor' },
  { value: 'waiting', label: 'Bekliyor' },
  { value: 'done', label: 'Tamamlandı' },
];

async function body(response: Response): Promise<Record<string, any>> {
  try {
    return (await response.json()) as Record<string, any>;
  } catch {
    return {};
  }
}

function dateLabel(value: string | null): string {
  if (!value) return 'Tarih belirtilmedi';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(date);
}

function dateTimeLabel(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function activityLabel(action: Activity['action']): string {
  return (
    {
      created: 'görev oluşturdu',
      updated: 'görevi güncelledi',
      archived: 'görevi arşivledi',
      restored: 'görevi geri yükledi',
    }[action] ?? 'işlem yaptı'
  );
}

function priorityLabel(priority: Priority): string {
  return ({ low: 'Düşük', normal: 'Normal', high: 'Yüksek', urgent: 'Acil' })[priority] ?? priority;
}

function projectStatusLabel(status: ProjectStatus): string {
  return ({ planning: 'Hazırlık', active: 'Aktif', on_hold: 'Beklemede', completed: 'Tamamlandı', archived: 'Arşiv' })[status] ?? status;
}

function projectEventLabel(eventType: ProjectActivity['eventType']): string {
  return ({
    created: 'projeyi oluşturdu',
    updated: 'proje bilgilerini güncelledi',
    member_added: 'projeye üye ekledi',
    member_removed: 'proje üyeliğini kaldırdı',
    archived: 'projeyi arşivledi',
    restored: 'projeyi arşivden çıkardı',
  })[eventType] ?? 'proje üzerinde işlem yaptı';
}

function isOverdue(dueOn: string | null, status: TaskStatus): boolean {
  if (!dueOn || status === 'done') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueOn < today;
}

export function Workspace({
  user,
  csrfToken,
  theme,
  onTheme,
  onLogout,
  onExpired,
  children,
}: {
  user: User;
  csrfToken: string;
  theme: 'light' | 'dark';
  onTheme: () => void;
  onLogout: () => void;
  onExpired: () => void;
  children?: ReactNode;
}) {
  const [section, setSection] = useState<Section>('overview');
  const hasModulePermission=useCallback((moduleKey:string,action='view')=>{
    const snapshot=user.modulePermissions;
    if(!snapshot)return false;
    const module=snapshot.find(item=>item.moduleKey===moduleKey);
    return Boolean(module?.enabled&&(module.actions.includes(action)||module.actions.includes('manage')));
  },[user.modulePermissions,user.roles]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [hasMoreTasks, setHasMoreTasks] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    assignedTotal: 0,
    open: 0,
    completed: 0,
    overdue: 0,
    upcoming: 0,
  });
  const [upcoming, setUpcoming] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chatStartUserId, setChatStartUserId] = useState<string | null>(null);
  const [chatStartConversationId, setChatStartConversationId] = useState<string | null>(null);
  const [projectView, setProjectView] = useState<'active' | 'archived'>('active');
  const [projectDetail, setProjectDetail] = useState<ProjectDetails | null>(null);
  const [projectDetailOpen, setProjectDetailOpen] = useState(false);
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectEditing, setProjectEditing] = useState(false);
  const [projectTab, setProjectTab] = useState<'overview' | 'tasks' | 'members' | 'ced'>('overview');
  const [projectRestoreStatus, setProjectRestoreStatus] = useState<'' | 'planning' | 'active' | 'on_hold' | 'completed'>('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [taskActivities, setTaskActivities] = useState<TaskActivityItem[]>([]);
  const [loadingTaskActivity, setLoadingTaskActivity] = useState(false);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [loadingTaskComments, setLoadingTaskComments] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Priority>('all');
  const [projectFilter, setProjectFilter] = useState<'all' | string>('all');
  const [view, setView] = useState<'all' | 'assigned' | 'created' | 'archived'>('assigned');
  const [layout, setLayout] = useState<'board' | 'list'>('board');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Task | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [passwordFormOpen, setPasswordFormOpen] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(()=>{
    if(hasModulePermission(section))return;
    const next=(['overview','tasks','projects','calendar','people','chat','users'] as Section[]).filter(item=>hasModulePermission(item));
    if(next[0])setSection(next[0]);
  },[section,hasModulePermission]);

  const taskListPath = useCallback(
    (offset: number) => {
      const parts = [
        `view=${view}`,
        `status=${statusFilter}`,
        `priority=${priorityFilter}`,
        `q=${encodeURIComponent(settledQuery)}`,
        'limit=100',
        `offset=${offset}`,
      ];
      return `tasks?${parts.join('&')}`;
    },
    [view, statusFilter, priorityFilter, settledQuery],
  );

  const request = useCallback(
    async (path: string, method = 'GET', data?: unknown) => {
      const response = await fetch(`/api/${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers:
          data === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      if (response.status === 401) {
        onExpired();
        throw new Error('Oturum süresi doldu. Yeniden giriş yapın.');
      }
      const result = response.status === 204 ? {} : await body(response);
      if (!response.ok) {
        throw new Error(
          typeof result.message === 'string' ? result.message : 'İşlem tamamlanamadı.',
        );
      }
      return result;
    },
    [csrfToken, onExpired],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskResult,summaryResult,peopleResult,notificationResult,activityResult]=await Promise.all([
        hasModulePermission('tasks')?request(taskListPath(0)):Promise.resolve({tasks:[],page:{hasMore:false}}),
        hasModulePermission('tasks')?request('tasks/summary'):Promise.resolve({summary:{assignedTotal:0,open:0,completed:0,overdue:0,upcoming:0},upcoming:[]}),
        hasModulePermission('people')?request('tasks/people'):Promise.resolve({people:[]}),
        hasModulePermission('notifications')?request('notifications'):Promise.resolve({notifications:[],unreadCount:0}),
        hasModulePermission('tasks')?request('tasks/activity'):Promise.resolve({activity:[]}),
      ]);
      setTasks(taskResult.tasks as Task[]);
      setHasMoreTasks(Boolean(taskResult.page?.hasMore));
      const s = summaryResult.summary as Summary;
      setSummary({
        assignedTotal: Number(s.assignedTotal ?? 0),
        open: Number(s.open ?? 0),
        completed: Number(s.completed ?? 0),
        overdue: Number(s.overdue ?? 0),
        upcoming: Number(s.upcoming ?? 0),
      });
      setUpcoming(summaryResult.upcoming as Task[]);
      setPeople(peopleResult.people as Person[]);
      if(hasModulePermission('projects')) {
        try {
          const projectResult=await request('tasks/projects');
          setProjects(projectResult.projects as Project[]);
          setProjectError('');
        } catch(projectCause) {
          setProjects([]);
          setProjectError(projectCause instanceof Error?projectCause.message:'Projeler yüklenemedi.');
        }
      } else {setProjects([]);setProjectError('');}
      setNotifications(notificationResult.notifications as Notification[]);
      setUnreadCount(Number(notificationResult.unreadCount) || 0);
      setActivity(activityResult.activity as Activity[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kayıtlar alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [request, taskListPath, hasModulePermission]);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    if ((section !== 'people' && section !== 'chat' && section !== 'projects') || !hasModulePermission('people')) return;
    let cancelled = false;
    request('tasks/people')
      .then((result) => {
        if (!cancelled && Array.isArray(result.people)) setPeople(result.people as Person[]);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Çalışan listesi yenilenemedi.');
      });
    return () => { cancelled = true; };
  }, [section, request, hasModulePermission]);


  useEffect(() => {
    const timer = window.setTimeout(() => setSettledQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!selected) {
      setTaskComments([]);
      setCommentDraft('');
      setEditingCommentId(null);
      setEditingCommentBody('');
      setCommentError('');
      return;
    }
    let cancelled = false;
    setLoadingTaskComments(true);
    setCommentError('');
    request(`tasks/${selected.id}/comments`)
      .then((res) => {
        if (!cancelled) setTaskComments(Array.isArray(res.comments) ? (res.comments as TaskComment[]) : []);
      })
      .catch((cause) => {
        if (!cancelled) setCommentError(cause instanceof Error ? cause.message : 'Yorumlar alınamadı.');
      })
      .finally(() => {
        if (!cancelled) setLoadingTaskComments(false);
      });
    return () => { cancelled = true; };
  }, [selected?.id, request]);

  // Load task-specific activity when a task is selected
  useEffect(() => {
    if (!selected) {
      setTaskActivities([]);
      return;
    }
    let cancelled = false;
    setLoadingTaskActivity(true);
    request(`tasks/${selected.id}/activity`)
      .then((res) => {
        if (!cancelled && Array.isArray(res.activity)) {
          setTaskActivities(res.activity as TaskActivityItem[]);
        }
      })
      .catch(() => {
        if (!cancelled) setTaskActivities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTaskActivity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, request]);

  async function loadMoreTasks() {
    setLoadingMore(true);
    try {
      const result = await request(taskListPath(tasks.length));
      setTasks((current) => [...current, ...(result.tasks as Task[])]);
      setHasMoreTasks(Boolean(result.page?.hasMore));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görevler alınamadı.');
    } finally {
      setLoadingMore(false);
    }
  }

  async function openNotification(notification: Notification) {
    setError('');
    try {
      if (!notification.readAt && hasModulePermission('notifications','update')) {
        await request(`notifications/${notification.id}/read`, 'POST', {});
        setNotifications((items) =>
          items.map((item) =>
            item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      setNotificationsOpen(false);
      if (notification.eventType === 'chat.message' && notification.conversationId) {
        setChatStartConversationId(notification.conversationId);
        setChatStartUserId(null);
        setSection('chat');
        return;
      }
      if (!notification.taskId) throw new Error('Bildirim kaydının hedef görevi bulunamadı.');
      if(!hasModulePermission('tasks','view'))throw new Error('Bu görev bildirimini açmak için görev görüntüleme izniniz bulunmuyor.');
      const result = await request(`tasks/${notification.taskId}`);
      setSelected(result.task as Task);
      setSection('tasks');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Bildirim açılamadı.');
    }
  }

  const filteredTasks = useMemo(() => {
    if (projectFilter === 'all') return tasks;
    return tasks.filter((t) => t.projectId === projectFilter);
  }, [tasks, projectFilter]);

  const tasksByStatus = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.value,
          filteredTasks.filter((task) => task.status === column.value),
        ]),
      ) as Record<TaskStatus, Task[]>,
    [filteredTasks],
  );

  async function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!hasModulePermission('tasks',selected?'update':'create'))return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    const payload = {
      title: form.get('title'),
      description: form.get('description'),
      priority: form.get('priority'),
      status: form.get('status'),
      assigneeId: form.get('assigneeId'),
      projectId: form.get('projectId') || null,
      startsOn: form.get('startsOn') || null,
      dueOn: form.get('dueOn') || null,
    };
    try {
      if (selected) {
        const res = await request(`tasks/${selected.id}`, 'PATCH', {
          ...payload,
          version: selected.version,
        });
        setSelected(res.task as Task);
        setMessage('Görev kaydedildi.');
      } else {
        await request('tasks', 'POST', payload);
        setMessage('Görev oluşturuldu.');
      }
      setTaskFormOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görev kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function moveTask(task: Task, status: TaskStatus) {
    if (!hasModulePermission('tasks','update')||task.status === status) return;
    setError('');
    try {
      const res = await request(`tasks/${task.id}`, 'PATCH', { status, version: task.version });
      if (selected?.id === task.id) {
        setSelected(res.task as Task);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görev durumu değiştirilemedi.');
    }
  }

  async function archiveTask(task: Task, restore = false) {
    if(!hasModulePermission('tasks',restore?'update':'delete'))return;
    setError('');
    try {
      await request(`tasks/${task.id}/${restore ? 'restore' : 'archive'}`, 'POST', {
        version: task.version,
      });
      setSelected(null);
      setMessage(restore ? 'Görev geri yüklendi.' : 'Görev arşivlendi.');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görev güncellenemedi.');
    }
  }

  async function submitTaskComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasModulePermission('tasks','create')||!selected || !commentDraft.trim()) return;
    setCommentBusy(true);
    setCommentError('');
    try {
      const result = await request(`tasks/${selected.id}/comments`, 'POST', { body: commentDraft });
      setTaskComments((items) => [...items, result.comment as TaskComment]);
      setCommentDraft('');
      await refresh();
    } catch (cause) {
      setCommentError(cause instanceof Error ? cause.message : 'Yorum gönderilemedi.');
    } finally {
      setCommentBusy(false);
    }
  }

  async function saveTaskComment(comment: TaskComment) {
    if (!hasModulePermission('tasks','update')||!selected || !editingCommentBody.trim()) return;
    setCommentBusy(true);
    setCommentError('');
    try {
      const result = await request(`tasks/${selected.id}/comments/${comment.id}`, 'PATCH', {
        body: editingCommentBody,
        version: comment.version,
      });
      setTaskComments((items) => items.map((item) => item.id === comment.id ? result.comment as TaskComment : item));
      setEditingCommentId(null);
      setEditingCommentBody('');
    } catch (cause) {
      setCommentError(cause instanceof Error ? cause.message : 'Yorum güncellenemedi.');
    } finally {
      setCommentBusy(false);
    }
  }

  async function removeTaskComment(comment: TaskComment) {
    if (!hasModulePermission('tasks','delete')||!selected) return;
    if (!window.confirm('Bu yorumu silmek istediğinizden emin misiniz? Yorum metni kaldırılacaktır.')) return;
    setCommentBusy(true);
    setCommentError('');
    try {
      await request(`tasks/${selected.id}/comments/${comment.id}`, 'DELETE', { version: comment.version });
      setTaskComments((items) => items.map((item) => item.id === comment.id
        ? { ...item, body: '', deletedAt: new Date().toISOString(), version: item.version + 1 }
        : item));
      if (editingCommentId === comment.id) {
        setEditingCommentId(null);
        setEditingCommentBody('');
      }
    } catch (cause) {
      setCommentError(cause instanceof Error ? cause.message : 'Yorum silinemedi.');
    } finally {
      setCommentBusy(false);
    }
  }

  async function loadProjects(nextView: 'active' | 'archived') {
    setProjectView(nextView);
    setLoading(true);
    setProjectError('');
    try {
      const result = await request(`projects?view=${nextView}`);
      setProjects(Array.isArray(result.projects) ? result.projects as Project[] : []);
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : 'Projeler alınamadı.');
    } finally {
      setLoading(false);
    }
  }

  const clearChatStart = useCallback(() => {
    setChatStartUserId(null);
    setChatStartConversationId(null);
  }, []);

  async function openChatTask(taskId: string) {
    try {
      const result = await request(`tasks/${taskId}`);
      setSection('tasks');
      setSelected(result.task as Task);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Mesajdan oluşturulan görev açılamadı.');
    }
  }

  async function openProject(projectId: string) {
    setProjectDetailOpen(true);
    setProjectLoading(true);
    setProjectEditing(false);
    setProjectError('');
    setProjectDetail(null);
    setProjectTab('overview');
    setProjectRestoreStatus('');
    try {
      const result = await request(`projects/${projectId}`);
      setProjectDetail(result as ProjectDetails);
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : 'Proje ayrıntıları alınamadı.');
    } finally {
      setProjectLoading(false);
    }
  }

  async function saveProjectDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasModulePermission('projects','update')||!projectDetail) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setProjectError('');
    try {
      const result = await request(`projects/${projectDetail.project.id}`, 'PATCH', {
        version: projectDetail.project.version,
        name: form.get('name'),
        description: form.get('description'),
        status: form.get('status'),
        ownerId: form.get('ownerId'),
        startsOn: form.get('startsOn') || null,
        targetOn: form.get('targetOn') || null,
        memberIds: form.getAll('members').map(String),
      });
      setProjectDetail(result as ProjectDetails);
      setProjectEditing(false);
      setMessage('Proje bilgileri güncellendi.');
      const list = await request(`projects?view=${projectView}`);
      setProjects(Array.isArray(list.projects) ? list.projects as Project[] : []);
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : 'Proje güncellenemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleProjectArchive() {
    if (!projectDetail || !hasModulePermission('projects',projectDetail.project.archivedAt?'update':'delete')) return;
    const archived = Boolean(projectDetail.project.archivedAt) || projectDetail.project.status === 'archived';
    const legacyArchive = archived && !projectDetail.project.statusBeforeArchive;
    if (legacyArchive && !projectRestoreStatus) {
      setProjectError('Bu eski arşiv kaydının önceki durumu bilinmiyor. Geri yükleme durumunu seçin.');
      return;
    }
    const question = archived
      ? 'Bu projeyi seçilen duruma geri yüklemek istiyor musunuz?'
      : 'Bu projeyi arşivlemek istiyor musunuz? Projeye bağlı görevler silinmeyecek.';
    if (!window.confirm(question)) return;
    setBusy(true);
    setProjectError('');
    try {
      await request(`projects/${projectDetail.project.id}/${archived ? 'restore' : 'archive'}`, 'POST', {
        version: projectDetail.project.version,
        ...(legacyArchive ? { restoreStatus: projectRestoreStatus } : {}),
      });
      setProjectDetailOpen(false);
      setProjectDetail(null);
      const list = await request(`projects?view=${projectView}`);
      setProjects(Array.isArray(list.projects) ? list.projects as Project[] : []);
      setMessage(archived ? 'Proje arşivden çıkarıldı.' : 'Proje arşivlendi.');
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : 'Proje arşiv işlemi tamamlanamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function openProjectTask(taskId: string) {
    setProjectDetailOpen(false);
    setSection('tasks');
    try {
      const result = await request(`tasks/${taskId}`);
      setSelected(result.task as Task);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Görev açılamadı.');
    }
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!hasModulePermission('projects','create'))return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setProjectError('');
    const members = form.getAll('members').map(String);
    try {
      await request('projects', 'POST', {
        name: form.get('name'),
        description: form.get('description'),
        status: form.get('status') || 'planning',
        startsOn: form.get('startsOn') || null,
        targetOn: form.get('targetOn') || null,
        memberIds: members,
      });
      setProjectFormOpen(false);
      setMessage('Proje oluşturuldu.');
      await refresh();
    } catch (cause) {
      setProjectError(cause instanceof Error ? cause.message : 'Proje oluşturulamadı.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (newPassword !== confirmPassword) {
      setPasswordError('Yeni parolalar eşleşmiyor.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('Yeni parola en az 8 karakter olmalıdır.');
      return;
    }

    setBusy(true);
    setPasswordError('');
    setPasswordSuccess('');
    try {
      await request('auth/password', 'POST', { currentPassword, newPassword });
      setPasswordSuccess('Parolanız başarıyla güncellendi.');
      setTimeout(() => {
        setPasswordFormOpen(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (cause) {
      setPasswordError(cause instanceof Error ? cause.message : 'Parola değiştirilemedi.');
    } finally {
      setBusy(false);
    }
  }

  const sectionTitle =
    section === 'overview' ? 'Genel Bakış' : section === 'tasks' ? 'Görevler' : section === 'projects' ? 'Projeler' : section === 'calendar' ? 'Takvim' : section === 'people' ? 'Çalışanlar' : section === 'chat' ? 'Sohbet' : 'Kullanıcılar';

  return (
    <div className="workspace-shell">
      {/* Mobile nav backdrop */}
      {mobileNavOpen && (
        <div
          className="mobile-nav-backdrop"
          onClick={() => setMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Fixed Left Navigation Sidebar */}
      <aside className={`workspace-sidebar${mobileNavOpen ? ' mobile-open' : ''}`}>
        <a className="brand workspace-brand" href="/" aria-label="ENCEV PULSE ana sayfa">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          <span className="brand-name">
            ENCEV<span> PULSE</span>
          </span>
        </a>

        <nav aria-label="Ana gezinme" className="workspace-nav">
          {hasModulePermission('overview') && (
          <button
            type="button"
            className={section === 'overview' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('overview');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="home" />
            <span>Genel Bakış</span>
          </button>
          )}
          {hasModulePermission('tasks') && (
          <button
            type="button"
            className={section === 'tasks' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('tasks');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="check" />
            <span>Görevler</span>
          </button>
          )}
          {hasModulePermission('calendar') && (
          <button
            type="button"
            className={section === 'calendar' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('calendar');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="calendar-days" />
            <span>Takvim &amp; Yasal Süreçler</span>
          </button>
          )}
          {hasModulePermission('people') && (
          <button
            type="button"
            className={section === 'people' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('people');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="users" />
            <span>Çalışanlar</span>
          </button>
          )}
          {hasModulePermission('chat') && (
          <button
            type="button"
            className={section === 'chat' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('chat');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="message" />
            <span>Sohbet</span>
          </button>
          )}
          {hasModulePermission('projects') && (
          <button
            type="button"
            className={section === 'projects' ? 'nav-item selected' : 'nav-item'}
            onClick={() => {
              setSection('projects');
              setMobileNavOpen(false);
            }}
          >
            <Icon name="folder" />
            <span>Projeler</span>
          </button>
          )}
          {hasModulePermission('users') && (
            <button
              type="button"
              className={section === 'users' ? 'nav-item selected' : 'nav-item'}
              onClick={() => {
                setSection('users');
                setMobileNavOpen(false);
              }}
            >
              <Icon name="users" />
              <span>Kullanıcılar</span>
            </button>
          )}
        </nav>

        <div className="sidebar-bottom">
          <span className="sidebar-caption">EnÇev Çevre Mühendisliği</span>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="workspace-main">
        {/* Top Header Bar */}
        <header className="workspace-topbar">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Menüyü aç/kapat"
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <Icon name="menu" />
          </button>

          <a className="mobile-brand brand" href="/" aria-label="ENCEV PULSE">
            <span className="brand-mark" aria-hidden="true">
              <span />
            </span>
            <span className="brand-name">
              ENCEV<span> PULSE</span>
            </span>
          </a>

          {/* Top Search Bar */}
          <div className="topbar-search" role="search">
            <Icon name="search" />
            <input
              aria-label="Görevlerde ara"
              placeholder="Görevlerde ara…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (section !== 'tasks') setSection('tasks');
              }}
            />
            {query && (
              <button
                type="button"
                className="search-clear-button"
                onClick={() => setQuery('')}
                aria-label="Aramayı temizle"
              >
                ×
              </button>
            )}
          </div>

          <div className="topbar-spacer" />

          {/* Theme switcher */}
          <button
            className="theme-button workspace-theme"
            type="button"
            onClick={onTheme}
            aria-label={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
          >
            <span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span>
            <span>{theme === 'dark' ? 'Açık tema' : 'Koyu tema'}</span>
          </button>

          {/* Notifications button & popover */}
{hasModulePermission('notifications') && <div className="notification-menu">
            <button
              className="notification-button"
              type="button"
              aria-label={`Bildirimler${unreadCount ? `, ${unreadCount} okunmamış` : ''}`}
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Icon name="bell" />
              {unreadCount > 0 && (
                <span className="notification-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notificationsOpen && (
              <section className="notification-popover" aria-label="Bildirimler">
                <div className="notification-popover-heading">
                  <strong>Bildirimler</strong>
                  {unreadCount > 0 && <span>{unreadCount} okunmamış</span>}
                </div>
                {notifications.length === 0 ? (
                  <p className="notification-empty">Yeni bildiriminiz yok.</p>
                ) : (
                  notifications.map((notification) => (
                    <button
                      type="button"
                      className={`notification-row${notification.readAt ? '' : ' unread'}`}
                      key={notification.id}
                      onClick={() => void openNotification(notification)}
                    >
                      <span className="notification-title">{notification.taskTitle}</span>
                      <span className="notification-description">
                        {notification.actorName ?? 'Bir kullanıcı'}{' '}
                        {notification.eventType === 'chat.message'
                          ? 'sohbete yeni mesaj gönderdi'
                          : notification.eventType === 'task.comment'
                            ? 'göreve yorum ekledi'
                            : 'görevi size atadı'}
                      </span>
                      {notification.preview && <span className="notification-preview">{notification.preview}</span>}
                      <time>{dateTimeLabel(notification.createdAt)}</time>
                    </button>
                  ))
                )}
              </section>
            )}
          </div>}

          {/* User Profile Menu */}
          <details className="user-menu">
            <summary>
              <EmployeeAvatar avatarKey={user.avatarKey} name={user.displayName} size="sm"/>
              <span className="user-menu-name">{user.displayName}</span>
              <span className="chevron">⌄</span>
            </summary>
            <div className="user-menu-popover">
              <div className="user-profile-summary">
                <strong>{user.displayName}</strong>
                <span>{user.jobTitle || 'Görev belirtilmedi'} · {user.department || 'Birim belirtilmedi'}</span>
                <span>{user.email}</span>
                <div className="user-profile-roles">
                  {user.roles.map((role) => (
                    <span className="user-role-tag" key={role}>
                      {({
                        employee:'Çalışan',
                        team_lead:'Ekip sorumlusu',
                        project_manager:'Proje yöneticisi',
                        process_owner:'Süreç sahibi',
                        document_steward:'Belge sorumlusu',
                        auditor:'Denetçi',
                        system_admin:'Sistem yöneticisi',
                      } as Record<string,string>)[role] ?? role}
                    </span>
                  ))}
                </div>
              </div>
              <div className="user-menu-divider" />
              <button
                type="button"
                className="user-menu-action"
                onClick={() => {
                  setPasswordFormOpen(true);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
              >
                Parolamı değiştir
              </button>
              <button
                type="button"
                className="user-menu-action user-menu-logout"
                onClick={onLogout}
              >
                Oturumu kapat
              </button>
            </div>
          </details>
        </header>

        {/* Content View */}
        <main key={section} className="workspace-content workspace-page-enter">
          <div className="workspace-heading">
            <div>
              <p className="eyebrow">ENCEV PULSE</p>
              <h1>{sectionTitle}</h1>
            </div>
            {section === 'projects' && hasModulePermission('projects','create') && (
              <div className="heading-actions">
                <button
                  type="button"
                  className="primary-button compact-button"
                  onClick={() => setProjectFormOpen(true)}
                >
                  Proje oluştur
                </button>
              </div>
            )}
            {section === 'tasks' && (hasModulePermission('tasks','create')||hasModulePermission('projects','create')) && (
              <div className="heading-actions">
                {hasModulePermission('projects','create')&&<button
                  type="button"
                  className="secondary-button compact-button"
                  onClick={() => setProjectFormOpen(true)}
                >
                  Proje oluştur
                </button>}
                {hasModulePermission('tasks','create')&&<button
                  type="button"
                  className="primary-button compact-button"
                  onClick={() => {
                    setSelected(null);
                    setTaskFormOpen(true);
                  }}
                >
                  Görev oluştur
                </button>}
              </div>
            )}
          </div>

          {error && (
            <div className="workspace-alert" role="alert">
              <span>{error}</span>
              <button type="button" onClick={() => void refresh()} aria-label="Yeniden dene">
                Yeniden dene
              </button>
            </div>
          )}

          {message && (
            <p className="workspace-success" role="status">
              {message}
            </p>
          )}

          {/* Overview Section */}
          {section === 'overview' && (
            loading ? <OverviewSkeleton /> : (
              <section className="overview-section" aria-label="Görev özeti">
              <div className="summary-grid">
                <button
                  type="button"
                  className="summary-card"
                  onClick={() => {
                    setView('assigned');
                    setStatusFilter('all');
                    setSection('tasks');
                  }}
                >
                  <div className="summary-card-header">
                    <span>Bana atanan görevler</span>
                    <span className="summary-icon">
                      <Icon name="check" />
                    </span>
                  </div>
                  <strong>{summary.assignedTotal}</strong>
                </button>
                <button
                  type="button"
                  className="summary-card"
                  onClick={() => {
                    setView('assigned');
                    setStatusFilter('open');
                    setSection('tasks');
                  }}
                >
                  <div className="summary-card-header">
                    <span>Açık görevler</span>
                    <span className="summary-indicator indicator-open" />
                  </div>
                  <strong>{summary.open}</strong>
                </button>
                <button
                  type="button"
                  className="summary-card"
                  onClick={() => {
                    setView('assigned');
                    setSection('tasks');
                  }}
                >
                  <div className="summary-card-header">
                    <span>Geciken</span>
                    <span className="summary-indicator indicator-overdue" />
                  </div>
                  <strong className={summary.overdue > 0 ? 'metric-warning' : ''}>
                    {summary.overdue}
                  </strong>
                </button>
                <button
                  type="button"
                  className="summary-card"
                  onClick={() => {
                    setView('assigned');
                    setSection('tasks');
                  }}
                >
                  <div className="summary-card-header">
                    <span>7 gün içinde teslim</span>
                    <span className="summary-indicator indicator-upcoming" />
                  </div>
                  <strong>{summary.upcoming}</strong>
                </button>
                <button
                  type="button"
                  className="summary-card"
                  onClick={() => {
                    setView('assigned');
                    setStatusFilter('done');
                    setSection('tasks');
                  }}
                >
                  <div className="summary-card-header">
                    <span>Tamamlanan</span>
                    <span className="summary-indicator indicator-done" />
                  </div>
                  <strong>{summary.completed}</strong>
                </button>
              </div>

              <div className="overview-dual-grid">
                {/* Upcoming tasks */}
                <section className="overview-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Yaklaşan görevler</h2>
                      <p>Size atanan ve tarihi belirlenmiş işler</p>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        setView('assigned');
                        setSection('tasks');
                      }}
                    >
                      Görevleri aç
                    </button>
                  </div>
                  {loading ? (
                    <p className="muted-line">Görevler alınıyor…</p>
                  ) : upcoming.length ? (
                    <div className="upcoming-list">
                      {upcoming.map((task) => (
                        <button
                          type="button"
                          className="upcoming-row"
                          key={task.id}
                          onClick={() => {
                            setSection('tasks');
                            void request(`tasks/${task.id}`)
                              .then((data) => setSelected(data.task as Task))
                              .catch((cause) => setError(cause.message));
                          }}
                        >
                          <span className="task-title">{task.title}</span>
                          <span
                            className={`priority-dot priority-${task.priority}`}
                            aria-label={`Öncelik: ${priorityLabel(task.priority)}`}
                          />
                          <time className={isOverdue(task.dueOn, task.status) ? 'date-overdue' : ''}>
                            {dateLabel(task.dueOn)}
                          </time>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Icon name="check" />
                      <strong>Yaklaşan göreviniz yok</strong>
                      <span>Size atanan teslim tarihi yaklaşan görevler burada görünür.</span>
                    </div>
                  )}
                </section>

                {/* Recent real activity log */}
                <section className="overview-panel activity-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Son hareketler</h2>
                      <p>Erişebildiğiniz görevlerdeki son değişiklikler</p>
                    </div>
                  </div>
                  {loading ? (
                    <p className="muted-line">Hareketler alınıyor…</p>
                  ) : activity.length ? (
                    <div className="activity-list">
                      {activity.map((item) => (
                        <button
                          type="button"
                          className="activity-row"
                          key={item.id}
                          onClick={() => {
                            void request(`tasks/${item.taskId}`)
                              .then((result) => {
                                setSelected(result.task as Task);
                                setSection('tasks');
                              })
                              .catch((cause) => setError(cause.message));
                          }}
                        >
                          <span className="activity-marker" />
                          <span className="activity-text">
                            <strong>{item.actorName ?? 'Bir kullanıcı'}</strong>{' '}
                            {activityLabel(item.action)} <strong>{item.taskTitle}</strong>
                          </span>
                          <time>{dateTimeLabel(item.occurredAt)}</time>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">
                      <span>Henüz kaydedilmiş görev hareketi yok.</span>
                    </div>
                  )}
                </section>
              </div>
              </section>
            )
          )}

          {/* Tasks Section */}
          {section === 'tasks' && (
            <section className="tasks-section" aria-label="Görev kayıtları">
              {/* Task Toolbar */}
              <div className="task-toolbar">
                <div className="task-filters">
                  <label className="search-field">
                    <Icon name="search" />
                    <input
                      aria-label="Görev filtrele"
                      placeholder="Görevlerde filtrele…"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>

                  <select
                    aria-label="Görünüm filtresi"
                    value={view}
                    onChange={(event) =>
                      setView(event.target.value as 'all' | 'assigned' | 'created' | 'archived')
                    }
                  >
                    <option value="assigned">Bana atananlar</option>
                    <option value="created">Oluşturduklarım</option>
                    <option value="all">Tüm görevler</option>
                    <option value="archived">Arşivlenenler</option>
                  </select>

                  <select
                    aria-label="Durum filtresi"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as 'all' | TaskStatus)
                    }
                  >
                    <option value="all">Tüm durumlar</option>
                    {columns.map((col) => (
                      <option key={col.value} value={col.value}>
                        {col.label}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Öncelik filtresi"
                    value={priorityFilter}
                    onChange={(event) =>
                      setPriorityFilter(event.target.value as 'all' | Priority)
                    }
                  >
                    <option value="all">Tüm öncelikler</option>
                    <option value="urgent">Acil</option>
                    <option value="high">Yüksek</option>
                    <option value="normal">Normal</option>
                    <option value="low">Düşük</option>
                  </select>

                  {projects.length > 0 && (
                    <select
                      aria-label="Proje filtresi"
                      value={projectFilter}
                      onChange={(event) => setProjectFilter(event.target.value)}
                    >
                      <option value="all">Tüm projeler</option>
                      {projects.map((proj) => (
                        <option key={proj.id} value={proj.id}>
                          {proj.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="task-actions">
                  <div className="view-switch" role="group" aria-label="Görünüm seçimi">
                    <button
                      type="button"
                      aria-pressed={layout === 'board'}
                      onClick={() => setLayout('board')}
                    >
                      Kanban
                    </button>
                    <button
                      type="button"
                      aria-pressed={layout === 'list'}
                      onClick={() => setLayout('list')}
                    >
                      Liste
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <TaskBoardSkeleton layout={layout} />
              ) : filteredTasks.length === 0 ? (
                <div className="large-empty empty-state">
                  <Icon name="check" />
                  <strong>Görev bulunamadı</strong>
                  <span>Seçili filtrelerle eşleşen kayıt bulunmuyor.</span>
                  {hasModulePermission('tasks','create')&&<button
                    type="button"
                    className="primary-button compact-button"
                    onClick={() => {
                      setSelected(null);
                      setTaskFormOpen(true);
                    }}
                  >
                    Yeni görev oluştur
                  </button>}
                </div>
              ) : layout === 'board' ? (
                /* Kanban Board View */
                <div className="kanban-board" role="region" aria-label="Kanban panosu">
                  {columns.map((column) => {
                    const colTasks = tasksByStatus[column.value] ?? [];
                    const isDragOver = dragOverColumn === column.value;
                    return (
                      <div
                        key={column.value}
                        className={`kanban-column${isDragOver ? ' kanban-column-dragover' : ''}`}
                        onDragOver={(event) => {
                           if(!hasModulePermission('tasks','update'))return;
                          event.preventDefault();
                          setDragOverColumn(column.value);
                        }}
                        onDragLeave={() => setDragOverColumn(null)}
                        onDrop={(event) => {
                           if(!hasModulePermission('tasks','update'))return;
                          event.preventDefault();
                          setDragOverColumn(null);
                          const taskId = event.dataTransfer.getData('text/plain');
                          const droppedTask = tasks.find((t) => t.id === taskId);
                          if (droppedTask && droppedTask.status !== column.value) {
                            void moveTask(droppedTask, column.value);
                          }
                        }}
                      >
                        <div className="kanban-heading">
                          <h2>{column.label}</h2>
                          <span>{colTasks.length}</span>
                        </div>

                        <div className="kanban-cards">
                          {colTasks.map((task) => (
                            <div
                              key={task.id}
                              className="task-card"
                              draggable={hasModulePermission('tasks','update')}
                              onDragStart={(event) => {
                                event.dataTransfer.setData('text/plain', task.id);
                              }}
                            >
                              <button
                                type="button"
                                className="task-card-open"
                                onClick={() => setSelected(task)}
                              >
                                <div className="task-card-top">
                                  {task.projectName && (
                                    <span className="project-chip">{task.projectName}</span>
                                  )}
                                  <span className={`priority-tag priority-${task.priority}`}>
                                    {priorityLabel(task.priority)}
                                  </span>
                                </div>
                                <span className="task-card-title">{task.title}</span>
                                <div className="task-card-meta">
                                  <span className="task-card-assignee">
                                    <EmployeeAvatar avatarKey={people.find((person) => person.id === task.assigneeId)?.avatarKey} name={task.assigneeName} size="sm"/>
                                    <span>{task.assigneeName}</span>
                                  </span>
                                  {task.dueOn && (
                                    <time
                                      className={isOverdue(task.dueOn, task.status) ? 'date-overdue' : ''}
                                    >
                                      {dateLabel(task.dueOn)}
                                    </time>
                                  )}
                                </div>
                              </button>

                              <select
                                aria-label="Görevin durumunu değiştir"
                                value={task.status}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(event) =>
                                  void moveTask(task, event.target.value as TaskStatus)
                                }
                              >
                                {columns.map((item) => (
                                  <option key={item.value} value={item.value}>
                                    {item.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                          {colTasks.length === 0 && (
                            <div className="kanban-column-empty">Bu sütunda görev yok</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View */
                <div className="task-table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Görev Adı</th>
                        <th>Proje</th>
                        <th>Sorumlu</th>
                        <th>Son Teslim</th>
                        <th>Durum</th>
                        <th>Öncelik</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTasks.map((task) => (
                        <tr
                          key={task.id}
                          onClick={() => setSelected(task)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') setSelected(task);
                          }}
                        >
                          <td className="task-table-title-cell">
                            <strong>{task.title}</strong>
                          </td>
                          <td>
                            {task.projectName ? (
                              <span className="project-chip">{task.projectName}</span>
                            ) : (
                              <span className="muted-dash">—</span>
                            )}
                          </td>
                          <td>
                            <span className="table-assignee">
                              <EmployeeAvatar avatarKey={people.find((person) => person.id === task.assigneeId)?.avatarKey} name={task.assigneeName} size="sm"/>
                              <span>{task.assigneeName}</span>
                            </span>
                          </td>
                          <td>
                            <time
                              className={isOverdue(task.dueOn, task.status) ? 'date-overdue' : ''}
                            >
                              {dateLabel(task.dueOn)}
                            </time>
                          </td>
                          <td>
                            <select
                              aria-label="Durum seç"
                              value={task.status}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                void moveTask(task, event.target.value as TaskStatus)
                              }
                            >
                              {columns.map((item) => (
                                <option key={item.value} value={item.value}>
                                  {item.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className={`priority-tag priority-${task.priority}`}>
                              {priorityLabel(task.priority)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {hasMoreTasks && (
                <div className="load-more-wrap">
                  <button
                    type="button"
                    className="secondary-button small-button"
                    onClick={() => void loadMoreTasks()}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Yükleniyor…' : 'Daha fazla görev göster'}
                  </button>
                </div>
              )}
            </section>
          )}

          {section === 'calendar' && hasModulePermission('calendar') && (
            <CalendarWorkspace
              request={request}
              people={people}
              projects={projects}
              currentUserId={user.id}
              canCreate={hasModulePermission('calendar','create')}
              canUpdate={hasModulePermission('calendar','update')}
              canDelete={hasModulePermission('calendar','delete')}
              canViewTasks={hasModulePermission('tasks')}
              canViewProjects={hasModulePermission('projects')}
              canViewCed={hasModulePermission('eced')}
              canViewOpinions={hasModulePermission('institution_opinions')}
              onTaskOpen={(taskId) => void openChatTask(taskId)}
              onProjectOpen={(projectId) => void openProject(projectId)}
            />
          )}

          {section === 'people' && (
            <PeopleDirectory
              people={people}
              currentUserId={user.id}
              canMessage={hasModulePermission('chat','view')&&hasModulePermission('chat','create')}
              onMessage={(person) => {
                setChatStartUserId(person.id);
                setChatStartConversationId(null);
                setSection('chat');
              }}
            />
          )}

          {section === 'chat' && (
            <ChatWorkspace
              request={request}
              people={people}
              currentUserId={user.id}
              projects={projects.filter((project) => project.status !== 'archived' && !project.archivedAt).map(({id,name,status}) => ({id,name,status}))}
              startUserId={chatStartUserId}
              initialConversationId={chatStartConversationId}
              onStartConsumed={clearChatStart}
              onTaskOpen={(taskId) => void openChatTask(taskId)}
              canCreate={hasModulePermission('chat','create')}
              canUpdate={hasModulePermission('chat','update')}
              canDelete={hasModulePermission('chat','delete')}
              canCreateTask={hasModulePermission('chat','create')&&hasModulePermission('tasks','create')}
              canViewTasks={hasModulePermission('tasks','view')}
            />
          )}

          {/* Project Workspace */}
          {section === 'projects' && (
            <section className="projects-section" aria-label="Projeler">
              {projectError && <p className="auth-error" role="alert">{projectError}</p>}
              <div className="projects-toolbar">
                <div>
                  <strong>{projectView === 'active' ? 'Çalışma alanındaki projeler' : 'Arşivlenmiş projeler'}</strong>
                  <span>{projects.length} proje</span>
                </div>
                <div className="project-view-switch" role="group" aria-label="Proje görünümü">
                  <button type="button" aria-pressed={projectView === 'active'} onClick={() => void loadProjects('active')}>Aktif</button>
                  <button type="button" aria-pressed={projectView === 'archived'} onClick={() => void loadProjects('archived')}>Arşiv</button>
                </div>
              </div>
              {loading ? (
                <ProjectGridSkeleton />
              ) : projects.length === 0 ? (
                <div className="large-empty empty-state">
                  <Icon name="folder" />
                  <strong>{projectView === 'active' ? 'Henüz proje bulunmuyor' : 'Arşivlenmiş proje yok'}</strong>
                  <span>{projectView === 'active' ? 'Oluşturduğunuz veya üyesi olduğunuz projeler burada görünür.' : 'Arşivlenen projeler bu alanda listelenir.'}</span>
                  {projectView === 'active' && hasModulePermission('projects','create') && (
                    <button type="button" className="primary-button compact-button" onClick={() => setProjectFormOpen(true)}>İlk projeyi oluştur</button>
                  )}
                </div>
              ) : (
                <div className="project-grid">
                  {projects.map((project) => {
                    const completed = Number(project.completedTaskCount ?? 0);
                    const total = Number(project.taskCount ?? 0);
                    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
                    return (
                      <button
                        type="button"
                        className={`project-card${project.archivedAt ? ' project-card-archived' : ''}`}
                        key={project.id}
                        onClick={() => void openProject(project.id)}
                        aria-label={`${project.name} projesini aç`}
                      >
                        <div className="project-card-top">
                          <span className={`project-status-badge project-status-${project.status}`}>{projectStatusLabel(project.status)}</span>
                          <span className="project-card-code">#{project.id.slice(0, 6).toUpperCase()}</span>
                        </div>
                        <h2>{project.name}</h2>
                        <p className="project-card-description">{project.description || 'Proje açıklaması eklenmemiş.'}</p>
                        <div className="project-card-dates">
                          <span>Başlangıç <strong>{dateLabel(project.startsOn ?? null)}</strong></span>
                          <span>Hedef <strong>{dateLabel(project.targetOn ?? null)}</strong></span>
                        </div>
                        <div className="project-progress-heading">
                          <span>Görev ilerlemesi</span>
                          <strong>{total > 0 ? `${progress}%` : 'Görev yok'}</strong>
                        </div>
                        <div className="project-progress-track" aria-label={`Tamamlanan görev: ${completed} / ${total}`}>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <div className="project-card-footer">
                          <span className="project-card-owner">
                            <EmployeeAvatar avatarKey={people.find((person) => person.id === project.ownerId)?.avatarKey} name={project.ownerName || 'Proje sahibi'} size="sm"/>
                            <span>{project.ownerName || 'Sahip bilgisi yok'}</span>
                          </span>
                          <span>{Number(project.memberCount ?? 0)} üye</span>
                          <span>{total} görev</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* User Management Section (Admin Only) */}
          {hasModulePermission('users') && section === 'users' && children}
        </main>
      </div>

      {/* Slide-over Task Form Drawer (Create / Edit) */}
      <Drawer
        isOpen={taskFormOpen}
        onClose={() => setTaskFormOpen(false)}
        size="md"
        badge={
          selected ? (
            <span className="project-chip">{selected.projectName ?? 'Genel Görev'}</span>
          ) : undefined
        }
        title={selected ? 'Görevi Düzenle' : 'Yeni Görev Oluştur'}
        subtitle={
          selected
            ? `Kayıt No: #${selected.id.slice(0, 8)}`
            : 'Görevi tanımlayın ve sorumlu atayın'
        }
        ariaLabelledBy="task-form-title"
        footer={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setTaskFormOpen(false)}
            >
              İptal
            </button>
            <button
              type="submit"
              form="task-form"
              className="primary-button"
              disabled={busy}
            >
              {busy ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          </>
        }
      >
        <form id="task-form" className="drawer-form" onSubmit={saveTask}>
          <div className="form-group">
            <label htmlFor="task-title">Görev başlığı</label>
            <input
              id="task-title"
              name="title"
              defaultValue={selected?.title ?? ''}
              maxLength={240}
              placeholder="Görev başlığını yazın…"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="task-description">Açıklama</label>
            <textarea
              id="task-description"
              name="description"
              defaultValue={selected?.description ?? ''}
              maxLength={8000}
              rows={4}
              placeholder="Görev ayrıntılarını belirtin…"
            />
          </div>

          <div className="form-pair">
            <div className="form-group">
              <label htmlFor="task-assignee">Sorumlu</label>
              <select
                id="task-assignee"
                name="assigneeId"
                defaultValue={selected?.assigneeId ?? user.id}
              >
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="task-project">Proje</label>
              <select id="task-project" name="projectId" defaultValue={selected?.projectId ?? ''}>
                <option value="">Proje yok</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-pair">
            <div className="form-group">
              <label htmlFor="task-status">Durum</label>
              <select id="task-status" name="status" defaultValue={selected?.status ?? 'open'}>
                {columns.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="task-priority">Öncelik</label>
              <select id="task-priority" name="priority" defaultValue={selected?.priority ?? 'normal'}>
                <option value="low">Düşük</option>
                <option value="normal">Normal</option>
                <option value="high">Yüksek</option>
                <option value="urgent">Acil</option>
              </select>
            </div>
          </div>

          <div className="form-pair">
            <div className="form-group">
              <label htmlFor="task-startsOn">Başlangıç tarihi</label>
              <input
                id="task-startsOn"
                name="startsOn"
                type="date"
                defaultValue={selected?.startsOn ?? ''}
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-dueOn">Son teslim tarihi</label>
              <input
                id="task-dueOn"
                name="dueOn"
                type="date"
                defaultValue={selected?.dueOn ?? ''}
              />
            </div>
          </div>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
        </form>
      </Drawer>

      {/* Slide-over Task Detail Drawer */}
      <Drawer
        isOpen={Boolean(selected && !taskFormOpen)}
        onClose={() => setSelected(null)}
        size="lg"
        badge={
          selected ? (
            <span className="project-chip">{selected.projectName ?? 'Genel Görev'}</span>
          ) : undefined
        }
        title={selected?.title ?? ''}
        subtitle={
          selected
            ? `Kayıt No: #${selected.id.slice(0, 8)} · Oluşturan: ${selected.creatorName}`
            : ''
        }
        ariaLabelledBy="task-detail-title"
        footer={
          selected && (
            <>
              {hasModulePermission('tasks',selected.archivedAt?'update':'delete')&&<button
                type="button"
                className="secondary-button"
                onClick={() => void archiveTask(selected, Boolean(selected.archivedAt))}
              >
                {selected.archivedAt ? 'Arşivden çıkar' : 'Arşivle'}
              </button>}
              {hasModulePermission('tasks','update')&&<button
                type="button"
                className="primary-button"
                onClick={() => setTaskFormOpen(true)}
              >
                Görevi düzenle
              </button>}
            </>
          )
        }
      >
        {selected && (
          <div className="task-detail-body">
            {/* Quick Status Bar */}
            <div className="drawer-quick-actions">
              <span className="quick-actions-label">Durum:</span>
              <div className="quick-status-buttons">
                {columns.map((col) => hasModulePermission('tasks','update') ? (
                  <button
                    key={col.value}
                    type="button"
                    className={`status-pill-btn${selected.status === col.value ? ' active' : ''}`}
                    onClick={() => void moveTask(selected, col.value)}
                  >
                    {col.label}
                  </button>
                ) : null)}
              </div>
            </div>

            <div className="detail-description-box">
              <h3>Açıklama</h3>
              <p className="detail-description">
                {selected.description || 'Açıklama belirtilmemiş.'}
              </p>
            </div>

            <dl className="detail-fields">
              <div>
                <dt>Öncelik</dt>
                <dd>
                  <span className={`priority-tag priority-${selected.priority}`}>
                    {priorityLabel(selected.priority)}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Sorumlu</dt>
                <dd className="detail-person">
                  <EmployeeAvatar avatarKey={people.find((person) => person.id === selected.assigneeId)?.avatarKey} name={selected.assigneeName} size="sm"/>
                  <span>{selected.assigneeName}</span>
                </dd>
              </div>
              <div>
                <dt>Oluşturan</dt>
                <dd className="detail-person">{selected.creatorName}</dd>
              </div>
              <div>
                <dt>Başlangıç tarihi</dt>
                <dd>{dateLabel(selected.startsOn)}</dd>
              </div>
              <div>
                <dt>Son teslim tarihi</dt>
                <dd className={isOverdue(selected.dueOn, selected.status) ? 'date-overdue' : ''}>
                  {dateLabel(selected.dueOn)}
                </dd>
              </div>
            </dl>

            {/* Task History / Audit Trail */}
            <div className="detail-history-section">
              <h3>Temel Görev Geçmişi</h3>
              {loadingTaskActivity ? (
                <TimelineSkeleton />
              ) : taskActivities.length === 0 ? (
                <p className="muted-line">Kayıtlı hareket bulunamadı.</p>
              ) : (
                <div className="task-timeline">
                  {taskActivities.map((act) => (
                    <div className="timeline-item" key={act.id}>
                      <div className="timeline-marker" />
                      <div className="timeline-content">
                        <span className="timeline-text">
                          <strong>{act.actorName ?? 'Bir kullanıcı'}</strong>{' '}
                          {activityLabel(act.action)}
                        </span>
                        <time className="timeline-time">{dateTimeLabel(act.occurredAt)}</time>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <section className="task-comments-section" aria-label="Görev yorumları">
              <div className="task-comments-heading">
                <div>
                  <h3>Yorumlar</h3>
                  <span>{taskComments.filter((comment) => !comment.deletedAt).length} yorum</span>
                </div>
              </div>

              {commentError && <p className="auth-error" role="alert">{commentError}</p>}

              {loadingTaskComments ? (
                <CommentListSkeleton />
              ) : taskComments.length === 0 ? (
                <p className="muted-line">Bu görevde henüz yorum yok.</p>
              ) : (
                <div className="task-comments-list">
                  {taskComments.map((comment) => (
                    <article className={`task-comment${comment.isMine ? ' task-comment-mine' : ''}`} key={comment.id}>
                      <div className="task-comment-meta">
                        <strong>{comment.authorName}</strong>
                        <time>{dateTimeLabel(comment.createdAt)}</time>
                        {comment.updatedAt !== comment.createdAt && !comment.deletedAt && (
                          <span className="task-comment-edited">Düzenlendi</span>
                        )}
                        {comment.isMine && !comment.deletedAt && !selected.archivedAt && (hasModulePermission('tasks','update')||hasModulePermission('tasks','delete')) && (
                          <div className="task-comment-actions">
                            {hasModulePermission('tasks','update')&&<button
                              type="button"
                              onClick={() => {
                                setEditingCommentId(comment.id);
                                setEditingCommentBody(comment.body);
                                setCommentError('');
                              }}
                              disabled={commentBusy}
                            >Düzenle</button>}
                            {hasModulePermission('tasks','delete')&&<button
                              type="button"
                              onClick={() => void removeTaskComment(comment)}
                              disabled={commentBusy}
                            >Sil</button>}
                          </div>
                        )}
                      </div>

                      {comment.deletedAt ? (
                        <p className="task-comment-deleted">Bu yorum silindi.</p>
                      ) : editingCommentId === comment.id ? (
                        <div className="task-comment-edit">
                          <textarea
                            value={editingCommentBody}
                            onChange={(event) => setEditingCommentBody(event.target.value)}
                            maxLength={4000}
                            rows={3}
                            aria-label="Yorumu düzenle"
                          />
                          <div className="task-comment-edit-actions">
                            <button type="button" className="secondary-button compact-button" onClick={() => {
                              setEditingCommentId(null);
                              setEditingCommentBody('');
                            }} disabled={commentBusy}>İptal</button>
                            <button type="button" className="primary-button compact-button" onClick={() => void saveTaskComment(comment)} disabled={commentBusy || !editingCommentBody.trim()}>
                              {commentBusy ? 'Kaydediliyor…' : 'Kaydet'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="task-comment-body">{comment.body}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}

              {!selected.archivedAt && hasModulePermission('tasks','create') ? (
                <form className="task-comment-compose" onSubmit={submitTaskComment}>
                  <label htmlFor="task-comment-draft">Yorum ekle</label>
                  <textarea
                    id="task-comment-draft"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    maxLength={4000}
                    rows={3}
                    placeholder="Görevle ilgili notunuzu yazın…"
                    required
                  />
                  <div className="task-comment-compose-footer">
                    <span>{commentDraft.length}/4000</span>
                    <button type="submit" className="primary-button compact-button" disabled={commentBusy || !commentDraft.trim()}>
                      {commentBusy ? 'Gönderiliyor…' : 'Yorum gönder'}
                    </button>
                  </div>
                </form>
              ) : selected.archivedAt ? (
                <p className="muted-line">Arşivlenmiş görevlerde yorum eklenemez.</p>
              ) : null}
            </section>
          </div>
        )}
      </Drawer>

      {/* Slide-over Project Create Drawer */}
      <Drawer
        isOpen={projectFormOpen}
        onClose={() => setProjectFormOpen(false)}
        size="md"
        title="Yeni Proje Oluştur"
        subtitle="Projeyi adlandırın ve ekip üyelerini belirleyin"
        ariaLabelledBy="project-form-title"
        footer={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setProjectFormOpen(false)}
            >
              İptal
            </button>
            <button
              type="submit"
              form="project-form"
              className="primary-button"
              disabled={busy}
            >
              {busy ? 'Kaydediliyor…' : 'Projeyi oluştur'}
            </button>
          </>
        }
      >
        <form id="project-form" className="drawer-form" onSubmit={saveProject}>
          <div className="form-group">
            <label htmlFor="project-name">Proje adı</label>
            <input
              id="project-name"
              name="name"
              maxLength={160}
              placeholder="Proje adını yazın…"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="project-desc">Açıklama</label>
            <textarea
              id="project-desc"
              name="description"
              maxLength={4000}
              rows={4}
              placeholder="Proje kapsamını kısaca açıklayın…"
            />
          </div>

          <div className="form-pair">
            <div className="form-group">
              <label htmlFor="project-status">Başlangıç durumu</label>
              <select id="project-status" name="status" defaultValue="planning">
                <option value="planning">Hazırlık</option>
                <option value="active">Aktif</option>
                <option value="on_hold">Beklemede</option>
                <option value="completed">Tamamlandı</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="project-starts-on">Başlangıç tarihi</label>
              <input id="project-starts-on" name="startsOn" type="date" />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="project-target-on">Hedef tarih</label>
            <input id="project-target-on" name="targetOn" type="date" />
          </div>

          <fieldset className="member-picker">
            <legend>Proje Üyeleri</legend>
            {people
              .filter((person) => person.id !== user.id)
              .map((person) => (
                <label key={person.id} className="member-checkbox">
                  <input type="checkbox" name="members" value={person.id} />
                  <span>{person.displayName}</span>
                </label>
              ))}
          </fieldset>
        </form>
      </Drawer>

      {/* Project Detail and Edit Workspace */}
      <Drawer
        isOpen={projectDetailOpen}
        onClose={() => {
          setProjectDetailOpen(false);
          setProjectEditing(false);
        }}
        size="xl"
        title={projectDetail?.project.name ?? 'Proje ayrıntıları'}
        subtitle={projectDetail ? ('Proje sahibi: ' + projectDetail.project.ownerName + ' · Kayıt No: #' + projectDetail.project.id.slice(0, 8)) : 'Proje bilgileri'}
        ariaLabelledBy="project-detail-title"
        footer={
          projectDetail && !projectLoading ? (
            projectEditing ? (
              <>
                <button type="button" className="secondary-button" onClick={() => setProjectEditing(false)}>Vazgeç</button>
                {hasModulePermission('projects','update')&&<button type="submit" form="project-edit-form" className="primary-button" disabled={busy}>
                  {busy ? 'Kaydediliyor…' : 'Değişiklikleri kaydet'}
                </button>}
              </>
            ) : (
              <>
                <button type="button" className="secondary-button" onClick={() => setProjectDetailOpen(false)}>Kapat</button>
                {(projectDetail.project.createdBy === user.id || projectDetail.project.ownerId === user.id || user.roles.includes('system_admin')) && (
                  <>
                    {hasModulePermission('projects',projectDetail.project.archivedAt||projectDetail.project.status==='archived'?'update':'delete')&&<button type="button" className="secondary-button" onClick={() => void toggleProjectArchive()} disabled={busy}>
                      {projectDetail.project.archivedAt || projectDetail.project.status === 'archived' ? 'Arşivden çıkar' : 'Projeyi arşivle'}
                    </button>}
                    {!projectDetail.project.archivedAt && projectDetail.project.status !== 'archived' && hasModulePermission('projects','update') && (
                      <button type="button" className="primary-button" onClick={() => {
                        setProjectError('');
                        setProjectEditing(true);
                      }}>Projeyi düzenle</button>
                    )}
                  </>
                )}
              </>
            )
          ) : undefined
        }
      >
        {projectError && <p className="auth-error" role="alert">{projectError}</p>}
        {projectLoading ? (
          <ProjectDetailSkeleton />
        ) : projectDetail ? (
          projectEditing ? (
            <form id="project-edit-form" className="drawer-form project-edit-form" onSubmit={saveProjectDetails}>
              <div className="form-group">
                <label htmlFor="project-edit-name">Proje adı</label>
                <input id="project-edit-name" name="name" defaultValue={projectDetail.project.name} maxLength={160} required />
              </div>
              <div className="form-group">
                <label htmlFor="project-edit-description">Proje amacı ve kapsamı</label>
                <textarea id="project-edit-description" name="description" defaultValue={projectDetail.project.description} maxLength={4000} rows={4} />
              </div>
              <div className="form-pair">
                <div className="form-group">
                  <label htmlFor="project-edit-status">Proje durumu</label>
                  <select id="project-edit-status" name="status" defaultValue={projectDetail.project.status}>
                    <option value="planning">Hazırlık</option>
                    <option value="active">Aktif</option>
                    <option value="on_hold">Beklemede</option>
                    <option value="completed">Tamamlandı</option>
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="project-edit-owner">Proje sahibi</label>
                  <select id="project-edit-owner" name="ownerId" defaultValue={projectDetail.project.ownerId}>
                    {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-pair">
                <div className="form-group">
                  <label htmlFor="project-edit-starts">Başlangıç tarihi</label>
                  <input id="project-edit-starts" name="startsOn" type="date" defaultValue={projectDetail.project.startsOn ?? ''} />
                </div>
                <div className="form-group">
                  <label htmlFor="project-edit-target">Hedef tarih</label>
                  <input id="project-edit-target" name="targetOn" type="date" defaultValue={projectDetail.project.targetOn ?? ''} />
                </div>
              </div>
              <fieldset className="member-picker project-edit-members">
                <legend>Proje üyeleri</legend>
                {people.map((person) => (
                  <label key={person.id} className="member-checkbox">
                    <input
                      type="checkbox"
                      name="members"
                      value={person.id}
                      defaultChecked={projectDetail.members.some((member) => member.id === person.id)}
                    />
                    <span>{person.displayName}{person.id === projectDetail.project.ownerId ? ' · Proje sahibi' : ''}</span>
                  </label>
                ))}
              </fieldset>
              <p className="field-hint">Proje sahibi, üye listesinden çıkarılamaz. Kaydedilen üyelik değişiklikleri proje geçmişine yazılır.</p>
            </form>
          ) : (
            <div className="project-detail-body">
              <div className="project-detail-hero">
                <div className="project-detail-hero-main">
                  <span className={'project-status-badge project-status-' + projectDetail.project.status}>
                    {projectStatusLabel(projectDetail.project.status)}
                  </span>
                  {projectDetail.project.archivedAt && <span className="project-archived-tag">Arşivlenmiş</span>}
                  <h3>{projectDetail.project.name}</h3>
                  <p>{projectDetail.project.description || 'Bu proje için açıklama eklenmemiş.'}</p>
                </div>
                <div className="project-detail-progress">
                  <strong>{projectDetail.project.taskCount > 0
                    ? Math.round((projectDetail.project.completedTaskCount / projectDetail.project.taskCount) * 100) + '%'
                    : '—'}</strong>
                  <span>Görev tamamlanma</span>
                  <div className="project-progress-track">
                    <span style={{ width: projectDetail.project.taskCount > 0
                      ? Math.round((projectDetail.project.completedTaskCount / projectDetail.project.taskCount) * 100) + '%'
                      : '0%' }} />
                  </div>
                </div>
              </div>

              {projectDetail.project.status === 'archived' && !projectDetail.project.statusBeforeArchive && (
                <section className="project-legacy-restore" aria-label="Eski proje arşivini geri yükleme">
                  <div>
                    <strong>Arşiv öncesi durum kaydı bulunmuyor</strong>
                    <p>Bu proje önceki sürümde arşivlenmiş. Geri yüklemek için yeni durumunu seç.</p>
                  </div>
                  <label>
                    <span>Geri yüklenecek durum</span>
                    <select value={projectRestoreStatus} onChange={(event) => setProjectRestoreStatus(event.target.value as typeof projectRestoreStatus)}>
                      <option value="">Durum seçin…</option>
                      <option value="planning">Hazırlık</option>
                      <option value="active">Aktif</option>
                      <option value="on_hold">Beklemede</option>
                      <option value="completed">Tamamlandı</option>
                    </select>
                  </label>
                </section>
              )}

              <div className="project-detail-stats">
                <div><span>Toplam görev</span><strong>{projectDetail.project.taskCount}</strong></div>
                <div><span>Tamamlanan</span><strong>{projectDetail.project.completedTaskCount}</strong></div>
                <div><span>Proje üyeleri</span><strong>{projectDetail.members.length}</strong></div>
                <div><span>Hedef tarih</span><strong>{dateLabel(projectDetail.project.targetOn ?? null)}</strong></div>
              </div>

              <div className="project-tabs" role="tablist" aria-label="Proje bölümleri">
                <button type="button" role="tab" aria-selected={projectTab === 'overview'} onClick={() => setProjectTab('overview')}>Genel bakış</button>
                <button type="button" role="tab" aria-selected={projectTab === 'tasks'} onClick={() => setProjectTab('tasks')}>Görevler <span>{projectDetail.tasks.length}</span></button>
                <button type="button" role="tab" aria-selected={projectTab === 'members'} onClick={() => setProjectTab('members')}>Üyeler <span>{projectDetail.members.length}</span></button>
                {hasModulePermission('eced') && <button type="button" role="tab" aria-selected={projectTab === 'ced'} onClick={() => setProjectTab('ced')}>ÇED Süreci <span>Takip</span></button>}
              </div>

              {projectTab === 'overview' && (
                <div className="project-tab-panel" role="tabpanel">
                  <div className="project-overview-grid">
                    <section className="project-info-panel">
                      <h4>Proje bilgileri</h4>
                      <dl>
                        <div><dt>Proje sahibi</dt><dd>{projectDetail.project.ownerName}</dd></div>
                        <div><dt>Oluşturan</dt><dd>{projectDetail.project.creatorName}</dd></div>
                        <div><dt>Başlangıç</dt><dd>{dateLabel(projectDetail.project.startsOn ?? null)}</dd></div>
                        <div><dt>Hedef tarih</dt><dd>{dateLabel(projectDetail.project.targetOn ?? null)}</dd></div>
                      </dl>
                    </section>
                    <section className="project-info-panel">
                      <h4>Son değişiklikler</h4>
                      {projectDetail.activity.length ? (
                        <div className="project-activity-list">
                          {projectDetail.activity.slice(0, 8).map((event) => (
                            <div className="project-activity-row" key={event.id}>
                              <span className="project-activity-dot" />
                              <div><strong>{event.actorName ?? 'Bir kullanıcı'}</strong><span>{projectEventLabel(event.eventType)}</span></div>
                              <time>{dateTimeLabel(event.createdAt)}</time>
                            </div>
                          ))}
                        </div>
                      ) : <p className="muted-line">Proje hareketi bulunmuyor.</p>}
                    </section>
                  </div>
                </div>
              )}

              {projectTab === 'tasks' && (
                <div className="project-tab-panel" role="tabpanel">
                  {projectDetail.tasks.length ? (
                    <div className="project-task-list">
                      {projectDetail.tasks.map((task) => (
                        <button type="button" className="project-task-row" key={task.id} onClick={() => void openProjectTask(task.id)}>
                          <span className="project-task-title">{task.title}</span>
                          <span className={'project-task-status project-task-status-' + task.status}>{columns.find((column) => column.value === task.status)?.label ?? task.status}</span>
                          <span className="project-task-assignee">{task.assigneeName}</span>
                          <time>{dateLabel(task.dueOn)}</time>
                        </button>
                      ))}
                    </div>
                  ) : <div className="empty-state"><strong>Bu projeye bağlı görev yok</strong><span>Görev oluştururken bu projeyi seçtiğinizde burada listelenir.</span></div>}
                </div>
              )}

              {projectTab === 'members' && (
                <div className="project-tab-panel" role="tabpanel">
                  <div className="project-member-list">
                    {projectDetail.members.map((member) => (
                      <div className="project-member-row" key={member.id}>
                        <EmployeeAvatar avatarKey={people.find((person) => person.id === member.id)?.avatarKey} name={member.displayName} size="md"/>
                        <div><strong>{member.displayName}</strong><span>{member.username}</span></div>
                        {member.isOwner && <span className="project-owner-label">Proje sahibi</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projectTab === 'ced' && hasModulePermission('eced') && (
                <div className="project-tab-panel" role="tabpanel">
                  <CedWorkspace
                    projectId={projectDetail.project.id}
                    request={request}
                    canCreate={hasModulePermission('eced','create')}
                    canUpdate={hasModulePermission('eced','update')}
                    canViewOpinions={hasModulePermission('institution_opinions')}
                    canCreateOpinions={hasModulePermission('institution_opinions','create')}
                    canUpdateOpinions={hasModulePermission('institution_opinions','update')}
                  />
                </div>
              )}
            </div>
          )
        ) : (
          <div className="empty-state"><strong>Proje açılamadı</strong><span>Projeyi yeniden açmayı deneyin.</span></div>
        )}
      </Drawer>

      {/* Slide-over Password Change Drawer */}
      <Drawer
        isOpen={passwordFormOpen}
        onClose={() => setPasswordFormOpen(false)}
        size="sm"
        title="Parolamı Değiştir"
        subtitle="Hesap güvenliğiniz için yeni parola belirleyin"
        ariaLabelledBy="password-form-title"
        footer={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPasswordFormOpen(false)}
            >
              İptal
            </button>
            <button
              type="submit"
              form="password-change-form"
              className="primary-button"
              disabled={busy}
            >
              {busy ? 'Güncelleniyor…' : 'Parolayı güncelle'}
            </button>
          </>
        }
      >
        <form id="password-change-form" className="drawer-form" onSubmit={handlePasswordChange}>
          <div className="form-group">
            <label htmlFor="user-current-pw">Mevcut parola</label>
            <input
              id="user-current-pw"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              placeholder="Mevcut parolanızı girin"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="user-new-pw">Yeni parola</label>
            <input
              id="user-new-pw"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder="En az 8 karakter"
              minLength={8}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="user-confirm-pw">Yeni parola (tekrar)</label>
            <input
              id="user-confirm-pw"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Yeni parolayı tekrar girin"
              minLength={8}
              required
            />
          </div>

          {passwordError && (
            <p className="auth-error" role="alert">
              {passwordError}
            </p>
          )}
          {passwordSuccess && (
            <p className="workspace-success" role="status">
              {passwordSuccess}
            </p>
          )}
        </form>
      </Drawer>
    </div>
  );
}

function Icon({ name }: { name: 'home' | 'check' | 'users' | 'folder' | 'message' | 'search' | 'bell' | 'menu' | 'calendar-days' }) {
  let path = null;
  if (name === 'home') {
    path = (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v11h14V9M9 20v-6h6v6" />
      </>
    );
  } else if (name === 'check') {
    path = (
      <>
        <path d="M5 12.5 9.2 17 19 7" />
        <path d="M21 12a9 9 0 1 1-5.3-8.2" />
      </>
    );
  } else if (name === 'users') {
    path = (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    );
  } else if (name === 'message') {
    path = (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-6.5A7.5 7.5 0 0 1 10.5 7h2A7.5 7.5 0 0 1 20 14.5z" />
        <path d="M8 12h8M8 15h5" />
      </>
    );
  } else if (name === 'calendar-days') {
    path = (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M16 3v4M8 3v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
      </>
    );
  } else if (name === 'folder') {
    path = (
      <>
        <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
        <path d="M3.5 9h17" />
      </>
    );
  } else if (name === 'search') {
    path = (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    );
  } else if (name === 'bell') {
    path = (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    );
  } else if (name === 'menu') {
    path = (
      <>
        <line x1="4" y1="6" x2="20" y2="6" />
        <line x1="4" y1="12" x2="20" y2="12" />
        <line x1="4" y1="18" x2="20" y2="18" />
      </>
    );
  }

  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}
