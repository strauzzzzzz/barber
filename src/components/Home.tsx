import { useEffect, useRef } from 'react';
import { SALON } from '../../shared/config';
import { msToLocal } from '../../shared/time';
import { minutes, reviewsLabel, rub, useCatalog } from '../lib/hooks';
import { Icon } from './Icons';
import { Logo } from './Logo';

const tel = (p: string) => `tel:${p.replace(/[^+\d]/g, '')}`;
const style = (i: number) => ({ '--i': i }) as React.CSSProperties;

export function Home({ go }: { go: (t: 'chat' | 'book') => void }) {
  const { data } = useCatalog();
  const root = useRef<HTMLDivElement>(null);

  // карточки «выезжают» по мере прокрутки
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
    root.current?.querySelectorAll('.reveal:not(.in)').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [data]);

  // мышь: перетаскивание ряда мастеров и стрелки (на тач-экране работает обычный свайп)
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const scrollRow = (dir: number) => row.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });

  const now = msToLocal(Date.now(), SALON.timezone).time;
  const open = now >= SALON.hours.open && now < SALON.hours.close;
  const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${SALON.city}, ${SALON.address}`)}`;

  return (
    <div ref={root} className="stack" style={{ gap: 16 }}>
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-logo"><Logo uid="home" size={128} idle /></div>
        <h1 className="hero-title" style={style(1)}>{SALON.name}</h1>
        <p className="muted" style={style(2)}>{SALON.tagline}</p>
        <p className="status small" style={style(3)}><i className={`dot${open ? ' on' : ''}`} aria-hidden="true" />{open ? `Открыто до ${SALON.hours.close}` : `Сейчас закрыто · откроемся в ${SALON.hours.open}`}</p>
        <div className="stack hero-cta" style={style(4)}>
          <button className="btn primary block shine" onClick={() => go('book')}>Записаться</button>
          <button className="btn block" onClick={() => go('chat')}>Подобрать время в чате</button>
        </div>
      </section>

      <section className="card stack reveal" aria-labelledby="h-contacts">
        <h2 id="h-contacts">Контакты</h2>
        <a className="contact" href={map} target="_blank" rel="noopener noreferrer">
          <Icon name="pin" /><span className="grow"><b>{SALON.city}, {SALON.address}</b><span className="xs faint" style={{ display: 'block' }}>Показать на карте</span></span><Icon name="right" small />
        </a>
        {SALON.phones.map((p) => (
          <a key={p} className="contact" href={tel(p)}><Icon name="phone" /><span className="grow"><b className="num">{p}</b><span className="xs faint" style={{ display: 'block' }}>Позвонить</span></span><Icon name="right" small /></a>
        ))}
        <div className="contact static"><Icon name="clock" /><span className="grow"><b className="num">Ежедневно {SALON.hours.open}–{SALON.hours.close}</b></span></div>
      </section>

      <section className="card stack reveal" aria-labelledby="h-prices">
        <h2 id="h-prices">Услуги и цены</h2>
        {!data && [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 40 }} />)}
        {data?.services.map((s) => (
          <div key={s.id} className="price-row">
            <span className="grow">{s.name}<span className="xs faint" style={{ display: 'block' }}>{minutes(s.duration_min)}</span></span>
            <span className="price">{rub(s.price)}</span>
          </div>
        ))}
      </section>

      {data && data.masters.length > 0 && (
        <section className="stack reveal" aria-labelledby="h-masters">
          <div className="row between">
            <h2 id="h-masters">Мастера</h2>
            <div className="row" style={{ gap: 0 }}>
              <button className="icon-btn" aria-label="Назад" onClick={() => scrollRow(-1)}><Icon name="left" /></button>
              <button className="icon-btn" aria-label="Вперёд" onClick={() => scrollRow(1)}><Icon name="right" /></button>
            </div>
          </div>
          <div ref={row} className="mrow" tabIndex={0} aria-label="Мастера, листайте вбок"
            onMouseDown={(e) => e.preventDefault() /* без фокуса по клику: иначе браузер прокручивает страницу к ряду */}
            onPointerDown={(e) => { if (e.pointerType === 'mouse') { drag.current = { x: e.clientX, left: row.current!.scrollLeft }; row.current!.setPointerCapture(e.pointerId); row.current!.classList.add('dragging'); } }}
            onPointerMove={(e) => { if (drag.current) row.current!.scrollLeft = drag.current.left - (e.clientX - drag.current.x); }}
            onPointerUp={() => { drag.current = null; row.current?.classList.remove('dragging'); }}
            onPointerCancel={() => { drag.current = null; row.current?.classList.remove('dragging'); }}>
            {data.masters.map((m) => (
              <div key={m.id} className="card tight mcard">
                <span className="avatar" aria-hidden="true">{m.name[0]}</span>
                <b style={{ display: 'block', marginTop: 8 }}>{m.name}</b>
                <span className="xs faint" style={{ display: 'block' }}>{m.title}</span>
                <span className="small" style={{ display: 'block', marginTop: 4 }}><span className="stars" aria-hidden="true">★</span> <span className="num">{m.rating.toFixed(1)}</span></span>
                <span className="xs muted">{reviewsLabel(m.reviews_count)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <button className="btn primary block reveal" onClick={() => go('book')}>Записаться онлайн</button>
    </div>
  );
}
