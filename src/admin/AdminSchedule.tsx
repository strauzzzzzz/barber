import { useCallback, useEffect, useState } from 'react';
import type { Break, Exception, Master, Rule } from '../../shared/types';
import { dateLabel } from '../../shared/time';
import { sb } from '../lib/supabase';

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const hm = (t: string | null | undefined) => (t ?? '').slice(0, 5);
type Brk = Break & { id: string };
type Exc = Exception & { id: string; note: string };
const KIND = { off: 'Разовый выходной', vacation: 'Отпуск', hours: 'Особые часы' } as const;

export function AdminSchedule() {
  const [masters, setMasters] = useState<Master[]>([]);
  const [mid, setMid] = useState('');
  const [rules, setRules] = useState<Rule[]>([]);
  const [breaks, setBreaks] = useState<Brk[]>([]);
  const [excs, setExcs] = useState<Exc[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    sb.from('masters').select('*').order('sort').then(({ data, error }) => {
      if (error) return setError(error.message);
      setMasters(data as Master[]); setMid((data as Master[])[0]?.id ?? '');
    });
  }, []);

  const load = useCallback(async () => {
    if (!mid) return;
    const [r, b, e] = await Promise.all([
      sb.from('schedule_rules').select('*').eq('master_id', mid),
      sb.from('schedule_breaks').select('*').eq('master_id', mid).order('start_time'),
      sb.from('schedule_exceptions').select('*').eq('master_id', mid).order('date_from'),
    ]);
    const er = r.error || b.error || e.error;
    if (er) return setError(er.message);
    setRules(r.data as Rule[]); setBreaks(b.data as Brk[]); setExcs(e.data as Exc[]);
  }, [mid]);
  useEffect(() => { void load(); }, [load]);

  const done = (msg: string, error?: { message: string } | null) => { if (error) setError(error.message); else { setError(''); setSaved(msg); setTimeout(() => setSaved(''), 2500); } };

  return (
    <div className="stack">
      <div className="field" style={{ maxWidth: 320 }}>
        <label htmlFor="sm">Мастер</label>
        <select id="sm" className="input" value={mid} onChange={(e) => setMid(e.target.value)}>{masters.map((m) => <option key={m.id} value={m.id}>{m.name}{m.active ? '' : ' (скрыт)'}</option>)}</select>
      </div>
      <p className="small muted" role="status">Изменения применяются сразу: свободные слоты и ответы бота считаются из этих данных. {saved && <b style={{ color: 'var(--ok)' }}>Сохранено ✓</b>}</p>
      {error && <p className="err" role="alert">{error}</p>}

      <section className="card">
        <h2 style={{ marginBottom: 8 }}>Часы работы по дням недели</h2>
        {DAYS.map((name, i) => {
          const rule = rules.find((r) => r.weekday === i + 1);
          // ключ включает загруженные часы: после загрузки/сохранения форма дня пересоздаётся с актуальными значениями
          return (
          <DayRow key={`${mid}-${i}-${rule?.start_time}-${rule?.end_time}`} wd={i + 1} name={name} rule={rule} breaks={breaks.filter((b) => b.weekday === i + 1)}
            onSave={async (start, end) => {
              const { error } = start ? await sb.from('schedule_rules').upsert({ master_id: mid, weekday: i + 1, start_time: start, end_time: end }, { onConflict: 'master_id,weekday' })
                : await sb.from('schedule_rules').delete().eq('master_id', mid).eq('weekday', i + 1);
              done('День сохранён', error); await load();
            }}
            onAddBreak={async (s, e) => { const { error } = await sb.from('schedule_breaks').insert({ master_id: mid, weekday: i + 1, start_time: s, end_time: e }); done('Перерыв добавлен', error); await load(); }}
            onDelBreak={async (id) => { const { error } = await sb.from('schedule_breaks').delete().eq('id', id); done('Перерыв удалён', error); await load(); }} />
          );
        })}
      </section>

      <section className="card stack">
        <h2>Исключения: выходные, отпуск, особые часы</h2>
        {excs.map((x) => (
          <div key={x.id} className="row between" style={{ flexWrap: 'wrap' }}>
            <span><b>{KIND[x.kind]}</b> · <span className="num">{dateLabel(x.date_from)}{x.date_to !== x.date_from && ` — ${dateLabel(x.date_to)}`}</span>{x.kind === 'hours' && <span className="num"> · {hm(x.start_time)}–{hm(x.end_time)}</span>}{x.note && <span className="muted"> · {x.note}</span>}</span>
            <button className="btn sm danger" aria-label={`Удалить исключение ${dateLabel(x.date_from)}`} onClick={async () => { const { error } = await sb.from('schedule_exceptions').delete().eq('id', x.id); done('Удалено', error); await load(); }}>Удалить</button>
          </div>
        ))}
        {!excs.length && <p className="muted small">Исключений нет</p>}
        <ExcForm onAdd={async (v) => { const { error } = await sb.from('schedule_exceptions').insert({ master_id: mid, ...v }); done('Исключение добавлено', error); await load(); }} />
      </section>
    </div>
  );
}

function DayRow({ wd, name, rule, breaks, onSave, onAddBreak, onDelBreak }: {
  wd: number; name: string; rule?: Rule; breaks: Brk[];
  onSave: (start: string | null, end: string | null) => void; onAddBreak: (s: string, e: string) => void; onDelBreak: (id: string) => void;
}) {
  const [work, setWork] = useState(!!rule);
  const [start, setStart] = useState(hm(rule?.start_time) || '10:00');
  const [end, setEnd] = useState(hm(rule?.end_time) || '20:00');
  const [bs, setBs] = useState('14:00');
  const [be, setBe] = useState('15:00');
  const dirty = work !== !!rule || (work && (start !== hm(rule?.start_time) || end !== hm(rule?.end_time)));
  return (
    <div className="day-row">
      <label className="check" style={{ padding: 0 }}>
        <input type="checkbox" checked={work} onChange={(e) => setWork(e.target.checked)} />
        <span><b style={{ color: 'var(--text)' }}>{name}</b><span className="xs faint" style={{ display: 'block' }}>{work ? 'Работает' : 'Выходной'}</span></span>
      </label>
      <div className="stack" style={{ gap: 8 }}>
        {work && (
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <label className="sr" htmlFor={`s${wd}`}>{name}: начало</label><input id={`s${wd}`} className="input num time-in" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
            <span aria-hidden="true">—</span>
            <label className="sr" htmlFor={`e${wd}`}>{name}: конец</label><input id={`e${wd}`} className="input num time-in" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
        {dirty && <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={work && end <= start} onClick={() => onSave(work ? start : null, work ? end : null)}>Сохранить день</button>}
        {rule && work && (
          <div className="chips" style={{ alignItems: 'center' }}>
            {breaks.map((b) => <span key={b.id} className="badge num">Перерыв {hm(b.start_time)}–{hm(b.end_time)} <button aria-label="Удалить перерыв" onClick={() => onDelBreak(b.id)} style={{ minWidth: 24, minHeight: 24 }}>×</button></span>)}
            <input aria-label={`${name}: начало перерыва`} className="input num time-in" style={{ minHeight: 44 }} type="time" value={bs} onChange={(e) => setBs(e.target.value)} />
            <input aria-label={`${name}: конец перерыва`} className="input num time-in" style={{ minHeight: 44 }} type="time" value={be} onChange={(e) => setBe(e.target.value)} />
            <button className="btn sm" disabled={be <= bs} onClick={() => onAddBreak(bs, be)}>+ Перерыв</button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExcForm({ onAdd }: { onAdd: (v: { kind: string; date_from: string; date_to: string; start_time: string | null; end_time: string | null; note: string }) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [kind, setKind] = useState<keyof typeof KIND>('off');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [s, setS] = useState('12:00');
  const [e, setE] = useState('16:00');
  const [note, setNote] = useState('');
  const single = kind !== 'vacation';
  const bad = (!single && to < from) || (kind === 'hours' && e <= s);
  return (
    <div className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <div className="grid-2">
        <div className="field"><label htmlFor="xk">Тип</label><select id="xk" className="input" value={kind} onChange={(ev) => setKind(ev.target.value as keyof typeof KIND)}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label htmlFor="xf">{single ? 'Дата' : 'С даты'}</label><input id="xf" className="input num" type="date" value={from} onChange={(ev) => { setFrom(ev.target.value); if (single) setTo(ev.target.value); }} /></div>
        {!single && <div className="field"><label htmlFor="xt">По дату</label><input id="xt" className="input num" type="date" value={to} min={from} onChange={(ev) => setTo(ev.target.value)} /></div>}
        {kind === 'hours' && <>
          <div className="field"><label htmlFor="xs">С</label><input id="xs" className="input num" type="time" value={s} onChange={(ev) => setS(ev.target.value)} /></div>
          <div className="field"><label htmlFor="xe">До</label><input id="xe" className="input num" type="time" value={e} onChange={(ev) => setE(ev.target.value)} /></div>
        </>}
        <div className="field"><label htmlFor="xn">Заметка</label><input id="xn" className="input" value={note} maxLength={80} onChange={(ev) => setNote(ev.target.value)} /></div>
      </div>
      <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={bad} onClick={() => onAdd({ kind, date_from: from, date_to: single ? from : to, start_time: kind === 'hours' ? s : null, end_time: kind === 'hours' ? e : null, note })}>Добавить исключение</button>
    </div>
  );
}
