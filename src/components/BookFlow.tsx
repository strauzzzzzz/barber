import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookingDTO, Master, Service } from '../../shared/types';
import { dateLong } from '../../shared/time';
import { SALON } from '../../shared/config';
import { api, ApiError } from '../lib/api';
import { minutes, reviewsLabel, rub, useCatalog } from '../lib/hooks';
import { loadProfile, saveProfile } from '../lib/session';
import { Icon } from './Icons';
import { SlotPicker, type Picked } from './SlotPicker';
import { ContactForm, validateContact, type Contact, type ContactErrors } from './ContactForm';

const TITLES = ['Услуга', 'Мастер', 'Дата и время', 'Ваши данные', 'Подтверждение'];

export function MasterRow({ m, recommended }: { m: Master; recommended?: boolean }) {
  return (
    <>
      <span className="avatar" aria-hidden="true">{m.name[0]}</span>
      <span className="grow">
        <b>{m.name}</b>
        <span className="small muted" style={{ display: 'block' }}>
          <span className="stars" aria-hidden="true">★</span> <span className="num">{m.rating.toFixed(1)}</span> · {reviewsLabel(m.reviews_count)}
        </span>
        {m.title && <span className="xs faint" style={{ display: 'block' }}>{m.title}</span>}
      </span>
      {recommended && <span className="badge">Выбор клиентов</span>}
    </>
  );
}

export function BookFlow({ onDone }: { onDone: () => void }) {
  const { data: cat, error, reload } = useCatalog();
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Service | null>(null);
  const [masterId, setMasterId] = useState<string | 'any' | null>(null);
  const [pick, setPick] = useState<Picked | null>(null);
  const [contact, setContact] = useState<Contact>(() => ({ ...loadProfile(), consent: false, reminders: true }));
  const [errors, setErrors] = useState<ContactErrors>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const [done, setDone] = useState<BookingDTO | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const prev = useRef(0);
  const back = step < prev.current ? ' back' : '';
  useEffect(() => { prev.current = step; }, [step]);

  useEffect(() => { top.current?.scrollIntoView({ block: 'start' }); }, [step, done]);

  const masters = useMemo(() => {
    if (!cat || !service) return [];
    return cat.masters.filter((m) => cat.links.some((l) => l.master_id === m.id && l.service_id === service.id));
  }, [cat, service]);
  const bestId = masters.length > 1 ? masters.reduce((a, b) => (b.reviews_count > a.reviews_count ? b : a)).id : null;

  if (error) return <div className="card stack" role="alert"><p className="err">{error}</p><button className="btn" onClick={reload}>Повторить</button></div>;
  if (!cat) return <div className="stack" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 72 }} />)}</div>;

  const master = pick ? cat.masters.find((m) => m.id === pick.masterId) : undefined;

  if (done) return (
    <div className="empty" role="status">
      <div className="ok-mark"><Icon name="check" /></div>
      <h1>Вы записаны</h1>
      <p>{done.service.name} · {done.master.name}<br />{dateLong(done.date)}, <span className="num">{done.time}</span></p>
      <p className="muted small">Код записи</p><p className="code num">{done.code}</p>
      <p className="muted small">Сохраните код — по нему можно отменить запись. Адрес: {SALON.address}</p>
      <button className="btn primary block" onClick={onDone}>Мои записи</button>
      <button className="btn block" onClick={() => { setDone(null); setStep(0); setService(null); setMasterId(null); setPick(null); }}>Записаться ещё</button>
    </div>
  );

  async function submit() {
    if (!service || !pick) return;
    setBusy(true); setFail('');
    try {
      const { booking } = await api.book({ service_id: service.id, master_id: pick.masterId, date: pick.date, time: pick.time, name: contact.name, phone: contact.phone, consent: contact.consent, reminders: contact.reminders, source: 'web' });
      saveProfile({ name: contact.name, phone: contact.phone });
      setDone(booking);
    } catch (e) {
      const err = e as ApiError;
      setFail(err.message);
      if (err.code === 'SLOT_TAKEN') setPick(null);
    } finally { setBusy(false); }
  }

  const next = () => {
    if (step === 3) {
      const er = validateContact(contact);
      setErrors(er);
      if (Object.keys(er).length) return;
    }
    setStep(step + 1);
  };

  return (
    <div className="stack">
      <div ref={top} />
      <div className="stack" style={{ gap: 8 }}>
        <div className="steps" aria-hidden="true">{TITLES.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <div className="row">
          {step > 0 && <button className="icon-btn" aria-label="Назад" onClick={() => { setFail(''); setStep(step - 1); }}><Icon name="left" /></button>}
          <div className="grow"><p className="xs faint">Шаг {step + 1} из {TITLES.length}</p><h1>{TITLES[step]}</h1></div>
        </div>
      </div>

      <div key={step} className={`slide stack${back}`}>
      {step === 0 && (
        <div className="stack" role="radiogroup" aria-label="Услуга">
          {cat.services.map((s) => (
            <button key={s.id} role="radio" aria-checked={service?.id === s.id} className="card pick"
              onClick={() => { setService(s); setMasterId(null); setPick(null); setStep(1); }}>
              <span className="grow"><b>{s.name}</b><span className="small muted" style={{ display: 'block' }}>{s.description} · {minutes(s.duration_min)}</span></span>
              <span className="price">{rub(s.price)}</span>
            </button>
          ))}
        </div>
      )}

      {step === 1 && (
        <div className="stack" role="radiogroup" aria-label="Мастер">
          <button role="radio" aria-checked={masterId === 'any'} className="card pick" onClick={() => { setMasterId('any'); setPick(null); setStep(2); }}>
            <span className="avatar" aria-hidden="true"><Icon name="user" /></span>
            <span className="grow"><b>Любой мастер</b><span className="small muted" style={{ display: 'block' }}>Покажем всё свободное время</span></span>
          </button>
          {masters.map((m) => (
            <button key={m.id} role="radio" aria-checked={masterId === m.id} className="card pick" onClick={() => { setMasterId(m.id); setPick(null); setStep(2); }}>
              <MasterRow m={m} recommended={m.id === bestId} />
            </button>
          ))}
        </div>
      )}

      {step === 2 && service && (
        <>
          <SlotPicker serviceId={service.id} masterId={masterId === 'any' ? null : masterId} masters={masters} value={pick} onChange={setPick} />
          <button className="btn primary block cta" disabled={!pick} onClick={next}>Далее</button>
        </>
      )}

      {step === 3 && (
        <>
          <ContactForm value={contact} onChange={setContact} errors={errors} />
          <button className="btn primary block cta" onClick={next}>Далее</button>
        </>
      )}

      {step === 4 && service && pick && (
        <>
          <dl className="card kv">
            <dt>Услуга</dt><dd>{service.name}</dd>
            <dt>Мастер</dt><dd>{master?.name}</dd>
            <dt>Дата</dt><dd>{dateLong(pick.date)}</dd>
            <dt>Время</dt><dd className="num">{pick.time} · {minutes(service.duration_min)}</dd>
            <dt>Цена</dt><dd className="num">{rub(service.price)}</dd>
            <dt>Имя</dt><dd>{contact.name}</dd>
            <dt>Телефон</dt><dd className="num">{contact.phone}</dd>
          </dl>
          {fail && <p className="err" role="alert">{fail}</p>}
          <button className="btn primary block cta" disabled={busy} onClick={submit}>{busy && <span className="spin" />}Подтвердить запись</button>
        </>
      )}

      {step === 4 && !pick && (
        <div className="stack">
          {fail && <p className="err" role="alert">{fail}</p>}
          <button className="btn primary block" onClick={() => { setFail(''); setStep(2); }}>Выбрать другое время</button>
        </div>
      )}
      </div>
    </div>
  );
}
