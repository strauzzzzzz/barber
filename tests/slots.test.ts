import { describe, expect, it } from 'vitest';
import { AppError, cancelBooking, createBooking, freeSlots, rescheduleBooking } from '../api/_lib/booking';
import { M, NOW, S, store } from './helpers';

const slots = async (st = store(), serviceId = S.cut, masterId: string | undefined, from: string, to = from) =>
  (await freeSlots(st, { serviceId, masterId, dateFrom: from, dateTo: to, now: NOW })).groups;
const times = (g: { date: string; times: string[] }[], d: string) => g.find((x) => x.date === d)?.times ?? [];

describe('свободные слоты', () => {
  it('учитывают перерыв 14:00–15:00 и минимальный запас времени', async () => {
    const t = times(await slots(store(), S.cut, M.artem, '2026-10-19'), '2026-10-19');
    expect(t[0]).toBe('10:00');
    expect(t).toContain('13:00');
    expect(t).not.toContain('13:30'); // 13:30–14:30 заходит на перерыв
    expect(t).not.toContain('14:00');
    expect(t).not.toContain('14:30');
    expect(t).toContain('15:00');
    expect(t.at(-1)).toBe('19:00'); // 19:00–20:00 — последний
  });

  it('вычитают существующие записи', async () => {
    const t = times(await slots(store(), S.cut, M.artem, '2026-10-20'), '2026-10-20'); // 11:00–12:00 и 16:00–17:30 заняты
    for (const x of ['10:30', '11:00', '11:30', '15:30', '16:00', '17:00']) expect(t).not.toContain(x);
    for (const x of ['10:00', '12:00', '15:00', '17:30']) expect(t).toContain(x);
  });

  it('разовый выходной: в день 21.10 у Артёма окон нет', async () => {
    expect(await slots(store(), S.cut, M.artem, '2026-10-21')).toEqual([]);
  });

  it('отпуск Дмитрия 26.10–01.11: окон нет, до и после — есть', async () => {
    const g = await slots(store(), S.beard, M.dmitry, '2026-10-24', '2026-11-04');
    const days = g.map((x) => x.date);
    expect(days).toContain('2026-10-25');
    for (const d of ['2026-10-26', '2026-10-27', '2026-10-30', '2026-11-01']) expect(days).not.toContain(d);
    expect(days).toContain('2026-11-03');
  });

  it('особые часы на дату заменяют недельное расписание', async () => {
    const t = times(await slots(store(), S.cut, M.maxim, '2026-10-22'), '2026-10-22');
    expect(t).toEqual(['12:00', '12:30', '13:00', '15:00']);
  });

  it('воскресенье: Артём не работает', async () => {
    expect(await slots(store(), S.cut, M.artem, '2026-10-25')).toEqual([]);
  });

  it('не показывает мастеров, которые не делают услугу', async () => {
    const g = await slots(store(), S.womens, undefined, '2026-10-20');
    expect(g.every((x) => x.master_id === M.anna)).toBe(true);
    await expect(slots(store(), S.womens, M.artem, '2026-10-20')).rejects.toMatchObject({ code: 'NO_MASTER' });
  });
});

const who = { name: 'Тест', phone: '8 900 123-45-67', consent: true, token: 'tok-a', source: 'web' as const };
const slot = { service_id: S.cut, master_id: M.artem, date: '2026-10-20', time: '12:00' };

describe('создание записи', () => {
  it('два одновременных запроса на один слот: успех только у одного', async () => {
    const st = store();
    const r = await Promise.allSettled([
      createBooking(st, { ...slot, ...who, token: 'a' }, NOW),
      createBooking(st, { ...slot, ...who, token: 'b' }, NOW),
    ]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const bad = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(bad.reason).toBeInstanceOf(AppError);
    expect(bad.reason.code).toBe('SLOT_TAKEN');
  });

  it('пересекающийся слот другой длительности тоже отклоняется', async () => {
    const st = store();
    await createBooking(st, { ...slot, ...who }, NOW); // 12:00–13:00
    await expect(createBooking(st, { ...slot, ...who, service_id: S.beard, time: '12:30' }, NOW)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });

  it('занятый слот возвращает альтернативы', async () => {
    const e: any = await createBooking(store(), { ...slot, ...who, time: '11:00' }, NOW).catch((x) => x);
    expect(e.code).toBe('SLOT_TAKEN');
    expect(e.extra.alternatives.length).toBeGreaterThan(0);
  });

  it('нерабочее время и выходной отклоняются', async () => {
    await expect(createBooking(store(), { ...slot, ...who, date: '2026-10-21' }, NOW)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    await expect(createBooking(store(), { ...slot, ...who, time: '14:00' }, NOW)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    await expect(createBooking(store(), { ...slot, ...who, time: '03:00' }, NOW)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });

  it('требует имя, телефон и согласие', async () => {
    await expect(createBooking(store(), { ...slot, ...who, consent: false }, NOW)).rejects.toMatchObject({ code: 'NO_CONSENT' });
    await expect(createBooking(store(), { ...slot, ...who, phone: '123' }, NOW)).rejects.toMatchObject({ code: 'BAD_PHONE' });
    await expect(createBooking(store(), { ...slot, ...who, name: ' ' }, NOW)).rejects.toMatchObject({ code: 'BAD_NAME' });
  });

  it('нормализует телефон и не отдаёт его в ответе клиенту', async () => {
    const st = store();
    const b = await createBooking(st, { ...slot, ...who }, NOW);
    expect(JSON.stringify(b)).not.toContain('900');
    expect((await st.getBooking({ code: b.code }))!.client_phone).toBe('+79001234567');
  });
});

describe('отмена и перенос', () => {
  it('чужая сессия не может отменить по id; владелец может; слот освобождается', async () => {
    const st = store();
    const b = await createBooking(st, { ...slot, ...who }, NOW);
    await expect(cancelBooking(st, b.id, 'чужой', NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await cancelBooking(st, b.id, 'tok-a', NOW)).status).toBe('cancelled');
    expect(times(await slots(st, S.cut, M.artem, '2026-10-20'), '2026-10-20')).toContain('12:00');
  });

  it('за меньше чем N часов до визита нельзя', async () => {
    const st = store();
    const b = await createBooking(st, { ...slot, ...who, date: '2026-10-19', time: '10:00' }, NOW);
    await expect(cancelBooking(st, b.code, 'tok-a', NOW)).rejects.toMatchObject({ code: 'TOO_LATE' });
  });

  it('перенос освобождает старое время и занимает новое; на выходной нельзя', async () => {
    const st = store();
    const b = await createBooking(st, { ...slot, ...who }, NOW);
    const moved = await rescheduleBooking(st, b.id, 'tok-a', '2026-10-20', '12:30', NOW);
    expect(moved.time).toBe('12:30');
    await expect(rescheduleBooking(st, b.id, 'tok-a', '2026-10-21', '12:00', NOW)).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
  });
});
