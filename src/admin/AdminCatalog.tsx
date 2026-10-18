import { useCallback, useEffect, useState } from 'react';
import type { Catalog, Master, Service } from '../../shared/types';
import { sb } from '../lib/supabase';
import { loadCatalog } from './AdminBookings';

/** Услуги/цены и мастера. Скрытие (active=false) вместо удаления: на них ссылаются записи. */
export function AdminCatalog({ kind }: { kind: 'services' | 'masters' }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const load = useCallback(() => loadCatalog().then(setCat).catch((e) => setError(e.message)), []);
  useEffect(() => { void load(); }, [load]);
  const done = async (error?: { message: string } | null) => {
    if (error) return setError(error.message);
    setError(''); setSaved('Сохранено ✓'); setTimeout(() => setSaved(''), 2500); await load();
  };
  if (!cat) return error ? <p className="err" role="alert">{error}</p> : <div className="skel" style={{ height: 200 }} aria-busy="true" />;
  return (
    <div className="stack">
      {error && <p className="err" role="alert">{error}</p>}
      <p className="small muted" role="status">{saved || 'Изменения сразу видны клиентам и боту.'}</p>
      {kind === 'services'
        ? <>{cat.services.map((s) => <ServiceRow key={s.id} s={s} onSave={async (v) => done((await sb.from('services').update(v).eq('id', s.id)).error)} />)}
            <ServiceRow onSave={async (v) => done((await sb.from('services').insert({ ...v, sort: cat.services.length + 1 })).error)} /></>
        : <>{cat.masters.map((m) => <MasterRow key={m.id} m={m} cat={cat} done={done} />)}
            <MasterRow cat={cat} done={done} /></>}
    </div>
  );
}

type SVal = Pick<Service, 'name' | 'description' | 'duration_min' | 'price' | 'active'>;
function ServiceRow({ s, onSave }: { s?: Service; onSave: (v: SVal) => Promise<void> }) {
  const [v, setV] = useState<SVal>(s ?? { name: '', description: '', duration_min: 60, price: 0, active: true });
  const ok = v.name.trim().length > 1 && v.duration_min >= 5 && v.price >= 0;
  const id = s?.id ?? 'new-s';
  return (
    <div className="card stack">
      <h3>{s ? s.name : 'Новая услуга'}</h3>
      <div className="grid-2">
        <div className="field"><label htmlFor={`n${id}`}>Название</label><input id={`n${id}`} className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`d${id}`}>Описание</label><input id={`d${id}`} className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
        <div className="field"><label htmlFor={`t${id}`}>Длительность, мин</label><input id={`t${id}`} className="input num" type="number" inputMode="numeric" min={5} step={5} value={v.duration_min} onChange={(e) => setV({ ...v, duration_min: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor={`p${id}`}>Цена, ₽</label><input id={`p${id}`} className="input num" type="number" inputMode="numeric" min={0} step={50} value={v.price} onChange={(e) => setV({ ...v, price: Number(e.target.value) })} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /><span>Показывать клиентам</span></label>
      <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={!ok} onClick={async () => { await onSave({ ...v, name: v.name.trim() }); if (!s) setV({ name: '', description: '', duration_min: 60, price: 0, active: true }); }}>{s ? 'Сохранить' : 'Добавить услугу'}</button>
    </div>
  );
}

function MasterRow({ m, cat, done }: { m?: Master; cat: Catalog; done: (e?: { message: string } | null) => Promise<void> }) {
  const [v, setV] = useState({ name: m?.name ?? '', title: m?.title ?? '', rating: m?.rating ?? 5, reviews_count: m?.reviews_count ?? 0, active: m?.active ?? true });
  const [svc, setSvc] = useState<string[]>(m ? cat.links.filter((l) => l.master_id === m.id).map((l) => l.service_id) : []);
  const id = m?.id ?? 'new-m';
  async function save() {
    const row = { ...v, name: v.name.trim(), rating: Math.min(5, Math.max(0, v.rating)) };
    let mid = m?.id;
    if (m) {
      const r = await sb.from('masters').update(row).eq('id', m.id);
      if (r.error) return done(r.error);
    } else {
      const r = await sb.from('masters').insert({ ...row, sort: cat.masters.length + 1 }).select('id').single();
      if (r.error) return done(r.error);
      mid = r.data.id;
    }
    // услуги мастера: заменяем набор целиком
    const del = await sb.from('master_services').delete().eq('master_id', mid!);
    if (del.error) return done(del.error);
    if (svc.length) { const ins = await sb.from('master_services').insert(svc.map((service_id) => ({ master_id: mid, service_id }))); if (ins.error) return done(ins.error); }
    await done();
    if (!m) { setV({ name: '', title: '', rating: 5, reviews_count: 0, active: true }); setSvc([]); }
  }
  return (
    <div className="card stack">
      <h3>{m ? m.name : 'Новый мастер'}{m && !m.active && <span className="badge" style={{ marginLeft: 8 }}>Скрыт</span>}</h3>
      <div className="grid-2">
        <div className="field"><label htmlFor={`n${id}`}>Имя</label><input id={`n${id}`} className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`t${id}`}>Должность</label><input id={`t${id}`} className="input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="field"><label htmlFor={`r${id}`}>Рейтинг (0–5)</label><input id={`r${id}`} className="input num" type="number" inputMode="decimal" min={0} max={5} step={0.1} value={v.rating} onChange={(e) => setV({ ...v, rating: Number(e.target.value) })} /></div>
        <div className="field"><label htmlFor={`c${id}`}>Число отзывов</label><input id={`c${id}`} className="input num" type="number" inputMode="numeric" min={0} value={v.reviews_count} onChange={(e) => setV({ ...v, reviews_count: Number(e.target.value) })} /></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Какие услуги делает</legend>
        <div className="chips">
          {cat.services.map((s) => (
            <button key={s.id} type="button" className="chip" aria-pressed={svc.includes(s.id)} onClick={() => setSvc(svc.includes(s.id) ? svc.filter((x) => x !== s.id) : [...svc, s.id])}>{s.name}</button>
          ))}
        </div>
      </fieldset>
      <label className="check"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /><span>Показывать клиентам (снимите, чтобы скрыть мастера)</span></label>
      <button className="btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={v.name.trim().length < 2} onClick={save}>{m ? 'Сохранить' : 'Добавить мастера'}</button>
    </div>
  );
}
