import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock3,
  Copy,
  Database,
  KeyRound,
  LayoutDashboard,
  Link2,
  Loader2,
  MessageCircleMore,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShieldOff,
  Unlink,
  UserRoundSearch,
  UsersRound,
  X,
} from 'lucide-react';

type Section = 'dashboard' | 'users' | 'chats' | 'events' | 'errors' | 'integrations' | 'settings';

type ChatStats = {
  id: string;
  name: string;
  slug: string;
  getcourse_group_id: number;
  telegram_chat_id: number | null;
  active_access: number;
  telegram_members: number;
  not_connected: number;
  banned: number;
};

type DashboardData = {
  mode: 'database' | 'demo';
  stats: {
    total_users: number;
    telegram_connected: number;
    manual_blocked: number;
    errors?: number;
  };
  chats: ChatStats[];
};

type UserItem = {
  id: string;
  getcourse_user_id: number;
  email: string | null;
  name: string | null;
  phone?: string | null;
  telegram_user_id: number | null;
  telegram_username: string | null;
  telegram_first_name?: string | null;
  manual_block: boolean;
  manual_block_reason?: string | null;
  personal_access_token?: string;
  last_getcourse_sync_at: string | null;
  last_telegram_sync_at: string | null;
  chats?: UserChatAccess[];
};

type UserChatAccess = {
  chat_id: string;
  chat_name: string;
  chat_slug: string;
  access_status: 'active' | 'inactive' | 'unknown';
  telegram_status: 'unknown' | 'not_connected' | 'member' | 'left' | 'banned' | 'administrator' | 'creator';
  technical_ban_reason?: string | null;
  last_access_change_at?: string | null;
};

type EventItem = {
  id: number | string;
  created_at: string;
  source: 'system' | 'getcourse' | 'telegram' | 'admin';
  level: 'info' | 'warning' | 'error';
  event_type: string;
  message: string;
  user_name?: string | null;
  user_email?: string | null;
  chat_name?: string | null;
};

const demoChats: ChatStats[] = [
  {
    id: 'demo-1',
    name: 'Пространство «ВЕДАНИЕ. Система восстановления человека»',
    slug: 'vedanie',
    getcourse_group_id: 4825549,
    telegram_chat_id: null,
    active_access: 0,
    telegram_members: 0,
    not_connected: 0,
    banned: 0,
  },
  {
    id: 'demo-2',
    name: 'Пространство «ВЕДАНИЕ: гормональный возраст 35+, 45+, 55+»',
    slug: 'hormonal-age',
    getcourse_group_id: 4900239,
    telegram_chat_id: null,
    active_access: 0,
    telegram_members: 0,
    not_connected: 0,
    banned: 0,
  },
];

const fallback: DashboardData = {
  mode: 'demo',
  stats: { total_users: 0, telegram_connected: 0, manual_blocked: 0, errors: 0 },
  chats: demoChats,
};

const demoUsers: UserItem[] = [
  {
    id: 'demo-user-1',
    getcourse_user_id: 100001,
    name: 'Тестовый пользователь',
    email: 'demo@example.com',
    telegram_user_id: null,
    telegram_username: null,
    manual_block: false,
    last_getcourse_sync_at: null,
    last_telegram_sync_at: null,
    chats: demoChats.map((chat) => ({
      chat_id: chat.id,
      chat_name: chat.name,
      chat_slug: chat.slug,
      access_status: 'unknown',
      telegram_status: 'not_connected',
    })),
  },
];

function App() {
  const [section, setSection] = useState<Section>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardData>(fallback);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const api = async <T,>(url: string, options?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
      ...options,
    });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return response.json();
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dashboardData, usersData, eventsData] = await Promise.all([
        api<DashboardData>('/api/dashboard'),
        api<UserItem[]>('/api/users'),
        api<EventItem[]>('/api/events'),
      ]);
      setDashboard(dashboardData);
      setUsers(usersData);
      setEvents(eventsData);
    } catch {
      setDashboard(fallback);
      setUsers(demoUsers);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [user.name, user.email, user.telegram_username, user.telegram_user_id?.toString(), user.getcourse_user_id?.toString()]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [users, search]);

  const openUser = async (user: UserItem) => {
    try {
      const full = await api<UserItem>(`/api/users/${user.id}`);
      setSelectedUser(full);
    } catch {
      setSelectedUser(user);
    }
  };

  const toggleManualBlock = async (user: UserItem, blocked: boolean) => {
    const reason = blocked ? 'Ручная блокировка администратора' : null;
    try {
      const updated = await api<UserItem>(`/api/users/${user.id}/manual-block`, {
        method: 'POST',
        body: JSON.stringify({ blocked, reason }),
      });
      setSelectedUser(updated);
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setToast(blocked ? 'Пользователь заблокирован вручную' : 'Ручная блокировка снята');
    } catch {
      setToast('Действие станет доступно после подключения базы');
    }
  };

  const resetTelegram = async (user: UserItem) => {
    try {
      const updated = await api<UserItem>(`/api/users/${user.id}/reset-telegram`, { method: 'POST' });
      setSelectedUser(updated);
      setUsers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setToast('Telegram-привязка сброшена');
    } catch {
      setToast('Действие станет доступно после подключения базы');
    }
  };

  const copyAccessUrl = async (user: UserItem) => {
    const token = user.personal_access_token;
    if (!token) {
      setToast('Персональная ссылка появится после подключения базы');
      return;
    }
    const url = `${window.location.origin}/join/${token}`;
    await navigator.clipboard.writeText(url);
    setToast('Персональная ссылка скопирована');
  };

  const titles: Record<Section, [string, string]> = {
    dashboard: ['Обзор', 'Состояние доступа и Telegram-чатов'],
    users: ['Пользователи', 'GetCourse, Telegram и права доступа'],
    chats: ['Чаты', 'Два действующих пространства и правила доступа'],
    events: ['События', 'Журнал действий GetCourse, Telegram и администраторов'],
    errors: ['Ошибки', 'События, которые требуют внимания администратора'],
    integrations: ['Интеграции', 'Подключение GetCourse, Telegram и базы данных'],
    settings: ['Настройки', 'Системные параметры приложения'],
  };

  return (
    <div className="app-shell">
      <Sidebar section={section} onChange={setSection} errorCount={dashboard.stats.errors ?? 0} />

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">UrbanQueen Access</div>
            <h1>{titles[section][0]}</h1>
            <p className="page-subtitle">{titles[section][1]}</p>
          </div>
          <div className="topbar-actions">
            {(section === 'users' || section === 'dashboard') && (
              <div className="search">
                <Search size={18} />
                <input
                  placeholder="Имя, email, Telegram или GC ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => section === 'dashboard' && setSection('users')}
                />
              </div>
            )}
            <button className="button secondary" onClick={loadAll} disabled={loading}>
              {loading ? <Loader2 size={17} className="spin" /> : <RefreshCw size={17} />}
              Синхронизировать
            </button>
          </div>
        </header>

        {section === 'dashboard' && <DashboardPage data={dashboard} events={events} onOpenChat={() => setSection('chats')} />}
        {section === 'users' && <UsersPage users={filteredUsers} onOpen={openUser} />}
        {section === 'chats' && <ChatsPage chats={dashboard.chats} />}
        {section === 'events' && <EventsPage events={events} />}
        {section === 'errors' && <ErrorsPage events={events.filter((event) => event.level === 'error')} />}
        {section === 'integrations' && <IntegrationsPage mode={dashboard.mode} />}
        {section === 'settings' && <SettingsPage />}
      </main>

      {selectedUser && (
        <UserDrawer
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onManualBlock={toggleManualBlock}
          onResetTelegram={resetTelegram}
          onCopyAccessUrl={copyAccessUrl}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Sidebar({ section, onChange, errorCount }: { section: Section; onChange: (section: Section) => void; errorCount: number }) {
  const items: Array<{ id: Section; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Обзор', icon: <LayoutDashboard size={19} /> },
    { id: 'users', label: 'Пользователи', icon: <UsersRound size={19} /> },
    { id: 'chats', label: 'Чаты', icon: <MessageCircleMore size={19} /> },
    { id: 'events', label: 'События', icon: <Activity size={19} /> },
    { id: 'errors', label: 'Ошибки', icon: <AlertTriangle size={19} /> },
    { id: 'integrations', label: 'Интеграции', icon: <Link2 size={19} /> },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">UQ</div>
        <div>
          <div className="brand-title">UrbanQueen</div>
          <div className="brand-subtitle">Access Control</div>
        </div>
      </div>

      <nav className="nav">
        {items.map((item) => (
          <button key={item.id} className={`nav-item ${section === item.id ? 'active' : ''}`} onClick={() => onChange(item.id)}>
            {item.icon}
            {item.label}
            {item.id === 'errors' && <span className="nav-badge">{errorCount}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <button className={`nav-item ${section === 'settings' ? 'active' : ''}`} onClick={() => onChange('settings')}>
          <Settings size={19} /> Настройки
        </button>
        <div className="admin-mini">
          <div className="admin-avatar"><CircleUserRound size={22} /></div>
          <div><strong>Администратор</strong><span>UrbanQueen</span></div>
        </div>
      </div>
    </aside>
  );
}

function DashboardPage({ data, events, onOpenChat }: { data: DashboardData; events: EventItem[]; onOpenChat: () => void }) {
  return (
    <>
      <section className="status-strip">
        <div className={`status-dot ${data.mode === 'database' ? '' : 'warning-dot'}`}></div>
        <div>
          <strong>{data.mode === 'database' ? 'База данных подключена' : 'Приложение работает в демо-режиме'}</strong>
          <span>{data.mode === 'database' ? 'Данные загружаются из PostgreSQL.' : 'Интерфейс готов. Следующий этап — GetCourse и Telegram.'}</span>
        </div>
        <span className={`mode-badge ${data.mode === 'database' ? 'success-mode' : ''}`}>{data.mode === 'database' ? 'Online' : 'Demo'}</span>
      </section>

      <section className="stats-grid">
        <StatCard title="Пользователи" value={data.stats.total_users} icon={<UsersRound size={21}/>} detail="в базе приложения" />
        <StatCard title="Telegram подключён" value={data.stats.telegram_connected} icon={<Bot size={21}/>} detail="известен Telegram ID" />
        <StatCard title="Ручная блокировка" value={data.stats.manual_blocked} icon={<ShieldCheck size={21}/>} detail="не снимается оплатой" />
        <StatCard title="Ошибки" value={data.stats.errors ?? 0} icon={<AlertTriangle size={21}/>} detail="требуют внимания" />
      </section>

      <section className="section-heading">
        <div><h2>Telegram-чаты</h2><p>Источником доступа являются действующие группы GetCourse.</p></div>
        <button className="button secondary" onClick={onOpenChat}>Настройки чатов</button>
      </section>

      <section className="chat-grid">
        {data.chats.map((chat, index) => <ChatCard key={chat.id} chat={chat} number={index + 1} />)}
      </section>

      <section className="lower-grid">
        <div className="panel">
          <div className="panel-head"><div><h3>Последние события</h3><p>Доступ, входы, удаления и автоматические разблокировки.</p></div></div>
          {events.length ? <EventList events={events.slice(0, 5)} compact /> : <EmptyEvents />}
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Интеграции</h3><p>Состояние внешних сервисов.</p></div></div>
          <IntegrationRow name="GetCourse" subtitle="API и callback" status="Ожидает настройки" />
          <IntegrationRow name="Telegram" subtitle="Bot API и webhook" status="Ожидает настройки" />
          <IntegrationRow name="PostgreSQL" subtitle="Основная база данных" status={data.mode === 'database' ? 'Подключено' : 'Не подключено'} ok={data.mode === 'database'} />
        </div>
      </section>
    </>
  );
}

function UsersPage({ users, onOpen }: { users: UserItem[]; onOpen: (user: UserItem) => void }) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <div><h3>Все пользователи</h3><p>{users.length} записей в текущей выборке</p></div>
        <div className="table-hint"><UserRoundSearch size={16}/> Нажмите на пользователя, чтобы открыть карточку</div>
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Пользователь</th><th>GetCourse ID</th><th>Telegram</th><th>Ручной блок</th><th>Последняя синхронизация</th><th></th></tr></thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} onClick={() => onOpen(user)}>
                <td><div className="person-cell"><div className="initials">{initials(user.name ?? user.email ?? '?')}</div><div><strong>{user.name || 'Без имени'}</strong><span>{user.email || 'Email не указан'}</span></div></div></td>
                <td><span className="mono">#{user.getcourse_user_id}</span></td>
                <td>{user.telegram_user_id ? <><strong className="telegram-name">{user.telegram_username ? `@${user.telegram_username}` : `ID ${user.telegram_user_id}`}</strong><span className="subcell">{user.telegram_user_id}</span></> : <span className="pill muted">Не подключён</span>}</td>
                <td>{user.manual_block ? <span className="pill danger">Заблокирован</span> : <span className="pill success">Нет</span>}</td>
                <td><span className="subcell">{formatDate(user.last_getcourse_sync_at)}</span></td>
                <td><ChevronRight size={17} className="row-arrow"/></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ChatsPage({ chats }: { chats: ChatStats[] }) {
  return (
    <div className="stack">
      <section className="info-banner"><ShieldCheck size={20}/><div><strong>Правило доступа</strong><span>Есть пользователь в соответствующей группе GetCourse → доступ разрешён. Нет в группе → пользователь должен быть удалён из Telegram.</span></div></section>
      <section className="chat-grid">
        {chats.map((chat, index) => (
          <article className="chat-card detailed-chat" key={chat.id}>
            <div className="chat-card-head"><div className="chat-number">0{index + 1}</div><span className="pill warning">Telegram ID не указан</span></div>
            <h3>{chat.name}</h3>
            <div className="config-list">
              <ConfigRow label="GetCourse group ID" value={String(chat.getcourse_group_id)} />
              <ConfigRow label="Telegram chat ID" value={chat.telegram_chat_id ? String(chat.telegram_chat_id) : 'Не подключён'} />
              <ConfigRow label="Slug" value={chat.slug} />
            </div>
            <div className="chat-metrics large">
              <Metric value={chat.active_access} label="Активный доступ" />
              <Metric value={chat.telegram_members} label="В Telegram" />
              <Metric value={chat.not_connected} label="Без Telegram ID" />
              <Metric value={chat.banned} label="В blacklist" />
            </div>
            <div className="automation-rule"><RefreshCw size={17}/><span><strong>Автовосстановление:</strong> ACTIVE + BANNED → UNBAN. INACTIVE + MEMBER → BAN.</span></div>
          </article>
        ))}
      </section>
    </div>
  );
}

function EventsPage({ events }: { events: EventItem[] }) {
  return <section className="panel table-panel"><div className="panel-head"><div><h3>Журнал событий</h3><p>Хронология автоматических и ручных действий.</p></div></div>{events.length ? <EventList events={events} /> : <EmptyEvents />}</section>;
}

function ErrorsPage({ events }: { events: EventItem[] }) {
  return (
    <section className="panel table-panel">
      <div className="panel-head"><div><h3>Требуют внимания</h3><p>Ошибки синхронизации и конфликтные состояния.</p></div></div>
      {events.length ? <EventList events={events} /> : <div className="healthy-state"><CheckCircle2 size={30}/><strong>Ошибок нет</strong><span>Когда появятся проблемы Telegram API, GetCourse callback или рассинхронизация, они будут собраны здесь.</span></div>}
    </section>
  );
}

function IntegrationsPage({ mode }: { mode: DashboardData['mode'] }) {
  return (
    <div className="integration-grid">
      <IntegrationCard icon={<Database size={22}/>} title="PostgreSQL" status={mode === 'database' ? 'Подключено' : 'Ожидает настройки'} ok={mode === 'database'} rows={[["Назначение", "Персональные данные и состояния доступа"], ["Размещение", "Сервер в России"], ["Синхронизация", "Основная база приложения"]]} />
      <IntegrationCard icon={<Link2 size={22}/>} title="GetCourse" status="Ожидает настройки" rows={[["Группа 1", "#4825549"], ["Группа 2", "#4900239"], ["Callback", "/api/webhooks/getcourse"]]} />
      <IntegrationCard icon={<Bot size={22}/>} title="Telegram Bot API" status="Ожидает настройки" rows={[["Webhook", "/api/webhooks/telegram"], ["Права", "Invite users + Ban users"], ["Join mode", "Join Request + временные ссылки"]]} />
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-head"><div><h3>Безопасность</h3><p>Базовые правила приложения.</p></div></div>
        <SettingRow icon={<KeyRound size={18}/>} title="Секрет GetCourse webhook" text="Передаётся только через серверный HTTP-заголовок." />
        <SettingRow icon={<ShieldCheck size={18}/>} title="Ручной stop-list" text="Новая оплата не снимает ручную блокировку администратора." />
        <SettingRow icon={<Clock3 size={18}/>} title="Invite link" text="Временная Telegram-ссылка создаётся только после проверки доступа." />
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>Сверка состояний</h3><p>Страховка от потерянных callback.</p></div></div>
        <div className="rule-box"><strong>ACTIVE + BANNED</strong><span>Снять Telegram ban автоматически.</span></div>
        <div className="rule-box"><strong>INACTIVE + MEMBER</strong><span>Удалить пользователя из Telegram.</span></div>
        <div className="rule-box"><strong>MANUAL BLOCK</strong><span>Не пускать независимо от оплаты.</span></div>
      </section>
    </div>
  );
}

function UserDrawer({ user, onClose, onManualBlock, onResetTelegram, onCopyAccessUrl }: { user: UserItem; onClose: () => void; onManualBlock: (user: UserItem, blocked: boolean) => void; onResetTelegram: (user: UserItem) => void; onCopyAccessUrl: (user: UserItem) => void }) {
  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside className="drawer" onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-head"><div><div className="eyebrow">Карточка пользователя</div><h2>{user.name || 'Без имени'}</h2><p>{user.email}</p></div><button className="icon-button" onClick={onClose}><X size={20}/></button></div>

        <div className="drawer-section">
          <h4>GetCourse</h4>
          <DetailRow label="User ID" value={`#${user.getcourse_user_id}`} />
          <DetailRow label="Email" value={user.email || '—'} />
          <DetailRow label="Телефон" value={user.phone || '—'} />
          <DetailRow label="Последняя сверка" value={formatDate(user.last_getcourse_sync_at)} />
        </div>

        <div className="drawer-section">
          <h4>Telegram</h4>
          <DetailRow label="Telegram ID" value={user.telegram_user_id ? String(user.telegram_user_id) : 'Не подключён'} />
          <DetailRow label="Username" value={user.telegram_username ? `@${user.telegram_username}` : '—'} />
          <DetailRow label="Последняя сверка" value={formatDate(user.last_telegram_sync_at)} />
          <button className="button secondary full" onClick={() => onResetTelegram(user)}><Unlink size={16}/> Сбросить Telegram-привязку</button>
        </div>

        <div className="drawer-section">
          <div className="drawer-title-row"><h4>Доступ к чатам</h4><span className={`pill ${user.manual_block ? 'danger' : 'success'}`}>{user.manual_block ? 'Ручной блок' : 'Разрешён правилами'}</span></div>
          {(user.chats ?? []).length ? (user.chats ?? []).map((chat) => <UserChatRow key={chat.chat_id} chat={chat} />) : <div className="mini-empty">Состояния появятся после первой синхронизации.</div>}
        </div>

        <div className="drawer-section">
          <h4>Персональная ссылка</h4>
          <div className="access-url"><span>{user.personal_access_token ? `/join/${user.personal_access_token.slice(0, 14)}…` : 'Будет создана автоматически'}</span><button className="icon-button small" onClick={() => onCopyAccessUrl(user)}><Copy size={16}/></button></div>
        </div>

        <div className="drawer-actions">
          {user.manual_block ? (
            <button className="button primary full" onClick={() => onManualBlock(user, false)}><ShieldOff size={17}/> Снять ручную блокировку</button>
          ) : (
            <button className="button danger-button full" onClick={() => onManualBlock(user, true)}><Ban size={17}/> Заблокировать вручную</button>
          )}
        </div>
      </aside>
    </div>
  );
}

function UserChatRow({ chat }: { chat: UserChatAccess }) {
  return <div className="user-chat-row"><div><strong>{chat.chat_name}</strong><span>{chat.access_status === 'active' ? 'GetCourse: активный доступ' : chat.access_status === 'inactive' ? 'GetCourse: доступа нет' : 'GetCourse: неизвестно'}</span></div><span className={`pill ${chat.telegram_status === 'member' ? 'success' : chat.telegram_status === 'banned' ? 'danger' : 'muted'}`}>{telegramStatus(chat.telegram_status)}</span></div>;
}

function EventList({ events, compact = false }: { events: EventItem[]; compact?: boolean }) {
  return <div className={`event-list ${compact ? 'compact' : ''}`}>{events.map((event) => <div className="event-row" key={event.id}><div className={`event-icon ${event.level}`}><EventIcon level={event.level}/></div><div className="event-copy"><div><strong>{event.message}</strong><span className="event-type">{event.event_type}</span></div><span>{[event.user_email, event.chat_name].filter(Boolean).join(' · ') || sourceLabel(event.source)}</span></div><time>{formatDate(event.created_at, true)}</time></div>)}</div>;
}

function EventIcon({ level }: { level: EventItem['level'] }) {
  if (level === 'error') return <AlertTriangle size={16}/>;
  if (level === 'warning') return <Clock3 size={16}/>;
  return <CheckCircle2 size={16}/>;
}

function EmptyEvents() {
  return <div className="empty-state"><Activity size={24}/><strong>Событий пока нет</strong><span>После подключения webhooks здесь будут видны выдача доступа, входы, удаления и автоматические разблокировки.</span></div>;
}

function StatCard({ title, value, icon, detail }: { title: string; value: number; icon: React.ReactNode; detail: string }) {
  return <div className="stat-card"><div className="stat-icon">{icon}</div><div className="stat-title">{title}</div><div className="stat-value">{value}</div><div className="stat-detail">{detail}</div></div>;
}

function ChatCard({ chat, number }: { chat: ChatStats; number: number }) {
  const ready = Boolean(chat.telegram_chat_id);
  return <article className="chat-card"><div className="chat-card-head"><div className="chat-number">0{number}</div><span className={`pill ${ready ? 'success' : 'warning'}`}>{ready ? 'Telegram подключён' : 'Telegram не подключён'}</span></div><h3>{chat.name}</h3><div className="gc-group"><span>GetCourse group</span><strong>#{chat.getcourse_group_id}</strong></div><div className="chat-metrics"><Metric value={chat.active_access} label="Активный доступ" /><Metric value={chat.telegram_members} label="В Telegram" /><Metric value={chat.not_connected} label="Не подключены" /><Metric value={chat.banned} label="В blacklist" /></div></article>;
}

function Metric({ value, label }: { value: number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function IntegrationRow({ name, subtitle, status, ok = false }: { name: string; subtitle: string; status: string; ok?: boolean }) {
  return <div className="integration-row"><div className="integration-icon"><Link2 size={18}/></div><div className="integration-copy"><strong>{name}</strong><span>{subtitle}</span></div><span className={`pill ${ok ? 'success' : 'muted'}`}>{status}</span></div>;
}

function IntegrationCard({ icon, title, status, ok = false, rows }: { icon: React.ReactNode; title: string; status: string; ok?: boolean; rows: Array<[string, string]> }) {
  return <section className="panel integration-card"><div className="integration-card-head"><div className="integration-card-icon">{icon}</div><div><h3>{title}</h3><span className={`pill ${ok ? 'success' : 'warning'}`}>{status}</span></div></div><div className="config-list">{rows.map(([label, value]) => <ConfigRow key={label} label={label} value={value}/>)}</div></section>;
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return <div className="config-row"><span>{label}</span><strong>{value}</strong></div>;
}

function SettingRow({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="setting-row"><div className="setting-icon">{icon}</div><div><strong>{title}</strong><span>{text}</span></div></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="detail-row"><span>{label}</span><strong>{value}</strong></div>;
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '?';
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return 'Нет данных';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Нет данных';
  return new Intl.DateTimeFormat('ru-RU', withTime ? { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function telegramStatus(value: UserChatAccess['telegram_status']) {
  const labels: Record<UserChatAccess['telegram_status'], string> = {
    unknown: 'Неизвестно',
    not_connected: 'Не подключён',
    member: 'В чате',
    left: 'Вышел',
    banned: 'Blacklist',
    administrator: 'Администратор',
    creator: 'Владелец',
  };
  return labels[value];
}

function sourceLabel(value: EventItem['source']) {
  return { system: 'Система', getcourse: 'GetCourse', telegram: 'Telegram', admin: 'Администратор' }[value];
}

export default App;
