import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Person, Project } from './workspace';
import { Drawer } from './drawer';

type CalendarView = 'month' | 'week' | 'day' | 'agenda';
type CalendarScope = 'all'|'personal'|'corporate';
type EventType = 'meeting' | 'event' | 'reminder' | 'deadline' | 'presentation' | 'site_visit' | 'hkt' | 'idk';
type Visibility = 'personal' | 'shared' | 'project';

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  eventType: EventType;
  visibility: Visibility;
  projectId: string | null;
  projectName: string | null;
  projectOwnerId: string | null;
  allDay: boolean;
  startsAt: string | null;
  endsAt: string | null;
  startsOn: string | null;
  endsOn: string | null;
  location: string;
  version: number;
  createdBy: string;
  creatorName: string;
  attendeeIds: string[];
  attendees: Person[];
}

interface Milestone {
  id: string;
  kind: 'task_start' | 'task_due' | 'project_start' | 'project_target' | 'project_ced_stage_due' | 'project_institution_opinion_due' | 'project_idk_meeting';
  entityId: string;
  title: string;
  date: string;
  status: string | null;
  priority: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
}

interface CalendarDraft {
  title: string;
  description: string;
  eventType: EventType;
  visibility: Visibility;
  projectId: string;
  allDay: boolean;
  startsOn: string;
  endsOn: string;
  startsAt: string;
  endsAt: string;
  location: string;
  attendeeIds: string[];
}

type Request = (path: string, method?: string, data?: unknown) => Promise<Record<string, any>>;

const weekdayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const eventTypeLabels: Record<EventType, string> = {
  meeting: 'Toplantı',
  event: 'Etkinlik',
  reminder: 'Hatırlatma',
  deadline: 'Teslim / Son tarih',
  presentation: 'Sunum',
  site_visit: 'Yer Görme',
  hkt: 'Halkın Katılım Toplantısı (HKT)',
  idk: 'İDK Toplantısı',
};
const visibilityLabels: Record<Visibility, string> = {
  personal: 'Kişisel',
  shared: 'Kurumsal',
  project: 'Proje',
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateAtNoon(value: string): Date {
  return new Date(value + 'T12:00:00.000Z');
}

function addDays(value: string, amount: number): string {
  const date = dateAtNoon(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return dateKey(date);
}

function monthStart(value: string): string {
  return value.slice(0, 7) + '-01';
}

function monthEndExclusive(value: string): string {
  const date = dateAtNoon(monthStart(value));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return dateKey(date);
}

function mondayOf(value: string): string {
  const date = dateAtNoon(value);
  const day = date.getUTCDay();
  return addDays(value, -(day === 0 ? 6 : day - 1));
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }): string {
  return new Intl.DateTimeFormat('tr-TR', { ...options, timeZone: 'UTC' }).format(dateAtNoon(value));
}

function instantDateKey(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function instantTime(value: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function istanbulToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function eventOccursOn(event: CalendarEvent, day: string): boolean {
  if (event.allDay) return Boolean(event.startsOn && event.endsOn && event.startsOn <= day && event.endsOn >= day);
  if (!event.startsAt || !event.endsAt) return false;
  const next = addDays(day, 1);
  return instantDateKey(event.startsAt) < next && instantDateKey(event.endsAt) >= day &&
    (instantDateKey(event.endsAt) !== day || instantTime(event.endsAt) !== '00:00');
}

function initialDraft(day: string): CalendarDraft {
  return {
    title: '',
    description: '',
    eventType: 'meeting',
    visibility: 'personal',
    projectId: '',
    allDay: false,
    startsOn: day,
    endsOn: day,
    startsAt: day + 'T09:00',
    endsAt: day + 'T10:00',
    location: '',
    attendeeIds: [],
  };
}

function toIstanbulInstant(value: string): string {
  if (!value) return '';
  return new Date(value + ':00+03:00').toISOString();
}

function draftFromEvent(event: CalendarEvent): CalendarDraft {
  return {
    title: event.title,
    description: event.description,
    eventType: event.eventType,
    visibility: event.visibility,
    projectId: event.projectId ?? '',
    allDay: event.allDay,
    startsOn: event.startsOn ?? '',
    endsOn: event.endsOn ?? '',
    startsAt: event.startsAt ? instantDateTimeInput(event.startsAt) : '',
    endsAt: event.endsAt ? instantDateTimeInput(event.endsAt) : '',
    location: event.location,
    attendeeIds: event.attendeeIds ?? [],
  };
}

function instantDateTimeInput(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day') + 'T' + part('hour') + ':' + part('minute');
}

function entryTime(event: CalendarEvent): string {
  return event.allDay || !event.startsAt ? 'Tüm gün' : instantTime(event.startsAt);
}

function milestoneLabel(item: Milestone): string {
  return ({
    task_start: 'Görev başlangıcı',
    task_due: 'Görev teslimi',
    project_start: 'Proje başlangıcı',
    project_target: 'Proje hedefi',
    project_ced_stage_due: 'ÇED süreç aşaması',
    project_institution_opinion_due: 'Kurum görüşü son tarihi',
    project_idk_meeting: 'İDK / toplantı',
  })[item.kind];
}

export function CalendarWorkspace({
  request,
  people,
  projects,
  currentUserId,
  canCreate,
  canUpdate,
  canDelete,
  canViewTasks,
  canViewProjects,
  canViewCed,
  canViewOpinions,
  onTaskOpen,
  onProjectOpen,
}: {
  request: Request;
  people: Person[];
  projects: Project[];
  currentUserId: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canViewTasks: boolean;
  canViewProjects: boolean;
  canViewCed: boolean;
  canViewOpinions: boolean;
  onTaskOpen: (taskId: string) => void;
  onProjectOpen: (projectId: string) => void;
}) {
  const today = useMemo(() => istanbulToday(), []);
  const [view, setView] = useState<CalendarView>('month');
  const [scope,setScope]=useState<CalendarScope>('all');
  const [selectedDate, setSelectedDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [draft, setDraft] = useState<CalendarDraft>(() => initialDraft(today));
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const range = useMemo(() => {
    if (view === 'week') {
      const from = mondayOf(selectedDate);
      return { from, to: addDays(from, 7) };
    }
    if (view === 'day') return { from: selectedDate, to: addDays(selectedDate, 1) };
    if (view === 'agenda') return { from: month + '-01', to: monthEndExclusive(month + '-01') };
    const from = mondayOf(month + '-01');
    return { from, to: addDays(from, 42) };
  }, [view, selectedDate, month]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    request('calendar?from=' + range.from + '&to=' + range.to)
      .then((result) => {
        if (cancelled) return;
        setEvents(Array.isArray(result.events) ? result.events as CalendarEvent[] : []);
        setMilestones(Array.isArray(result.milestones) ? result.milestones as Milestone[] : []);
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Takvim kayıtları alınamadı.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [request, range.from, range.to, refreshKey]);

  const days = useMemo(() => {
    if (view === 'agenda') return [];
    const count = view === 'month' ? 42 : view === 'week' ? 7 : 1;
    return Array.from({ length: count }, (_, index) => addDays(range.from, index));
  }, [view, range.from]);

  const scopedEvents=useMemo(()=>events.filter(event=>scope==='all'||(scope==='personal'?event.visibility==='personal':event.visibility==='shared')),[events,scope]);
  const scopedMilestones=useMemo(()=>scope==='personal'?[]:milestones,[milestones,scope]);

  const allEntries = useMemo(() => {
    const rows: Array<{ key: string; date: string; event?: CalendarEvent; milestone?: Milestone }> = [];
    for (const event of scopedEvents) {
      for (let i = 0; i < 32; i += 1) {
        const day = event.allDay
          ? addDays(event.startsOn ?? range.from, i)
          : addDays(instantDateKey(event.startsAt ?? range.from + 'T00:00:00Z'), i);
        if (day >= range.to) break;
        if (day < range.from) continue;
        if (eventOccursOn(event, day)) rows.push({ key: event.id + ':' + day, date: day, event });
        if (event.allDay && event.endsOn && day >= event.endsOn) break;
        if (!event.allDay && event.endsAt && instantDateKey(event.endsAt) <= day) break;
      }
    }
    for (const milestone of scopedMilestones) {
      if (milestone.date >= range.from && milestone.date < range.to) {
        rows.push({ key: milestone.id, date: milestone.date, milestone });
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date) ||
      (a.event?.allDay === b.event?.allDay ? 0 : a.event?.allDay ? -1 : 1) ||
      (a.event?.startsAt ?? '').localeCompare(b.event?.startsAt ?? '') ||
      (a.event?.title ?? a.milestone?.title ?? '').localeCompare(b.event?.title ?? b.milestone?.title ?? '', 'tr'));
  }, [scopedEvents, scopedMilestones, range.from, range.to]);

  const entriesForDay = (day: string) => allEntries.filter((entry) => entry.date === day);
  const visibleProjects = projects.filter((project) => project.status !== 'archived' && !project.archivedAt);
  const canManageSelectedEvent = Boolean(selectedEvent && (selectedEvent.createdBy === currentUserId || selectedEvent.projectOwnerId === currentUserId));

  function changeSelectedDate(day: string) {
    setSelectedDate(day);
    setMonth(day.slice(0, 7));
    setSelectedEvent(null);
    setFormOpen(false);
  }

  function goToday() {
    setSelectedDate(today);
    setMonth(today.slice(0, 7));
  }

  function moveRange(direction: number) {
    if (view === 'day') {
      changeSelectedDate(addDays(selectedDate, direction));
      return;
    }
    if (view === 'week') {
      changeSelectedDate(addDays(selectedDate, direction * 7));
      return;
    }
    const date = dateAtNoon(month + '-01');
    date.setUTCMonth(date.getUTCMonth() + direction);
    const next = dateKey(date).slice(0, 7);
    setMonth(next);
    setSelectedDate(next + '-01');
  }

  function showDayPanel(day: string) {
    changeSelectedDate(day);
    setDayPanelOpen(true);
  }

  function openCreate(day = selectedDate, eventType: EventType = 'meeting') {
    if (!canCreate) return;
    setSelectedEvent(null);
    setEditingEvent(null);
    setDraft({ ...initialDraft(day), eventType });
    setFormError('');
    setFormOpen(true);
  }

  function openEdit(event: CalendarEvent) {
    if (!canUpdate) return;
    setSelectedEvent(event);
    setEditingEvent(event);
    setDraft(draftFromEvent(event));
    setFormError('');
    setFormOpen(true);
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!editingEvent && !canCreate) || (editingEvent && !canUpdate)) return;
    setBusy(true);
    setFormError('');
    const payload = {
      title: draft.title,
      description: draft.description,
      eventType: draft.eventType,
      visibility: draft.visibility,
      projectId: draft.visibility === 'project' ? draft.projectId || null : null,
      allDay: draft.allDay,
      startsAt: draft.allDay ? null : toIstanbulInstant(draft.startsAt),
      endsAt: draft.allDay ? null : toIstanbulInstant(draft.endsAt),
      startsOn: draft.allDay ? draft.startsOn : null,
      endsOn: draft.allDay ? draft.endsOn : null,
      location: draft.location,
      attendeeIds: draft.visibility === 'personal' ? [] : draft.attendeeIds,
      ...(editingEvent ? { version: editingEvent.version } : {}),
    };
    try {
      await request(
        editingEvent ? 'calendar/events/' + editingEvent.id : 'calendar/events',
        editingEvent ? 'PATCH' : 'POST',
        payload,
      );
      setFormOpen(false);
      setEditingEvent(null);
      setSelectedEvent(null);
      setNotice(editingEvent ? 'Etkinlik güncellendi.' : 'Etkinlik oluşturuldu.');
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Etkinlik kaydedilemedi.');
    } finally {
      setBusy(false);
    }
  }

  async function archiveEvent(event: CalendarEvent) {
    if (!canDelete || busy) return;
    if (!window.confirm('Bu etkinliği arşivlemek istiyor musunuz?')) return;
    setBusy(true);
    setError('');
    try {
      await request('calendar/events/' + event.id + '/archive', 'POST', { version: event.version });
      setSelectedEvent(null);
      setFormOpen(false);
      setNotice('Etkinlik arşivlendi.');
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Etkinlik arşivlenemedi.');
    } finally {
      setBusy(false);
    }
  }

  function openEntry(entry: { event?: CalendarEvent; milestone?: Milestone }) {
    if (entry.event) {
      setSelectedEvent(entry.event);
      setFormOpen(false);
      setEditingEvent(null);
      return;
    }
    if (entry.milestone?.kind.startsWith('task_')) onTaskOpen(entry.milestone.entityId);
    if (entry.milestone?.kind.startsWith('project_') && entry.milestone.projectId) onProjectOpen(entry.milestone.projectId);
  }

  function rangeTitle(): string {
    if (view === 'day') return formatDate(selectedDate);
    if (view === 'week') {
      const end = addDays(range.to, -1);
      return formatDate(range.from, { day: 'numeric', month: 'short' }) + ' – ' +
        formatDate(end, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(dateAtNoon(month + '-01'));
  }

  function renderEntry(entry: { key: string; event?: CalendarEvent; milestone?: Milestone }, compact = false) {
    if (entry.event) {
      const event = entry.event;
      return (
        <button
          key={entry.key}
          type="button"
          className={'calendar-entry calendar-entry-' + event.eventType + (compact ? ' compact' : '')}
          onClick={(clickEvent) => { clickEvent.stopPropagation(); setDayPanelOpen(false); openEntry(entry); }}
          title={event.title}
        >
          <span className="calendar-entry-time">{entryTime(event)}</span>
          <span className="calendar-entry-title">{event.title}</span>
        </button>
      );
    }
    const item = entry.milestone!;
    return (
      <button
        key={entry.key}
        type="button"
        className={'calendar-entry calendar-entry-milestone ' + item.kind + (compact ? ' compact' : '')}
        onClick={(clickEvent) => { clickEvent.stopPropagation(); openEntry(entry); }}
        title={milestoneLabel(item) + ': ' + item.title}
      >
        <span className="calendar-entry-time">{item.kind.startsWith('task_') ? 'Görev' : item.kind === 'project_idk_meeting' ? 'İDK' : item.kind === 'project_institution_opinion_due' ? 'Kurum' : item.kind === 'project_ced_stage_due' ? 'ÇED' : 'Proje'}</span>
        <span className="calendar-entry-title">{item.title}</span>
      </button>
    );
  }

  return (
    <section className="calendar-workspace" aria-label="Takvim">
      <header className="calendar-toolbar">
        <div className="calendar-heading">
          <div>
            <span className="calendar-eyebrow">PLANLAMA</span>
            <h1>Takvim</h1>
            <p>Etkinlikler, görev tarihleri ve proje kilometre taşları</p>
          </div>

        </div>
        <div className="calendar-controls">
          <div className="calendar-range-controls">
            <button type="button" className="calendar-icon-button" aria-label="Önceki dönem" onClick={() => moveRange(-1)}>‹</button>
            <button type="button" className="calendar-today-button" onClick={goToday}>Bugün</button>
            <button type="button" className="calendar-icon-button" aria-label="Sonraki dönem" onClick={() => moveRange(1)}>›</button>
            <h2>{rangeTitle()}</h2>
          </div>
          <div className="calendar-view-switch" role="group" aria-label="Takvim görünümü">
            {([
              ['month', 'Ay'],
              ['week', 'Hafta'],
              ['day', 'Gün'],
              ['agenda', 'Ajanda'],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={view === value} onClick={() => setView(value)}>{label}</button>
            ))}
          </div>
        </div>
      </header>

      <div className="calendar-scope-switch" role="group" aria-label="Takvim kapsamı">
        <span>Takvimler</span>
        {([
          ['all','Tümü'],
          ['personal','Kişisel'],
          ['corporate','Kurumsal'],
        ] as const).map(([value,label])=><button key={value} type="button" aria-pressed={scope===value} onClick={()=>setScope(value)}>{label}</button>)}
      </div>

      {error && <p className="calendar-error" role="alert">{error}</p>}
      {notice && <p className="calendar-notice" role="status">{notice}</p>}

      <div className="calendar-main-grid">
        <div className="calendar-primary">
          {view !== 'agenda' ? (
            <div className={'calendar-days-grid calendar-days-' + view} style={{ gridTemplateColumns: 'repeat(' + (view === 'month' ? 7 : days.length) + ', minmax(0, 1fr))' }}>
              {view !== 'day' && weekdayNames.map((name) => <div className="calendar-weekday" key={name}>{name}</div>)}
              {days.map((day) => {
                const sameMonth = day.slice(0, 7) === month;
                const entries = entriesForDay(day);
                return (
                  <div
                    key={day}
                    className={'calendar-day-cell' + (view === 'month' && !sameMonth ? ' outside-month' : '') +
                      (day === selectedDate ? ' selected-day' : '') + (day === today ? ' is-today' : '')}
                  >
                    <button
                      type="button"
                      className="calendar-day-select"
                      onClick={(clickEvent) => { clickEvent.stopPropagation(); showDayPanel(day); }}
                      aria-label={formatDate(day) + ', ' + entries.length + ' kayıt'}
                      aria-pressed={day === selectedDate}
                    >
                      <span className="calendar-day-number">{Number(day.slice(-2))}</span>
                      <span className="calendar-day-name">{formatDate(day, { weekday: 'short' })}</span>
                      <span className="calendar-day-count">{entries.length > 0 ? entries.length + ' kayıt' : ''}</span>
                    </button>
                    <div className="calendar-cell-entries">
                      {entries.slice(0, view === 'month' ? 3 : 12).map((entry) => renderEntry(entry, view === 'month'))}
                      {view === 'month' && entries.length > 3 && <span className="calendar-more">+{entries.length - 3} kayıt daha</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="calendar-agenda-list">
              {allEntries.length === 0 && !loading ? (
                <div className="calendar-empty">
                  <strong>Bu dönemde kayıt yok</strong>
                  <span>Etkinlik oluşturabilir veya başka bir tarihe geçebilirsiniz.</span>
                </div>
              ) : allEntries.map((entry) => (
                <div className="calendar-agenda-row" key={entry.key}>
                  <div className="calendar-agenda-date">
                    <strong>{formatDate(entry.date, { day: '2-digit' })}</strong>
                    <span>{formatDate(entry.date, { weekday: 'short', month: 'short' })}</span>
                  </div>
                  {renderEntry(entry)}
                </div>
              ))}
            </div>
          )}
          {loading && <div className="calendar-loading" role="status">Takvim kayıtları yükleniyor…</div>}
          <div className="calendar-legend" aria-label="Takvim işaretleri">
            <span><i className="legend-dot event-meeting" /> Toplantı</span>
            <span><i className="legend-dot event-event" /> Etkinlik</span>
            <span><i className="legend-dot event-reminder" /> Hatırlatma</span>
            <span><i className="legend-dot event-deadline" /> Teslim / son tarih</span>
            {(canViewTasks || canViewProjects) && <span><i className="legend-dot event-milestone" /> Görev / proje tarihleri</span>}
            {(canViewCed || canViewOpinions) && <span><i className="legend-dot event-ced-milestone" /> ÇED / kurum / İDK tarihleri</span>}
          </div>
        </div>

        <aside className="calendar-side-panel">
          {formOpen ? (
            <form className="calendar-event-form" onSubmit={(event) => void saveEvent(event)}>
              <div className="calendar-side-heading">
                <div>
                  <span className="calendar-eyebrow">{editingEvent ? 'ETKİNLİK DÜZENLE' : 'YENİ KAYIT'}</span>
                  <h2>{editingEvent ? 'Etkinliği düzenle' : 'Etkinlik oluştur'}</h2>
                </div>
                <button type="button" className="calendar-icon-button" aria-label="Formu kapat" onClick={() => setFormOpen(false)}>×</button>
              </div>
              {formError && <p className="calendar-error" role="alert">{formError}</p>}
              <label className="calendar-field">
                <span>Etkinlik adı</span>
                <input value={draft.title} maxLength={160} required onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Örn. Proje koordinasyon toplantısı" />
              </label>
              <div className="calendar-form-row">
                <label className="calendar-field">
                  <span>Tür</span>
                  <select value={draft.eventType} onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value as EventType }))}>
                    <option value="meeting">Toplantı</option>
                    <option value="event">Etkinlik</option>
                    <option value="reminder">Hatırlatma</option>
                    <option value="deadline">Teslim / Son tarih</option>
                    <option value="presentation">Sunum</option>
                    <option value="site_visit">Yer Görme</option>
                    <option value="hkt">Halkın Katılım Toplantısı (HKT)</option>
                    <option value="idk">İDK Toplantısı</option>
                  </select>
                </label>
                <label className="calendar-field">
                  <span>Görünürlük</span>
                  <select value={draft.visibility} onChange={(event) => setDraft((current) => ({
                    ...current,
                    visibility: event.target.value as Visibility,
                    projectId: event.target.value === 'project' ? current.projectId : '',
                    attendeeIds: event.target.value === 'personal' ? [] : current.attendeeIds,
                  }))}>
                    <option value="personal">Kişisel</option>
                    <option value="shared">Kurumsal takvim</option>
                    <option value="project">Projeye bağlı</option>
                  </select>
                </label>
              </div>
              {draft.visibility === 'project' && (
                <label className="calendar-field">
                  <span>Proje</span>
                  <select value={draft.projectId} required onChange={(event) => setDraft((current) => ({ ...current, projectId: event.target.value }))}>
                    <option value="">Proje seçin</option>
                    {visibleProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                  {visibleProjects.length === 0 && <small>Etkin proje üyeliğiniz bulunamadı.</small>}
                </label>
              )}
              <label className="calendar-checkbox">
                <input type="checkbox" checked={draft.allDay} onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked }))} />
                <span>Tüm gün</span>
              </label>
              {draft.allDay ? (
                <div className="calendar-form-row">
                  <label className="calendar-field"><span>Başlangıç</span><input type="date" required value={draft.startsOn} onChange={(event) => setDraft((current) => ({ ...current, startsOn: event.target.value }))} /></label>
                  <label className="calendar-field"><span>Bitiş</span><input type="date" required value={draft.endsOn} onChange={(event) => setDraft((current) => ({ ...current, endsOn: event.target.value }))} /></label>
                </div>
              ) : (
                <div className="calendar-form-row">
                  <label className="calendar-field"><span>Başlangıç saati</span><input type="datetime-local" required value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
                  <label className="calendar-field"><span>Bitiş saati</span><input type="datetime-local" required value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
                </div>
              )}
              <label className="calendar-field">
                <span>Konum</span>
                <input value={draft.location} maxLength={200} onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))} placeholder="Ofis, saha veya çevrim içi bağlantı" />
              </label>
              {draft.visibility !== 'personal' && people.length > 0 && (
                <label className="calendar-field">
                  <span>Katılımcılar</span>
                  <select multiple value={draft.attendeeIds} onChange={(event) => setDraft((current) => ({
                    ...current,
                    attendeeIds: Array.from(event.target.selectedOptions).map((option) => option.value),
                  }))}>
                    {people.filter((person) => person.id !== editingEvent?.createdBy).map((person) => (
                      <option key={person.id} value={person.id}>{person.displayName}{person.department ? ' · ' + person.department : ''}</option>
                    ))}
                  </select>
                  <small>Birden fazla kişi seçmek için Ctrl tuşunu kullanın.</small>
                </label>
              )}
              <label className="calendar-field">
                <span>Açıklama</span>
                <textarea rows={3} maxLength={4000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <div className="calendar-form-actions">
                <button type="button" className="secondary-button" onClick={() => setFormOpen(false)} disabled={busy}>Vazgeç</button>
                <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Kaydediliyor…' : editingEvent ? 'Değişiklikleri kaydet' : 'Etkinliği kaydet'}</button>
              </div>
            </form>
          ) : selectedEvent ? (
            <div className="calendar-event-detail">
              <div className="calendar-side-heading">
                <div><span className="calendar-eyebrow">{eventTypeLabels[selectedEvent.eventType]}</span><h2>Etkinlik ayrıntısı</h2></div>
                <button type="button" className="calendar-icon-button" aria-label="Ayrıntıyı kapat" onClick={() => setSelectedEvent(null)}>×</button>
              </div>
              <span className={'calendar-detail-type calendar-entry-' + selectedEvent.eventType}>{visibilityLabels[selectedEvent.visibility]}</span>
              <h3>{selectedEvent.title}</h3>
              <p className="calendar-detail-date">
                {selectedEvent.allDay
                  ? formatDate(selectedEvent.startsOn!) + (selectedEvent.endsOn !== selectedEvent.startsOn ? ' – ' + formatDate(selectedEvent.endsOn!) : '') + ' · Tüm gün'
                  : formatDate(instantDateKey(selectedEvent.startsAt!)) + ' · ' + instantTime(selectedEvent.startsAt!) + ' – ' + instantTime(selectedEvent.endsAt!)}
              </p>
              {selectedEvent.projectName && <p><strong>Proje:</strong> {selectedEvent.projectName}</p>}
              {selectedEvent.location && <p><strong>Konum:</strong> {selectedEvent.location}</p>}
              {selectedEvent.description && <p className="calendar-detail-description">{selectedEvent.description}</p>}
              <div className="calendar-detail-meta">
                <span>Oluşturan: {selectedEvent.creatorName}</span>
                {selectedEvent.attendees.length > 0 && (
                  <div><strong>Katılımcılar</strong>{selectedEvent.attendees.map((person) => <span key={person.id}>{person.displayName}</span>)}</div>
                )}
              </div>
              <div className="calendar-form-actions">
                {canUpdate && canManageSelectedEvent && <button type="button" className="secondary-button" onClick={() => openEdit(selectedEvent)}>Düzenle</button>}
                {canDelete && canManageSelectedEvent && <button type="button" className="danger-button" onClick={() => void archiveEvent(selectedEvent)} disabled={busy}>Arşivle</button>}
              </div>
            </div>
          ) : (
            <div className="calendar-day-agenda">
              <div className="calendar-side-heading">
                <div>
                  <span className="calendar-eyebrow">GÜNÜN PLANI</span>
                  <h2>{formatDate(selectedDate, { day: 'numeric', month: 'long' })}</h2>
                </div>
                {canCreate && <button type="button" className="calendar-add-inline" onClick={() => openCreate(selectedDate)} aria-label="Seçili güne etkinlik ekle">＋</button>}
              </div>
              <div className="calendar-day-items">
                {entriesForDay(selectedDate).map((entry) => (
                  <div className="calendar-day-item" key={entry.key}>
                    {renderEntry(entry)}
                    {entry.milestone && <small>{milestoneLabel(entry.milestone)}</small>}
                  </div>
                ))}
                {entriesForDay(selectedDate).length === 0 && !loading && (
                  <div className="calendar-empty compact-empty">
                    <strong>Bu gün için kayıt yok</strong>
                    <span>Yeni bir etkinlik ekleyebilirsiniz.</span>
                  </div>
                )}
                {loading && <div className="calendar-loading">Kayıtlar alınıyor…</div>}
              </div>
              <div className="calendar-day-summary">
                <strong>{entriesForDay(selectedDate).length}</strong>
                <span>takvim kaydı</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      <Drawer
        isOpen={dayPanelOpen}
        onClose={() => setDayPanelOpen(false)}
        size="lg"
        title="Günün planı"
        subtitle={formatDate(selectedDate)}
        ariaLabelledBy="calendar-day-drawer-title"
      >
        <div className="calendar-day-drawer">
          <div className="calendar-day-drawer-actions">
            {canCreate && (
              <>
                <button type="button" className="calendar-day-action-primary" onClick={() => { setDayPanelOpen(false); openCreate(selectedDate, 'meeting'); }}>
                  <span aria-hidden="true">＋</span> Toplantı planla
                </button>
                <button type="button" className="calendar-day-action-secondary" onClick={() => { setDayPanelOpen(false); openCreate(selectedDate, 'event'); }}>
                  <span aria-hidden="true">＋</span> Etkinlik ekle
                </button>
              </>
            )}
          </div>
          <div className="calendar-day-drawer-list">
            {entriesForDay(selectedDate).map((entry) => (
              <article className="calendar-day-drawer-row" key={entry.key}>
                {renderEntry(entry)}
                {entry.milestone && <small>{milestoneLabel(entry.milestone)}</small>}
              </article>
            ))}
            {entriesForDay(selectedDate).length === 0 && !loading && (
              <div className="calendar-empty">
                <strong>Bu gün için kayıt yok</strong>
                <span>Toplantı veya etkinlik planlamak için yukarıdaki işlemleri kullanın.</span>
              </div>
            )}
            {loading && <div className="calendar-loading" role="status">Günün kayıtları alınıyor…</div>}
          </div>
          <div className="calendar-day-drawer-summary">
            <strong>{entriesForDay(selectedDate).length}</strong>
            <span>etkinlik, görev veya süreç kaydı</span>
          </div>
        </div>
      </Drawer>
    </section>
  );
}
