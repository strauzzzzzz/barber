import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BookingRow, Catalog } from '../../shared/types';
import { SALON, STATUS_LABELS } from '../../shared/config';
import { addDays, dateLabel, msToLocal, todayIn, zonedToMs } from '../../shared/time';
import { normalizePhone } from '../../shared/validate';
import { sb } from '../lib/supabase';
import { rub } from '../lib/hooks';
import { Sheet } from '../components/Sheet';
import { Icon } from '../components/Icons';

const TZ = SALON.timezone;
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[n % 31]).join('');

export async function loadCatalog(): Promise<Catalog> {
  const [s, m, l] = await Promise.all([sb.from('services').select('*').order('sort'), sb.from('masters').select('*').order('sort'), sb.from('master_services').select('master_id, service_id')]);
  const err = s.error || m.error || l.error;
  if (err) throw new Error(err.message);
  return { services: s.data!, masters: m.data!.map((x: any) => ({ ...x, rating: Number(x.rating) })), links: l.data! };
}

export function AdminBookings() {
  const [range, setRange] = useState<'today' | 'week'>('today');
  const [cat, setCat] = useState<Catalog | null>(null);
  const [rows, setRows] = useState<BookingRow[] | null>(null);
  const [error, setError] = useState('');
  const [add, setAdd] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const today = todayIn(TZ);
      const from = new Date(zonedToMs(today, '00:00', TZ)).toISOString();
      const to = new Date(zonedToMs(addDays(today, range === 'today' ? 1 : 7), '00:00', TZ)).toISOString();
      const [c, b] = await Promise.all([loadCatalog(), sb.from('bookings').select('*').gte('starts_at', from).lt('starts_at', to).order('starts_at')]);
      if (b.error) throw new Error(b.error.message);
      setCat(c); setRows(b.data as BookingRow[]);
    } catch (e) { setError((e as Error).message); }
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  async function setStatus(id: string, status: string) {
    const { error } = await sb.from('bookings').update({ status }).eq('id', id);
    if (error) setError(error.code === '23P01' || error.code === '23505' ? 'Это время у мастера уже занято другой записью' : error.message);
    await load();
  }

  const groups = useMemo(() => {
    const g = new Map<string, BookingRow[]>();
    for (const r of rows ?? []) { const d = msToLocal(Date.parse(r.starts_at), TZ).date; g.set(d, [...(g.get(d) ?? []), r]); }
    return [...g];
  }, [rows]);

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap' }}>
        <div className="row">
          {(['today', 'week'] as const).map((r) => <button key={r} className="chip" aria-pressed={range === r} onClick={() => setRange(r)}>{r === 'today' ? 'Сегодня' : 'Неделя'}</button>)}
        </div>
        <button className="btn primary sm" onClick={() => setAdd(true)}><Icon name="plus" small />Ручная запись</button>
      </div>
      {error && <p className="err" role="alert">{error}</p>}
      {!rows && !error && <div className="skel" style={{ height: 160 }} aria-busy="true" />}
      {rows && !rows.length && <div className="empty">Записей нет</div>}
      {cat && groups.map(([d, list]) => (
        <section key={d} className="stack">
          <h3>{dateLabel(d)}</h3>
          {list.map((b) => {
            const svc = cat.services.find((s) => s.id === b.service_id);
            const m = cat.masters.find((x) => x.id === b.master_id);
            return (
              <div key={b.id} className="card tight row" style={{ flexWrap: 'wrap' }}>
                <b className="num" style={{ width: 52 }}>{msToLocal(Date.parse(b.starts_at), TZ).time}</b>
                <div className="grow" style={{ minWidth: 180 }}>
                  <b>{b.client_name}</b> · <a className="num" href={`tel:${b.client_phone}`}>{b.client_phone}</a>
                  <p className="small muted">{svc?.name} · {m?.name} · <span className="num">{rub(b.price)}</span> · <span className="faint">{b.source}</span></p>
                </div>
                <label className="sr" htmlFor={`st-${b.id}`}>Статус записи {b.client_name}</label>
                <select id={`st-${b.id}`} className="input" style={{ width: 170 }} value={b.status} onChange={(e) => setStatus(b.id, e.target.value)}>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            );
          })}
        </section>
      ))}
      {add && cat && <ManualBooking cat={cat} onClose={() => setAdd(false)} onSaved={() => { setAdd(false); void load(); }} />}
    </div>
  );
}

function ManualBooking({ cat, onClose, onSaved }: { cat: Catalog; onClose: () => void; onSaved: () => void }) {
  const [serviceId, setServiceId] = useState(cat.services.find((s) => s.active)?.id ?? '');
  const masters = cat.masters.filter((m) => m.active && cat.links.some((l) => l.master_id === m.id && l.service_id === serviceId));
  const [masterId, setMasterId] = useState('');
  const [date, setDate] = useState(todayIn(TZ));
  const [time, setTime] = useState('12:00');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const mid = masters.some((m) => m.id === masterId) ? masterId : masters[0]?.id;

  async function save() {
    const svc = cat.services.find((s) => s.id === serviceId);
    const ph = normalizePhone(phone);
    if (!svc || !mid || name.trim().length < 2 || !ph) return setErr('Заполните услугу, мастера, имя и телефон');
    const start = zonedToMs(date, time, TZ);
    const { error } = await sb.from('bookings').insert({
      code: code(), master_id: mid, service_id: svc.id, starts_at: new Date(start).toISOString(), ends_at: new Date(start + svc.duration_min * 60000).toISOString(),
      client_name: name.trim(), client_phone: ph, status: 'confirmed', price: svc.price, source: 'admin', consent_at: new Date().toISOString(),
    });
    if (error) return setErr(error.code === '23P01' || error.code === '23505' ? 'У мастера это время уже занято' : error.message);
    onSaved();
  }
  return (
    <Sheet title="Ручная запись" onClose={onClose}>
      <div className="stack">
        <div className="field"><label htmlFor="ms">Услуга</label><select id="ms" className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>{cat.services.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name} — {rub(s.price)}</option>)}</select></div>
        <div className="field"><label htmlFor="mm">Мастер</label><select id="mm" className="input" value={mid} onChange={(e) => setMasterId(e.target.value)}>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
        <div className="grid-2">
          <div className="field"><label htmlFor="md">Дата</label><input id="md" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field"><label htmlFor="mt">Время</label><input id="mt" className="input num" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></div>
        </div>
        <div className="field"><label htmlFor="mn">Имя клиента</label><input id="mn" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label htmlFor="mp">Телефон</label><input id="mp" className="input num" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn primary block" onClick={save}>Создать запись</button>
      </div>
    </Sheet>
  );
}
