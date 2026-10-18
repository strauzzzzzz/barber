import { describe, expect, it } from 'vitest';
import { handleChat, replyIsGrounded, type ChatDeps } from '../api/_lib/chat';
import { toolDefs, runTool } from '../api/_lib/tools';
import { mockLlm, type Llm } from '../api/_lib/llm';
import { createBooking } from '../api/_lib/booking';
import { CHAT } from '../shared/config';
import { M, NOW, S, store } from './helpers';

const deps = (over: Partial<ChatDeps> = {}): ChatDeps => ({ store: store(), llm: mockLlm, token: 'tok', ip: '1.1.1.1', admin: null, now: NOW, ...over });
const say = (text: string) => ({ messages: [{ role: 'user' as const, text }] });
const names = (admin: boolean) => toolDefs(admin).map((t: any) => t.function.name);

describe('чат-бот', () => {
  it('суточные бюджеты: клиент и весь салон; кнопки карточек бюджет не тратят', async () => {
    const old = { c: CHAT.dailyPerClient, t: CHAT.dailyTotal };
    CHAT.dailyPerClient = 2; CHAT.dailyTotal = 3;
    try {
      const st = store();
      const d = (token: string) => deps({ store: st, token, ip: token });
      await handleChat(d('a'), say('привет'));
      await handleChat(d('a'), { messages: [], action: { type: 'propose', service_id: S.cut, master_id: M.artem, date: '2026-10-20', time: '12:00' } });
      await handleChat(d('a'), say('привет'));
      await expect(handleChat(d('a'), say('привет'))).rejects.toMatchObject({ code: 'DAILY_LIMIT', status: 429 });
      await handleChat(d('b'), say('привет')); // третье сообщение салона за сутки
      await expect(handleChat(d('c'), say('привет'))).rejects.toMatchObject({ code: 'DAILY_LIMIT', message: expect.stringContaining('Сегодня') });
    } finally { CHAT.dailyPerClient = old.c; CHAT.dailyTotal = old.t; }
  });

  it('в промпт попадает каталог из БД без id, схемы инструментов уходят после конечного инструмента', async () => {
    const seen: { sys: string; tools: number }[] = [];
    const spy: Llm = async (m, tools) => { seen.push({ sys: String(m[0].content), tools: tools.length }); return mockLlm(m, tools); };
    await handleChat(deps({ llm: spy }), say('свободное время'));
    expect(seen[0].sys).toContain('Мужская стрижка — 1800 RUB');
    expect(seen[0].sys).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    expect(seen[0].tools).toBeGreaterThan(0);
    expect(seen[1].tools).toBe(0);
  });

  it('карточки слотов строятся из базы; рекомендован мастер с максимумом отзывов', async () => {
    const r = await handleChat(deps(), say('Покажите свободное время сегодня'));
    const b: any = r.blocks.find((x) => x.type === 'slots');
    expect(b.groups.length).toBeGreaterThan(0);
    expect(b.groups.map((g: any) => g.master.name)).not.toContain('Анна'); // Анна не делает мужскую стрижку
    const rec = b.groups.filter((g: any) => g.master.recommended).map((g: any) => g.master.name);
    expect(new Set(rec)).toEqual(new Set(['Артём'])); // 128 отзывов
    for (const g of b.groups) expect(g.date >= '2026-10-19').toBe(true);
  });

  it('выдуманное моделью время заменяется ответом по данным', async () => {
    const liar: Llm = async (m) => (m[m.length - 1].role === 'tool'
      ? { role: 'assistant', content: 'Есть окно в 03:15 за 500 ₽ у мастера Васи' }
      : mockLlm(m, []));
    const r = await handleChat(deps({ llm: liar }), say('свободное время'));
    expect(r.reply).not.toContain('03:15');
    expect(r.blocks.length).toBe(1);
  });

  it('replyIsGrounded: время и цены только из данных', () => {
    const ev = '{"times":["10:00","10:30"],"price_rub":1800}';
    expect(replyIsGrounded('Свободно 10:30, цена 1 800 ₽', ev)).toBe(true);
    expect(replyIsGrounded('Свободно 11:30', ev)).toBe(false);
    expect(replyIsGrounded('Цена 1500 ₽', ev)).toBe(false);
  });

  it('time_from/time_to: «вечером» отдаёт только вечернее время и весь список до конца дня', async () => {
    const out: any = await runTool('get_free_slots', { service: 'Мужская стрижка', master: 'Артём', date_from: '2026-10-20', date_to: '2026-10-20', time_from: '17:00' }, { store: store(), token: 't', now: NOW, admin: null });
    const times = out.result.slots[0].times.split(' ');
    expect(times.every((t: string) => t >= '17:00')).toBe(true);
    expect(times.at(-1)).toBe('19:00'); // последний слот не обрезается
    expect(out.blocks[0].groups[0].times).toEqual(times);
  });

  it('запись не создаётся ботом: propose_booking только показывает карточку', async () => {
    const st = store();
    const out = await runTool('propose_booking', { service: 'Мужская стрижка', master: 'Артём', date: '2026-10-20', time: '12:00' }, { store: st, token: 't', now: NOW, admin: null });
    expect(out.blocks[0].type).toBe('draft');
    expect(await st.bookingsByToken('t')).toHaveLength(0);
    expect(names(false)).not.toContain('create_booking');
  });

  it('кнопка слота (action) проверяется сервером; занятый слот → альтернативы', async () => {
    const ok = await handleChat(deps(), { messages: [], action: { type: 'propose', service_id: S.cut, master_id: M.artem, date: '2026-10-20', time: '12:00' } });
    expect(ok.blocks[0].type).toBe('draft');
    const taken = await handleChat(deps(), { messages: [], action: { type: 'propose', service_id: S.cut, master_id: M.artem, date: '2026-10-20', time: '11:00' } });
    expect(taken.reply).toContain('занято');
    expect(taken.blocks[0].type).toBe('slots');
  });

  it('лимит сообщений: сообщение сверх лимита → 429 с понятным текстом', async () => {
    const d = deps();
    for (let i = 0; i < CHAT.ratePerMinute; i++) await handleChat(d, say('привет'));
    await expect(handleChat(d, say('привет'))).rejects.toMatchObject({ status: 429, code: 'RATE_LIMIT', message: expect.stringContaining('Слишком много') });
  });

  it('слишком длинное сообщение отклоняется', async () => {
    await expect(handleChat(deps(), say('а'.repeat(CHAT.maxMessageChars + 1)))).rejects.toMatchObject({ code: 'TOO_LONG' });
  });

  it('история обрезается до последних K сообщений', async () => {
    let seen = 0;
    const spy: Llm = async (m) => { seen = m.length; return { role: 'assistant', content: 'ок' }; };
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'assistant' : 'user') as 'user' | 'assistant', text: `m${i}` }));
    msgs.push({ role: 'user', text: 'последнее' });
    await handleChat(deps({ llm: spy }), { messages: msgs });
    expect(seen).toBe(1 + CHAT.maxHistory);
  });

  it('админские инструменты скрыты и не работают для клиента', async () => {
    expect(names(false)).not.toContain('admin_list_bookings');
    expect(names(true)).toContain('admin_list_bookings');
    const out = await runTool('admin_list_bookings', { date: '2026-10-20' }, { store: store(), token: 't', now: NOW, admin: null });
    expect(JSON.stringify(out.result)).not.toContain('Олег');
  });

  it('get_my_bookings показывает только записи своей сессии', async () => {
    const st = store();
    await createBooking(st, { service_id: S.cut, master_id: M.artem, date: '2026-10-20', time: '12:00', name: 'Аня', phone: '+79001234567', consent: true, token: 'mine', source: 'chat' }, NOW);
    const mine: any = await runTool('get_my_bookings', {}, { store: st, token: 'mine', now: NOW, admin: null });
    const other: any = await runTool('get_my_bookings', {}, { store: st, token: 'other', now: NOW, admin: null });
    expect(mine.result.bookings).toHaveLength(1);
    expect(other.result.bookings).toHaveLength(0);
    expect(JSON.stringify(mine.result)).not.toContain('+7900');
  });
});
