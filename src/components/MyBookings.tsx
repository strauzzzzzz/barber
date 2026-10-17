import { useCallback, useEffect, useState } from 'react';
import type { BookingDTO } from '../../shared/types';
import { BOOKING, SALON, STATUS_LABELS } from '../../shared/config';
import { dateLabel } from '../../shared/time';
import { api, ApiError } from '../lib/api';
import { minutes, rub, useCatalog } from '../lib/hooks';
import { Icon } from './Icons';
import { Sheet } from './Sheet';
import { SlotPicker, type Picked } from './SlotPicker';

const tone = (s: string) => (s === 'confirmed' || s === 'arrived' ? 'ok' : s === 'pending' ? 'warn' : s === 'cancelled' || s === 'no_show' ? 'bad' : '');

export function BookingCard({ b, onChanged, compact }: { b: BookingDTO; onChanged: (b: BookingDTO) => void; compact?: boolean }) {
  const [sheet, setSheet] = useState<'move' | 'cancel' | null>(null);
  const active = b.status === 'pending' || b.status === 'confirmed';
  return (
    <div className="card stack" style={{ gap: 10 }}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <b>{b.service.name}</b>
          <p className="small muted">{b.master.name} · {minutes(b.duration_min)}</p>
        </div>
        <span className={`badge ${tone(b.status)}`}>{STATUS_LABELS[b.status]}</span>
      </div>
      <div className="row between">
        <span><Icon name="clock" small /> <b className="num">{dateLabel(b.date)}, {b.time}</b></span>
        <span className="price">{rub(b.price)}</span>
      </div>
      <p className="xs faint">Код записи: <span className="num">{b.code}</span></p>
      {active && !compact && (
        b.can_change ? (
          <div className="row">
            <button className="btn sm grow" onClick={() => setSheet('move')}>Перенести</button>
            <button className="btn sm grow danger" onClick={() => setSheet('cancel')}>Отменить</button>
          </div>
        ) : (
          <p className="xs faint">Изменить можно не позднее чем за {BOOKING.cancelMinHours} ч до визита. Позвоните: <a href={`tel:${SALON.phone.replace(/[^+\d]/g, '')}`}>{SALON.phone}</a></p>
        )
      )}
      {sheet === 'cancel' && <CancelSheet b={b} onClose={() => setSheet(null)} onDone={(x) => { setSheet(null); onChanged(x); }} />}
      {sheet === 'move' && <MoveSheet b={b} onClose={() => setSheet(null)} onDone={(x) => { setSheet(null); onChanged(x); }} />}
    </div>
  );
}

function CancelSheet({ b, onClose, onDone }: { b: BookingDTO; onClose: () => void; onDone: (b: BookingDTO) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    try { onDone((await api.cancel(b.id)).booking); } catch (e) { setErr((e as ApiError).message); setBusy(false); }
  }
  return (
    <Sheet title="Отменить запись?" onClose={onClose}>
      <div className="stack">
        <p className="muted">{b.service.name}, {b.master.name}, {dateLabel(b.date)} в <span className="num">{b.time}</span>. Время освободится для других клиентов.</p>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn danger block" disabled={busy} onClick={go}>{busy && <span className="spin" />}Да, отменить</button>
        <button className="btn block" onClick={onClose}>Оставить запись</button>
      </div>
    </Sheet>
  );
}

function MoveSheet({ b, onClose, onDone }: { b: BookingDTO; onClose: () => void; onDone: (b: BookingDTO) => void }) {
  const { data: cat } = useCatalog();
  const [pick, setPick] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    if (!pick) return;
    setBusy(true); setErr('');
    try { onDone((await api.reschedule(b.id, pick.date, pick.time)).booking); } catch (e) { setErr((e as ApiError).message); setPick(null); setBusy(false); }
  }
  return (
    <Sheet title="Перенести запись" onClose={onClose}>
      <div className="stack">
        <p className="muted small">{b.service.name}, {b.master.name}. Сейчас: {dateLabel(b.date)}, <span className="num">{b.time}</span></p>
        {cat && <SlotPicker serviceId={b.service.id} masterId={b.master.id} excludeId={b.id} masters={cat.masters} value={pick} onChange={setPick} />}
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary block cta" disabled={!pick || busy} onClick={go}>{busy && <span className="spin" />}Перенести</button>
      </div>
    </Sheet>
  );
}

export function MyBookings({ goBook }: { goBook: () => void }) {
  const [list, setList] = useState<BookingDTO[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => { setError(''); api.myBookings().then((r) => setList(r.bookings)).catch((e) => setError(e.message)); }, []);
  useEffect(load, [load]);

  if (error) return <div className="card stack" role="alert"><p className="err">{error}</p><button className="btn" onClick={load}>Повторить</button></div>;
  if (!list) return <div className="stack" aria-busy="true">{[0, 1].map((i) => <div key={i} className="skel" style={{ height: 120 }} />)}</div>;

  const upd = (x: BookingDTO) => setList((l) => l!.map((b) => (b.id === x.id ? x : b)));
  const now = Date.now();
  const up = list.filter((b) => ['pending', 'confirmed'].includes(b.status) && Date.parse(b.starts_at) > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = list.filter((b) => !up.includes(b));

  return (
    <div className="stack">
      <h1>Мои записи</h1>
      {!up.length && (
        <div className="empty">
          <Icon name="calendar" />
          <p>Предстоящих записей нет.</p>
          <button className="btn primary" onClick={goBook}>Записаться</button>
        </div>
      )}
      {up.map((b) => <BookingCard key={b.id} b={b} onChanged={upd} />)}
      {past.length > 0 && (
        <details className="stack">
          <summary className="muted" style={{ minHeight: 44, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>История ({past.length})</summary>
          <div className="stack" style={{ marginTop: 8 }}>{past.map((b) => <BookingCard key={b.id} b={b} onChanged={upd} compact />)}</div>
        </details>
      )}
    </div>
  );
}
