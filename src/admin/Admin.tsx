import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SALON } from '../../shared/config';
import { configured, sb } from '../lib/supabase';
import { getTheme, setTheme } from '../lib/session';
import { Icon } from '../components/Icons';
import { AdminBookings } from './AdminBookings';
import { AdminSchedule } from './AdminSchedule';
import { AdminCatalog } from './AdminCatalog';

const TABS = [
  ['bookings', 'Записи'],
  ['schedule', 'Расписание'],
  ['services', 'Услуги и цены'],
  ['masters', 'Мастера'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function Admin() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [dark, setDark] = useState(getTheme() === 'dark');

  useEffect(() => {
    document.title = `Админка — ${SALON.name}`;
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setAllowed(null);
    if (!session) return;
    // RLS отдаёт строку только если email текущего пользователя есть в admin_emails
    sb.from('admin_emails').select('email').maybeSingle().then(({ data }) => setAllowed(!!data));
  }, [session]);

  if (!configured) return <Shell><div className="card" role="alert"><p>Не заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY. См. README.</p></div></Shell>;
  if (session === undefined) return <Shell><div className="skel" style={{ height: 200 }} aria-busy="true" /></Shell>;
  if (!session) return <Shell><Login /></Shell>;
  if (allowed === null) return <Shell><div className="skel" style={{ height: 200 }} aria-busy="true" /></Shell>;
  if (!allowed) return (
    <Shell>
      <div className="card stack" role="alert">
        <h2>Нет доступа</h2>
        <p className="muted">Аккаунт {session.user.email} не входит в список администраторов.</p>
        <button className="btn" onClick={() => sb.auth.signOut()}>Выйти</button>
      </div>
    </Shell>
  );

  return (
    <div className="admin">
      <div className="admin-bar glass">
        <nav className="tabs" aria-label="Разделы админки">
          {TABS.map(([id, label]) => <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
        </nav>
        <button className="icon-btn" aria-label="Сменить тему" onClick={() => { const t = dark ? 'light' : 'dark'; setTheme(t); setDark(!dark); }}><Icon name={dark ? 'sun' : 'moon'} /></button>
        <a className="btn sm" href="/">Сайт</a>
        <button className="btn sm" onClick={() => sb.auth.signOut()}>Выйти</button>
      </div>
      {tab === 'bookings' && <AdminBookings />}
      {tab === 'schedule' && <AdminSchedule />}
      {tab === 'services' && <AdminCatalog kind="services" />}
      {tab === 'masters' && <AdminCatalog kind="masters" />}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="admin" style={{ maxWidth: 440, paddingTop: 64 }}><h1 style={{ marginBottom: 16 }}>{SALON.name}: админка</h1>{children}</div>;
}

function Login() {
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error) setErr('Неверный email или пароль');
    setBusy(false);
  }
  return (
    <form className="card stack" onSubmit={go}>
      <div className="field"><label htmlFor="em">Email</label><input id="em" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field"><label htmlFor="pw">Пароль</label><input id="pw" className="input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required /></div>
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" disabled={busy}>{busy && <span className="spin" />}Войти</button>
    </form>
  );
}
