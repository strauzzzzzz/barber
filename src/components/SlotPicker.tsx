import { useEffect, useMemo, useState } from 'react';
import type { Master, SlotGroup } from '../../shared/types';
import { BOOKING, SALON } from '../../shared/config';
import { addDays, dateLong, isoWeekday, todayIn } from '../../shared/time';
import { api } from '../lib/api';
import { Icon } from './Icons';

export interface Picked { date: string; time: string; masterId: string }
interface Props { serviceId: string; masterId: string | null; excludeId?: string; masters: Master[]; value: Picked | null; onChange: (p: Picked | null) => void }

const DOW = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const monthLabel = (ym: string) => {
  const m = new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(new Date(`${ym}-01T12:00:00Z`));
  return `${m[0].toUpperCase()}${m.slice(1)} ${ym.slice(0, 4)}`;
};
const nextMonth = (ym: string, n: number) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7); };

/** Календарь + время. Данные — тот же /api/slots, что использует бот. «Любой мастер» → лучший по числу отзывов. */
export function SlotPicker({ serviceId, masterId, excludeId, masters, value, onChange }: Props) {
  const today = todayIn(SALON.timezone);
  const last = addDays(today, BOOKING.horizonDays);
  const [groups, setGroups] = useState<SlotGroup[] | null>(null);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(today.slice(0, 7));
  const [date, setDate] = useState<string | null>(value?.date ?? null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setGroups(null); setError('');
    api.slots({ service_id: serviceId, master_id: masterId ?? undefined, date_from: today, date_to: last, exclude: excludeId })
      .then((r) => {
        if (!live) return;
        setGroups(r.groups);
        const first = r.groups.map((g) => g.date).sort()[0];
        setDate((d) => (d && r.groups.some((g) => g.date === d) ? d : first ?? null));
        if (first) setMonth((m) => (value?.date ? m : first.slice(0, 7)));
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, masterId, excludeId, tick]);

  const byDate = useMemo(() => {
    const reviews = (id: string) => masters.find((m) => m.id === id)?.reviews_count ?? 0;
    const out = new Map<string, Map<string, string>>();
    for (const g of groups ?? []) {
      const day = out.get(g.date) ?? new Map<string, string>();
      for (const t of g.times) {
        const cur = day.get(t);
        if (!cur || reviews(g.master_id) > reviews(cur)) day.set(t, g.master_id);
      }
      out.set(g.date, day);
    }
    return out;
  }, [groups, masters]);

  if (error) return (
    <div className="card stack" role="alert">
      <p className="err">{error}</p>
      <button className="btn" onClick={() => setTick((t) => t + 1)}>Повторить</button>
    </div>
  );
  if (!groups) return <div className="skel" style={{ height: 320 }} aria-busy="true" aria-label="Загружаем свободное время" />;
  if (!groups.length) return <div className="card"><p>В ближайшие {BOOKING.horizonDays} дней свободных окон нет. Позвоните нам: {SALON.phone}</p></div>;

  const first = new Date(`${month}-01T12:00:00Z`);
  const lead = (first.getUTCDay() || 7) - 1;
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const day = date ? byDate.get(date) : undefined;
  const times = day ? [...day.keys()].sort() : [];

  return (
    <div className="stack">
      <div className="row between">
        <button className="icon-btn" aria-label="Предыдущий месяц" disabled={month <= today.slice(0, 7)} onClick={() => setMonth(nextMonth(month, -1))}><Icon name="left" /></button>
        <h3>{monthLabel(month)}</h3>
        <button className="icon-btn" aria-label="Следующий месяц" disabled={month >= last.slice(0, 7)} onClick={() => setMonth(nextMonth(month, 1))}><Icon name="right" /></button>
      </div>
      <div className="cal" role="group" aria-label="Выберите день">
        {DOW.map((d) => <div key={d} className="dow" aria-hidden="true">{d}</div>)}
        {Array.from({ length: lead }, (_, i) => <span key={`p${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const d = `${month}-${String(i + 1).padStart(2, '0')}`;
          const free = byDate.has(d);
          return (
            <button key={d} className={`day${d === today ? ' today' : ''}`} disabled={!free} aria-pressed={d === date}
              aria-label={`${dateLong(d)}${free ? '' : ', нет свободного времени'}`}
              onClick={() => { setDate(d); onChange(null); }}>
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="times-box stack" aria-live="polite">
        {date && <p className="label">{dateLong(date)}, {DOW[isoWeekday(date) - 1].toLowerCase()} — свободное время</p>}
        <div className="chips">
          {times.map((t, k) => (
            <button key={date + t} className="chip" style={{ '--k': k } as React.CSSProperties} aria-pressed={value?.date === date && value?.time === t}
              onClick={() => onChange({ date: date!, time: t, masterId: day!.get(t)! })}>
              {t}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
