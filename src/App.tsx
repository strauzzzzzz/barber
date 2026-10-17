import { lazy, Suspense, useEffect, useState } from 'react';
import { SALON } from '../shared/config';
import { Chat } from './components/Chat';
import { BookFlow } from './components/BookFlow';
import { MyBookings } from './components/MyBookings';
import { Icon } from './components/Icons';
import { useOnline } from './lib/hooks';
import { getTheme, setTheme } from './lib/session';

const Admin = lazy(() => import('./admin/Admin'));

type Tab = 'chat' | 'book' | 'my';
const TABS: { id: Tab; label: string; icon: 'chat' | 'calendar' | 'ticket' }[] = [
  { id: 'chat', label: 'Чат', icon: 'chat' },
  { id: 'book', label: 'Запись', icon: 'calendar' },
  { id: 'my', label: 'Мои записи', icon: 'ticket' },
];
const fromHash = (): Tab => (['book', 'my'].includes(location.hash.slice(1)) ? (location.hash.slice(1) as Tab) : 'chat');

export default function App() {
  if (location.pathname.startsWith('/admin')) return <Suspense fallback={<div className="admin" aria-busy="true" />}><Admin /></Suspense>;
  return <Client />;
}

function Client() {
  const [tab, setTab] = useState<Tab>(fromHash);
  const [theme, setThemeState] = useState(getTheme);
  const [scrolled, setScrolled] = useState(false);
  const [kb, setKb] = useState(false);
  const online = useOnline();

  useEffect(() => { const h = () => setTab(fromHash()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  useEffect(() => setScrolled(false), [tab]);

  // Клавиатура: высота приложения = видимая область, нижняя панель прячется
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const on = () => {
      root.style.setProperty('--app-h', `${vv.height}px`);
      setKb(window.innerHeight - vv.height > 140);
      if (vv.offsetTop) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on); on();
    return () => { vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on); };
  }, []);

  const go = (t: Tab) => { location.hash = t === 'chat' ? '' : t; setTab(t); };
  const flip = () => { const t = theme === 'dark' ? 'light' : 'dark'; setTheme(t); setThemeState(t); };

  return (
    <div className={`app${kb ? ' kb' : ''}`} onScrollCapture={(e) => { const t = e.target as HTMLElement; if (t.matches?.('.screen, .chat-scroll')) setScrolled(t.scrollTop > 4); }}>
      <header className={`header glass${scrolled ? ' scrolled' : ''}`}>
        <div className="brand"><b>{SALON.name}</b><span>{SALON.tagline}</span></div>
        <a className="icon-btn" href={`tel:${SALON.phone.replace(/[^+\d]/g, '')}`} aria-label={`Позвонить ${SALON.phone}`}><Icon name="phone" /></a>
        <button className="icon-btn" onClick={flip} aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}><Icon name={theme === 'dark' ? 'sun' : 'moon'} /></button>
      </header>

      {!online && <div className="offline" role="status"><Icon name="wifioff" /><span>Нет сети. Чат и запись работают только с интернетом.</span></div>}

      <main>
        <div hidden={tab !== 'chat'}><Chat online={online} /></div>
        <div hidden={tab !== 'book'} className="screen"><BookFlow onDone={() => go('my')} /></div>
        {tab === 'my' && <div className="screen"><MyBookings goBook={() => go('book')} /></div>}
      </main>

      <nav className="nav glass" aria-label="Разделы">
        {TABS.map((t) => (
          <button key={t.id} className="tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <Icon name={t.icon} />{t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
