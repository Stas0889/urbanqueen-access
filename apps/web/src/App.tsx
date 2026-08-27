import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, Ban, Bot, CheckCircle2, ChevronRight, CircleUserRound,
  Clock3, Copy, Database, KeyRound, LayoutDashboard, Link2, Loader2,
  MessageCircleMore, RefreshCw, Search, Settings, ShieldCheck, ShieldOff,
  Unlink, UsersRound, X,
} from 'lucide-react';

type Section = 'dashboard' | 'users' | 'chats' | 'events' | 'errors' | 'integrations' | 'settings';
type TelegramStatus = 'unknown' | 'not_connected' | 'member' | 'left' | 'banned' | 'administrator' | 'creator';

type ChatStats = {
  id: string; name: string; slug: string; getcourse_group_id: number; telegram_chat_id: number | null;
  active_access: number; telegram_members: number; not_connected: number; banned: number;
};
type DashboardData = {
  mode: 'database' | 'demo';
  stats: { total_users: number; telegram_connected: number; manual_blocked: number; errors?: number };
  chats: ChatStats[];
};
type Session = { admin: { id: string; email: string }; csrf: string };
type IntegrationsData = {
  appEnv: 'test' | 'production';
  sqlite: { connected: boolean; wal: boolean; foreignKeys: boolean };
  getcourse: { configured: boolean; account: string; groups: number[] };
  telegram: { configured: boolean; mutationsAllowed: boolean };
};
type UserChatAccess = {
  chat_id: string; chat_name: string; chat_slug: string;
  access_status: 'active' | 'inactive' | 'unknown'; telegram_status: TelegramStatus;
  technical_ban_reason?: string | null; last_access_change_at?: string | null;
};
type UserItem = {
  id: string; getcourse_user_id: number; email: string | null; name: string | null; phone?: string | null;
  telegram_user_id: number | null; telegram_username: string | null; telegram_first_name?: string | null;
  manual_block: boolean; manual_block_reason?: string | null; personal_access_token?: string;
  last_getcourse_sync_at: string | null; last_telegram_sync_at: string | null; chats?: UserChatAccess[];
};
type EventItem = {
  id: number | string; created_at: string; source: 'system' | 'getcourse' | 'telegram' | 'admin';
  level: 'info' | 'warning' | 'error'; event_type: string; message: string;
  user_name?: string | null; user_email?: string | null; chat_name?: string | null;
};

const demoChats: ChatStats[] = [
  { id: 'demo-1', name: 'Пространство «ВЕДАНИЕ. Система восстановления человека»', slug: 'vedanie', getcourse_group_id: 4825549, telegram_chat_id: null, active_access: 0, telegram_members: 0, not_connected: 0, banned: 0 },
  { id: 'demo-2', name: 'Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+»', slug: 'hormonal-age', getcourse_group_id: 4900239, telegram_chat_id: null, active_access: 0, telegram_members: 0, not_connected: 0, banned: 0 },
];
const fallback: DashboardData = { mode: 'demo', stats: { total_users: 0, telegram_connected: 0, manual_blocked: 0, errors: 0 }, chats: demoChats };

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [section, setSection] = useState<Section>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData>(fallback);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [integrations, setIntegrations] = useState<IntegrationsData | null>(null);
  const [selected, setSelected] = useState<UserItem | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const method = options?.method?.toUpperCase() ?? 'GET';
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(method !== 'GET' && session?.csrf ? { 'X-CSRF-Token': session.csrf } : {}),
        ...(options?.headers ?? {}),
      },
    });
    if (!response.ok) throw new Error(String(response.status));
    return response.json();
  };

  const load = async () => {
    setLoading(true);
    try {
      const [d, u, e, i] = await Promise.all([api<DashboardData>('/api/dashboard'), api<UserItem[]>('/api/users'), api<EventItem[]>('/api/events'), api<IntegrationsData>('/api/integrations')]);
      setDashboard(d); setUsers(u); setEvents(e); setIntegrations(i);
    } catch { setDashboard(fallback); setUsers([]); setEvents([]); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    fetch('/api/auth/session', { credentials: 'include' })
      .then(async (response) => response.ok ? setSession(await response.json()) : setSession(null))
      .catch(() => setSession(null));
  }, []);
  useEffect(() => { if (session) load(); }, [session?.admin.id]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 2800); return () => clearTimeout(id); }, [toast]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.name, u.email, u.telegram_username, u.telegram_user_id, u.getcourse_user_id].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [users, search]);

  const openUser = async (user: UserItem) => {
    try { setSelected(await api<UserItem>(`/api/users/${user.id}`)); } catch { setSelected(user); }
  };
  const setManualBlock = async (user: UserItem, blocked: boolean) => {
    try {
      const updated = await api<UserItem>(`/api/users/${user.id}/manual-block`, { method: 'POST', body: JSON.stringify({ blocked, reason: blocked ? 'Ручная блокировка администратора' : null }) });
      setSelected(updated); setUsers((list) => list.map((x) => x.id === updated.id ? { ...x, ...updated } : x));
      setToast(blocked ? 'Ручная блокировка включена' : 'Ручная блокировка снята');
    } catch { setToast('Действие станет доступно после подключения базы'); }
  };
  const resetTelegram = async (user: UserItem) => {
    try { const updated = await api<UserItem>(`/api/users/${user.id}/reset-telegram`, { method: 'POST' }); setSelected(updated); setToast('Telegram-привязка сброшена'); }
    catch { setToast('Действие станет доступно после подключения базы'); }
  };
  const copyLink = async (user: UserItem) => {
    if (!user.personal_access_token) return setToast('Ссылка появится после создания пользователя в базе');
    await navigator.clipboard.writeText(`${location.origin}/join/${user.personal_access_token}`); setToast('Персональная ссылка скопирована');
  };
  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null);
  };

  const title: Record<Section, [string, string]> = {
    dashboard: ['Обзор', 'Состояние доступа и Telegram-чатов'], users: ['Пользователи', 'GetCourse, Telegram и права доступа'],
    chats: ['Чаты', 'Два пространства и независимые правила доступа'], events: ['События', 'История действий системы'],
    errors: ['Ошибки', 'События, требующие внимания'], integrations: ['Интеграции', 'GetCourse, Telegram и SQLite'], settings: ['Настройки', 'Правила безопасности и синхронизации'],
  };

  if (session === undefined) return <div className="auth-shell"><Loader2 className="spin" size={30}/></div>;
  if (session === null) return <Login onAuthenticated={setSession}/>;

  return <div className="shell">
    <Sidebar section={section} onChange={setSection} errors={dashboard.stats.errors ?? 0} email={session.admin.email} onLogout={logout} />
    <main className="main">
      <header className="topbar">
        <div><div className="eyebrow">UrbanQueen Access</div><h1>{title[section][0]}</h1><p>{title[section][1]}</p></div>
        <div className="top-actions">
          {section === 'users' && <label className="search"><Search size={17}/><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Имя, email, Telegram, GC ID"/></label>}
          <button className="btn secondary" onClick={load} disabled={loading}>{loading ? <Loader2 className="spin" size={17}/> : <RefreshCw size={17}/>}Синхронизировать</button>
        </div>
      </header>

      {section === 'dashboard' && <Dashboard data={dashboard} events={events}/>} 
      {section === 'users' && <Users users={filtered} onOpen={openUser}/>} 
      {section === 'chats' && <Chats chats={dashboard.chats}/>} 
      {section === 'events' && <Events events={events}/>} 
      {section === 'errors' && <Errors events={events.filter((e) => e.level === 'error')}/>} 
      {section === 'integrations' && <Integrations data={integrations}/>}
      {section === 'settings' && <SettingsPage/>}
    </main>
    {selected && <UserDrawer user={selected} onClose={() => setSelected(null)} onBlock={setManualBlock} onReset={resetTelegram} onCopy={copyLink}/>} 
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Sidebar({ section, onChange, errors, email, onLogout }: { section: Section; onChange: (s: Section) => void; errors: number; email: string; onLogout: () => void }) {
  const items: [Section, string, ReactNode][] = [
    ['dashboard','Обзор',<LayoutDashboard size={19}/>], ['users','Пользователи',<UsersRound size={19}/>], ['chats','Чаты',<MessageCircleMore size={19}/>],
    ['events','События',<Activity size={19}/>], ['errors','Ошибки',<AlertTriangle size={19}/>], ['integrations','Интеграции',<Link2 size={19}/>], ['settings','Настройки',<Settings size={19}/>],
  ];
  return <aside className="sidebar">
    <div className="brand"><div className="brand-mark">UQ</div><div><strong>UrbanQueen</strong><span>Access Control</span></div></div>
    <nav>{items.map(([id,label,icon]) => <button key={id} aria-label={label} className={section === id ? 'nav active' : 'nav'} onClick={() => onChange(id)}>{icon}<span>{label}</span>{id === 'errors' && errors > 0 && <b>{errors}</b>}</button>)}</nav>
    <div className="sidebar-bottom"><button className="admin admin-button" onClick={onLogout} title="Выйти"><CircleUserRound size={22}/><div><strong>Администратор</strong><span>{email}</span></div></button></div>
  </aside>;
}

function Dashboard({ data, events }: { data: DashboardData; events: EventItem[] }) {
  return <>
    {data.mode === 'demo' && <div className="notice"><Database size={18}/><div><strong>API недоступен</strong><span>Проверьте локальный backend и SQLite.</span></div></div>}
    <div className="stats">
      <Stat title="Пользователи" value={data.stats.total_users} detail="в базе" icon={<UsersRound/>}/>
      <Stat title="Telegram связан" value={data.stats.telegram_connected} detail="известен Telegram ID" icon={<Bot/>}/>
      <Stat title="Ручной stop-list" value={data.stats.manual_blocked} detail="не снимается оплатой" icon={<Ban/>}/>
      <Stat title="Ошибки" value={data.stats.errors ?? 0} detail="за последние 7 дней" icon={<AlertTriangle/>}/>
    </div>
    <div className="section-title"><div><h2>Telegram-чаты</h2><p>Доступ считается отдельно для каждого чата.</p></div></div>
    <div className="chat-grid">{data.chats.map((chat, i) => <ChatCard key={chat.id} chat={chat} index={i + 1}/>)}</div>
    <section className="panel"><div className="panel-head"><div><h3>Последние события</h3><p>Оплаты, входы, удаления и автоматические unban.</p></div></div>{events.length ? <EventList events={events.slice(0, 8)}/> : <Empty/>}</section>
  </>;
}

function Users({ users, onOpen }: { users: UserItem[]; onOpen: (u: UserItem) => void }) {
  return <section className="panel table-panel"><div className="table-head"><span>Пользователь</span><span>GetCourse</span><span>Telegram</span><span>Ручной блок</span><span></span></div>
    {users.length ? users.map((u) => <button className="user-row" key={u.id} onClick={() => onOpen(u)}>
      <div className="person"><div className="avatar">{initials(u.name || u.email || '?')}</div><div><strong>{u.name || 'Без имени'}</strong><span>{u.email || '—'}</span></div></div>
      <span>#{u.getcourse_user_id}</span><span>{u.telegram_username ? `@${u.telegram_username}` : u.telegram_user_id ? String(u.telegram_user_id) : 'Не связан'}</span>
      <span className={`pill ${u.manual_block ? 'danger' : 'success'}`}>{u.manual_block ? 'Заблокирован' : 'Нет'}</span><ChevronRight size={17}/>
    </button>) : <Empty text="Пользователи появятся после первой синхронизации с GetCourse."/>}
  </section>;
}

function Chats({ chats }: { chats: ChatStats[] }) {
  return <div className="chat-grid large">{chats.map((chat, i) => <ChatCard key={chat.id} chat={chat} index={i + 1}/>)}</div>;
}
function Events({ events }: { events: EventItem[] }) { return <section className="panel">{events.length ? <EventList events={events}/> : <Empty/>}</section>; }
function Errors({ events }: { events: EventItem[] }) { return <section className="panel">{events.length ? <EventList events={events}/> : <div className="good-empty"><CheckCircle2 size={28}/><strong>Критических ошибок нет</strong><span>Здесь появятся ошибки API, прав бота и рассинхронизации.</span></div>}</section>; }

function Integrations({ data }: { data: IntegrationsData | null }) {
  return <div className="integration-grid">
    <Integration icon={<Database/>} title="SQLite" status={data?.sqlite.connected ? 'Подключена' : 'Недоступна'} ok={data?.sqlite.connected} rows={[['WAL',data?.sqlite.wal ? 'Включён' : 'Нет данных'],['Foreign keys',data?.sqlite.foreignKeys ? 'Включены' : 'Нет данных'],['Среда',data?.appEnv ?? '—']]}/>
    <Integration icon={<Link2/>} title="GetCourse" status={data?.getcourse.configured ? 'Подключён' : 'Ожидает ключи'} ok={data?.getcourse.configured} rows={[['Аккаунт',data?.getcourse.account ?? '—'],['Группы',data?.getcourse.groups.join(' / ') ?? '—'],['Webhook','/api/webhooks/getcourse']]}/>
    <Integration icon={<Bot/>} title="Telegram Bot API" status={data?.telegram.configured ? 'Подключён' : 'Ожидает токен'} ok={data?.telegram.configured} rows={[['Webhook','/api/webhooks/telegram'],['Mutations',data?.telegram.mutationsAllowed ? 'Разрешены для среды' : 'Заблокированы'],['Вход','Join Request']]}/>
  </div>;
}

function SettingsPage() {
  return <div className="settings-grid">
    <section className="panel"><div className="panel-head"><div><h3>Приоритет правил</h3><p>Что происходит при конфликте состояний.</p></div></div>
      <Rule title="Ручная блокировка" text="Имеет приоритет над действующей оплатой." icon={<ShieldOff/>}/>
      <Rule title="ACTIVE + BANNED" text="Автоматически выполнить unban, затем разрешить вход." icon={<ShieldCheck/>}/>
      <Rule title="INACTIVE + MEMBER" text="Автоматически удалить пользователя из чата." icon={<Ban/>}/>
    </section>
    <section className="panel"><div className="panel-head"><div><h3>Безопасность</h3><p>Базовые технические ограничения.</p></div></div>
      <Rule title="Персональная ссылка" text="Не содержит email, GetCourse ID или Telegram ID." icon={<KeyRound/>}/>
      <Rule title="Telegram binding" text="После первого входа GC-пользователь связывается с одним Telegram ID." icon={<Link2/>}/>
      <Rule title="Reconciliation" text="Периодическая сверка исправляет потерянные callbacks." icon={<RefreshCw/>}/>
    </section>
  </div>;
}

function UserDrawer({ user, onClose, onBlock, onReset, onCopy }: { user: UserItem; onClose: () => void; onBlock: (u: UserItem,b:boolean) => void; onReset: (u: UserItem) => void; onCopy: (u: UserItem) => void }) {
  return <div className="backdrop" onMouseDown={onClose}><aside className="drawer" onMouseDown={(e) => e.stopPropagation()}>
    <div className="drawer-head"><div><div className="eyebrow">Карточка пользователя</div><h2>{user.name || 'Без имени'}</h2><p>{user.email || '—'}</p></div><button className="icon-btn" onClick={onClose}><X size={20}/></button></div>
    <DrawerSection title="GetCourse"><Detail label="User ID" value={`#${user.getcourse_user_id}`}/><Detail label="Email" value={user.email || '—'}/><Detail label="Телефон" value={user.phone || '—'}/><Detail label="Сверка" value={date(user.last_getcourse_sync_at)}/></DrawerSection>
    <DrawerSection title="Telegram"><Detail label="Telegram ID" value={user.telegram_user_id ? String(user.telegram_user_id) : 'Не подключён'}/><Detail label="Username" value={user.telegram_username ? `@${user.telegram_username}` : '—'}/><button className="btn secondary full" onClick={() => onReset(user)}><Unlink size={16}/>Сбросить Telegram-привязку</button></DrawerSection>
    <DrawerSection title="Доступ к чатам">{(user.chats ?? []).length ? user.chats!.map((c) => <div className="access-row" key={c.chat_id}><div><strong>{c.chat_name}</strong><span>{c.access_status === 'active' ? 'GetCourse: активен' : c.access_status === 'inactive' ? 'GetCourse: доступа нет' : 'GetCourse: неизвестно'}</span></div><span className={`pill ${c.telegram_status === 'member' ? 'success' : c.telegram_status === 'banned' ? 'danger' : 'muted'}`}>{tgLabel(c.telegram_status)}</span></div>) : <span className="muted-text">После синхронизации здесь будут оба чата.</span>}</DrawerSection>
    <DrawerSection title="Персональная ссылка"><div className="access-link"><span>{user.personal_access_token ? `/join/${user.personal_access_token.slice(0,16)}…` : 'Будет создана автоматически'}</span><button className="icon-btn" onClick={() => onCopy(user)}><Copy size={16}/></button></div></DrawerSection>
    <div className="drawer-footer">{user.manual_block ? <button className="btn primary full" onClick={() => onBlock(user,false)}><ShieldCheck size={17}/>Снять ручную блокировку</button> : <button className="btn danger-btn full" onClick={() => onBlock(user,true)}><Ban size={17}/>Заблокировать вручную</button>}</div>
  </aside></div>;
}

function Stat({ title, value, detail, icon }: { title:string; value:number; detail:string; icon:ReactNode }) { return <div className="stat"><div className="stat-icon">{icon}</div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>; }
function ChatCard({ chat, index }: { chat:ChatStats; index:number }) { return <article className="chat-card"><div className="chat-top"><div className="chat-number">0{index}</div><span className={`pill ${chat.telegram_chat_id ? 'success' : 'warning'}`}>{chat.telegram_chat_id ? 'Telegram подключён' : 'Нужно подключить'}</span></div><h3>{chat.name}</h3><div className="group-id"><span>GetCourse group</span><strong>#{chat.getcourse_group_id}</strong></div><div className="metrics"><Metric value={chat.active_access} label="Активный доступ"/><Metric value={chat.telegram_members} label="В Telegram"/><Metric value={chat.not_connected} label="Не связаны"/><Metric value={chat.banned} label="Blacklist"/></div></article>; }
function Metric({ value,label }:{value:number;label:string}) { return <div><strong>{value}</strong><span>{label}</span></div>; }
function EventList({ events }:{events:EventItem[]}) { return <div className="event-list">{events.map((e) => <div className="event-row" key={e.id}><div className={`event-dot ${e.level}`}>{e.level === 'error' ? <AlertTriangle size={15}/> : e.level === 'warning' ? <Clock3 size={15}/> : <CheckCircle2 size={15}/>}</div><div><strong>{e.message}</strong><span>{[e.user_email,e.chat_name].filter(Boolean).join(' · ') || e.event_type}</span></div><time>{date(e.created_at,true)}</time></div>)}</div>; }
function Integration({ icon,title,status,ok=false,rows }:{icon:ReactNode;title:string;status:string;ok?:boolean;rows:[string,string][]}) { return <section className="panel integration"><div className="integration-head"><div className="integration-icon">{icon}</div><div><h3>{title}</h3><span className={`pill ${ok ? 'success' : 'warning'}`}>{status}</span></div></div>{rows.map(([k,v]) => <div className="config" key={k}><span>{k}</span><strong>{v}</strong></div>)}</section>; }
function Rule({icon,title,text}:{icon:ReactNode;title:string;text:string}) { return <div className="rule"><div>{icon}</div><p><strong>{title}</strong><span>{text}</span></p></div>; }
function DrawerSection({ title,children }:{title:string;children:ReactNode}) { return <section className="drawer-section"><h4>{title}</h4>{children}</section>; }
function Detail({ label,value }:{label:string;value:string}) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
function Empty({ text='Событий пока нет.' }:{text?:string}) { return <div className="empty"><Activity size={24}/><strong>Пока пусто</strong><span>{text}</span></div>; }
function initials(v:string) { return v.split(/\s+/).filter(Boolean).slice(0,2).map((x) => x[0]?.toUpperCase()).join('') || '?'; }
function date(v?:string|null,time=false) { if(!v) return 'Нет данных'; const d=new Date(v); return Number.isNaN(d.getTime()) ? 'Нет данных' : new Intl.DateTimeFormat('ru-RU',time?{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}:{day:'2-digit',month:'2-digit',year:'numeric'}).format(d); }
function tgLabel(v:TelegramStatus) { return ({unknown:'Неизвестно',not_connected:'Не связан',member:'В чате',left:'Вышел',banned:'Blacklist',administrator:'Админ',creator:'Владелец'} as Record<TelegramStatus,string>)[v]; }

function Login({ onAuthenticated }: { onAuthenticated: (session: Session) => void }) {
  const [email, setEmail] = useState('admin@local.test');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error('login_failed');
      onAuthenticated(await response.json());
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}>
    <div className="brand-mark">UQ</div>
    <div><div className="eyebrow">UrbanQueen Access</div><h1>Вход в управление</h1><p>Доступ только для администратора.</p></div>
    <label><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required/></label>
    <label><span>Пароль</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required/></label>
    {error && <div className="auth-error">Неверный email или пароль.</div>}
    <button className="btn primary full" disabled={busy}>{busy ? <Loader2 className="spin" size={17}/> : <KeyRound size={17}/>}Войти</button>
  </form></div>;
}
