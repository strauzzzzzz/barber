import { useEffect, useRef, useState } from 'react';
import type { BookingDTO, ChatBlock, ChatResponse, Draft } from '../../shared/types';
import { CHAT, TEXTS } from '../../shared/config';
import { dateLabel, dateLong } from '../../shared/time';
import { api, ApiError } from '../lib/api';
import { minutes, reviewsLabel, rub } from '../lib/hooks';
import { loadJson, loadProfile, saveJson, saveProfile } from '../lib/session';
import { Icon } from './Icons';
import { BookingCard } from './MyBookings';
import { ContactForm, validateContact, type Contact, type ContactErrors } from './ContactForm';

interface Msg { id: string; role: 'user' | 'assistant'; text: string; blocks?: ChatBlock[]; error?: boolean; booked?: BookingDTO; dismissed?: boolean }
const uid = () => Math.random().toString(36).slice(2);
const GREETING: Msg = { id: 'hello', role: 'assistant', text: TEXTS.greeting };

function MasterLine({ m }: { m: { name: string; rating: number; reviews: number; recommended?: boolean } }) {
  return (
    <div className="row">
      <span className="avatar" aria-hidden="true" style={{ width: 36, height: 36, fontSize: 13 }}>{m.name[0]}</span>
      <span className="grow">
        <b>{m.name}</b>
        <span className="small muted" style={{ display: 'block' }}><span className="stars" aria-hidden="true">★</span> <span className="num">{m.rating.toFixed(1)}</span> · {reviewsLabel(m.reviews)}</span>
      </span>
      {m.recommended && <span className="badge">Выбор клиентов</span>}
    </div>
  );
}

function SlotsCard({ b, onPick, disabled }: { b: Extract<ChatBlock, { type: 'slots' }>; onPick: (g: Extract<ChatBlock, { type: 'slots' }>['groups'][number], t: string) => void; disabled: boolean }) {
  return (
    <div className="rich">
      <div className="row between">
        <b>{b.service.name}</b>
        <span className="price">{rub(b.service.price)}</span>
      </div>
      <p className="xs faint" style={{ marginTop: -8 }}>{minutes(b.service.duration_min)} · выберите время</p>
      {b.groups.map((g) => (
        <div className="group" key={g.master.id + g.date}>
          <MasterLine m={g.master} />
          <p className="label">{dateLabel(g.date)}</p>
          <div className="chips">
            {g.times.slice(0, 8).map((t) => (
              <button key={t} className="chip" disabled={disabled} aria-label={`${g.master.name}, ${dateLong(g.date)}, ${t}`} onClick={() => onPick(g, t)}>{t}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DraftCard({ draft, m, onBooked, onEdit, onTaken }: { draft: Draft; m: Msg; onBooked: (b: BookingDTO) => void; onEdit: () => void; onTaken: () => void }) {
  const [c, setC] = useState<Contact>(() => ({ ...loadProfile(), consent: false, reminders: true }));
  const [errors, setErrors] = useState<ContactErrors>({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  if (m.booked) return (
    <div className="rich done" role="status"><div className="row"><Icon name="check" /><b>Запись создана</b><span className="code num" style={{ marginLeft: 'auto', fontSize: 15 }}>{m.booked.code}</span></div></div>
  );
  if (m.dismissed) return <div className="rich done"><p className="small muted">Запись не подтверждена</p></div>;

  async function confirm() {
    const er = validateContact(c);
    setErrors(er);
    if (Object.keys(er).length) return;
    setBusy(true); setFail('');
    try {
      const { booking } = await api.book({ service_id: draft.service_id, master_id: draft.master_id, date: draft.date, time: draft.time, name: c.name, phone: c.phone, consent: c.consent, reminders: c.reminders, source: 'chat' });
      saveProfile({ name: c.name, phone: c.phone });
      onBooked(booking);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'SLOT_TAKEN') return onTaken();
      setFail(err.message); setBusy(false);
    }
  }
  return (
    <div className="rich">
      <dl className="kv">
        <dt>Услуга</dt><dd>{draft.service_name}</dd>
        <dt>Мастер</dt><dd>{draft.master_name}</dd>
        <dt>Когда</dt><dd className="num">{dateLong(draft.date)}, {draft.time}</dd>
        <dt>Длительность</dt><dd>{minutes(draft.duration_min)}</dd>
        <dt>Цена</dt><dd className="num">{rub(draft.price)}</dd>
      </dl>
      <ContactForm value={c} onChange={setC} errors={errors} idp={`d-${m.id}`} />
      {fail && <p className="err" role="alert">{fail}</p>}
      <div className="row">
        <button className="btn primary grow" disabled={busy} onClick={confirm}>{busy && <span className="spin" />}Подтвердить</button>
        <button className="btn" disabled={busy} onClick={onEdit}>Изменить</button>
      </div>
    </div>
  );
}

function BookingsList({ items }: { items: BookingDTO[] }) {
  const [list, setList] = useState(items);
  return <div className="stack" style={{ width: '100%' }}>{list.map((b) => <BookingCard key={b.id} b={b} onChanged={(x) => setList((l) => l.map((y) => (y.id === x.id ? x : y)))} />)}</div>;
}

export function Chat({ online }: { online: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>(() => { const s = loadJson<Msg[]>('br_chat', []); return s.length ? s : [GREETING]; });
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { saveJson('br_chat', msgs.slice(-40)); }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [msgs, loading]);

  const patch = (id: string, p: Partial<Msg>) => setMsgs((l) => l.map((m) => (m.id === id ? { ...m, ...p } : m)));
  const add = (m: Omit<Msg, 'id'>) => setMsgs((l) => [...l, { ...m, id: uid() }]);

  async function run(userText: string | null, call: (history: Msg[]) => Promise<ChatResponse>) {
    if (loading) return;
    if (!online) return add({ role: 'assistant', text: TEXTS.offlineChat, error: true });
    const history = userText ? [...msgs, { id: uid(), role: 'user' as const, text: userText }] : msgs;
    if (userText) setMsgs(history);
    setLoading(true);
    try {
      const r = await call(history);
      add({ role: 'assistant', text: r.reply, blocks: r.blocks });
    } catch (e) {
      add({ role: 'assistant', text: (e as ApiError).message, error: true });
    } finally { setLoading(false); }
  }

  const wire = (h: Msg[]) => h.filter((m) => !m.error).slice(-CHAT.maxHistory - 2).map((m) => ({ role: m.role, text: m.text, blocks: m.role === 'assistant' ? m.blocks : undefined }));
  const send = (t: string) => { const v = t.trim(); if (v) { setText(''); void run(v, (h) => api.chat({ messages: wire(h) })); } };
  const propose = (a: { service_id: string; master_id: string; date: string; time: string }, label: string | null) =>
    run(label, () => api.chat({ messages: [], action: { type: 'propose', ...a } }));

  const lastIdx = msgs.length - 1;
  return (
    <div className="chat">
      <div className="chat-scroll" role="log" aria-live="polite" aria-label="Диалог с помощником">
        {msgs.map((m, i) => (
          <div key={m.id} className={`msg ${m.role === 'user' ? 'me' : 'bot'}${m.error ? ' bad' : ''}${m.blocks?.length ? ' wide' : ''}`}>
            <div className="bubble" role={m.error ? 'alert' : undefined}>{m.text}</div>
            {m.blocks?.map((b, k) => {
              if (b.type === 'slots') return (
                <SlotsCard key={k} b={b} disabled={loading || i !== lastIdx}
                  onPick={(g, t) => propose({ service_id: b.service.id, master_id: g.master.id, date: g.date, time: t }, `${g.master.name}, ${dateLabel(g.date)}, ${t}`)} />
              );
              if (b.type === 'masters') return (
                <div key={k} className="stack" style={{ width: '100%' }}>
                  {b.masters.map((x) => (
                    <div key={x.id} className="rich" style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <div className="grow"><MasterLine m={x} /><p className="xs faint" style={{ marginTop: 4 }}>{x.title}</p></div>
                      <button className="btn sm" disabled={loading || i !== lastIdx} onClick={() => send(`Хочу к мастеру ${x.name}`)}>Выбрать</button>
                    </div>
                  ))}
                </div>
              );
              if (b.type === 'draft') return (
                <DraftCard key={k} draft={b.draft} m={m}
                  onBooked={(bk) => { patch(m.id, { booked: bk }); add({ role: 'assistant', text: `Готово, вы записаны: ${bk.service.name}, ${bk.master.name}, ${dateLong(bk.date)} в ${bk.time}. Код записи: ${bk.code}.` }); }}
                  onEdit={() => { patch(m.id, { dismissed: true }); send('Хочу изменить запись: другое время или мастера'); }}
                  onTaken={() => { patch(m.id, { dismissed: true }); void propose({ service_id: b.draft.service_id, master_id: b.draft.master_id, date: b.draft.date, time: b.draft.time }, null); }} />
              );
              return <BookingsList key={k} items={b.bookings} />;
            })}
          </div>
        ))}
        {loading && <div className="msg bot" aria-label="Помощник печатает" role="status"><div className="bubble typing"><i /><i /><i /></div></div>}
        {!loading && (
          <div className="suggest" aria-label="Быстрые подсказки">
            {TEXTS.quick.map((q) => <button key={q.label} className="chip" onClick={() => send(q.text)}>{q.label}</button>)}
          </div>
        )}
        <div ref={end} />
      </div>
      <form className="composer glass" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <label className="sr" htmlFor="chat-input">Сообщение</label>
        <input id="chat-input" className="input" value={text} maxLength={CHAT.maxMessageChars} autoComplete="off" enterKeyHint="send"
          disabled={!online} placeholder={online ? 'Когда вам удобно?' : 'Чат требует интернета'} onChange={(e) => setText(e.target.value)} />
        <button className="send" type="submit" aria-label="Отправить" disabled={!online || loading || !text.trim()}><Icon name="send" /></button>
      </form>
    </div>
  );
}
