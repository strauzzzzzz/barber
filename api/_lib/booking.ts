import type { BookingDTO, BookingRow, Catalog, Draft, SlotGroup } from '../../shared/types';
import { ACTIVE_STATUSES, BOOKING, SALON } from '../../shared/config';
import { addDays, isDate, isTime, msToLocal, todayIn, zonedToMs } from '../../shared/time';
import { cleanName, isName, normalizePhone } from '../../shared/validate';
import type { Store } from './store';
import { computeSlots } from './slots';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

const TZ = SALON.timezone;
const dayStart = (date: string) => zonedToMs(date, '00:00', TZ);

export interface FreeSlotsParams { serviceId: string; masterId?: string; dateFrom: string; dateTo: string; excludeBookingId?: string; now?: number }

/** Единая функция свободных окон (бот, ручная запись, проверка при создании записи). Данные — только из хранилища. */
export async function freeSlots(store: Store, p: FreeSlotsParams) {
  const now = p.now ?? Date.now();
  const cat = await store.catalog();
  const service = cat.services.find((s) => s.id === p.serviceId && s.active);
  if (!service) throw new AppError(404, 'NO_SERVICE', 'Такой услуги нет');
  let masters = cat.masters.filter((m) => m.active && cat.links.some((l) => l.master_id === m.id && l.service_id === service.id));
  if (p.masterId) {
    masters = masters.filter((m) => m.id === p.masterId);
    if (!masters.length) throw new AppError(404, 'NO_MASTER', 'Этот мастер не делает выбранную услугу');
  }
  const today = todayIn(TZ, now);
  const dateFrom = p.dateFrom < today ? today : p.dateFrom;
  const last = addDays(today, BOOKING.horizonDays);
  const dateTo = p.dateTo > last ? last : p.dateTo;
  if (dateFrom > dateTo || !masters.length) return { service, masters, groups: [] as SlotGroup[], catalog: cat };
  const ids = masters.map((m) => m.id);
  const d = await store.schedules(ids, new Date(dayStart(dateFrom)).toISOString(), new Date(dayStart(addDays(dateTo, 1))).toISOString());
  const groups = computeSlots({
    dateFrom, dateTo, durationMin: service.duration_min, tz: TZ, stepMin: BOOKING.slotStepMin, leadMin: BOOKING.minLeadMin, nowMs: now,
    schedules: masters.map((m) => ({
      masterId: m.id,
      rules: d.rules.filter((r) => r.master_id === m.id),
      breaks: d.breaks.filter((r) => r.master_id === m.id),
      exceptions: d.exceptions.filter((r) => r.master_id === m.id),
      busy: d.bookings.filter((b) => b.master_id === m.id && b.id !== p.excludeBookingId).map((b) => ({ start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) })),
    })),
  });
  return { service, masters, groups, catalog: cat };
}

/** Ближайшие свободные окна (для «слот занят» и «на эти дни пусто»). */
export async function alternatives(store: Store, serviceId: string, masterId: string | undefined, fromDate: string, limit = 4): Promise<SlotGroup[]> {
  const to = addDays(fromDate, 14);
  let r = await freeSlots(store, { serviceId, masterId, dateFrom: fromDate, dateTo: to });
  if (!r.groups.length && masterId) r = await freeSlots(store, { serviceId, dateFrom: fromDate, dateTo: to });
  return r.groups.slice(0, limit);
}

export function toDTO(b: BookingRow, cat: Catalog, now = Date.now()): BookingDTO {
  const service = cat.services.find((s) => s.id === b.service_id);
  const master = cat.masters.find((m) => m.id === b.master_id);
  const start = Date.parse(b.starts_at);
  const local = msToLocal(start, TZ);
  return {
    id: b.id, code: b.code,
    service: { id: b.service_id, name: service?.name ?? '—' },
    master: { id: b.master_id, name: master?.name ?? '—' },
    starts_at: new Date(start).toISOString(), date: local.date, time: local.time,
    duration_min: Math.round((Date.parse(b.ends_at) - start) / 60000),
    price: b.price, status: b.status,
    can_change: ['pending', 'confirmed'].includes(b.status) && start - now >= BOOKING.cancelMinHours * 3600000,
  };
}

function checkSlotArgs(date: unknown, time: unknown) {
  if (!isDate(date) || !isTime(time)) throw new AppError(400, 'BAD_INPUT', 'Неверная дата или время');
}

/** Проверяет, что окно реально свободно, и возвращает черновик записи (без создания). */
export async function proposeBooking(store: Store, a: { service_id: string; master_id: string; date: string; time: string }): Promise<Draft> {
  checkSlotArgs(a.date, a.time);
  const r = await freeSlots(store, { serviceId: a.service_id, masterId: a.master_id, dateFrom: a.date, dateTo: a.date });
  if (!r.groups.some((g) => g.date === a.date && g.times.includes(a.time))) {
    throw new AppError(409, 'SLOT_TAKEN', 'Это время недоступно', { alternatives: await alternatives(store, a.service_id, a.master_id, a.date) });
  }
  return {
    service_id: a.service_id, master_id: a.master_id, date: a.date, time: a.time,
    service_name: r.service.name, master_name: r.masters[0].name, price: r.service.price, duration_min: r.service.duration_min,
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');

export interface CreateInput {
  service_id: string; master_id: string; date: string; time: string;
  name: string; phone: string; consent: boolean; reminders?: boolean; token: string; source: 'web' | 'chat';
}

export async function createBooking(store: Store, i: CreateInput, now = Date.now()): Promise<BookingDTO> {
  checkSlotArgs(i.date, i.time);
  const name = cleanName(i.name ?? '');
  const phone = normalizePhone(i.phone ?? '');
  if (!isName(name)) throw new AppError(400, 'BAD_NAME', 'Укажите имя (от 2 символов)');
  if (!phone) throw new AppError(400, 'BAD_PHONE', 'Укажите телефон, например +7 900 000-00-00');
  if (i.consent !== true) throw new AppError(400, 'NO_CONSENT', 'Нужно согласие на обработку персональных данных');
  if (!i.token) throw new AppError(400, 'NO_SESSION', 'Нет идентификатора сессии');

  const mine = await store.bookingsByToken(i.token);
  if (mine.filter((b) => ACTIVE_STATUSES.includes(b.status) && Date.parse(b.ends_at) > now).length >= BOOKING.maxActivePerClient) {
    throw new AppError(429, 'LIMIT', `Не больше ${BOOKING.maxActivePerClient} активных записей. Отмените одну из них или позвоните нам.`);
  }

  const draft = await proposeBooking(store, i); // повторная проверка слота на сервере
  const start = zonedToMs(i.date, i.time, TZ);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await store.insertBooking({
      code: newCode(), master_id: i.master_id, service_id: i.service_id,
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + draft.duration_min * 60000).toISOString(),
      client_name: name, client_phone: phone, client_token: i.token,
      status: BOOKING.defaultStatus, price: draft.price, source: i.source,
      consent_at: new Date(now).toISOString(), reminders_ok: !!i.reminders,
    });
    if (res.ok) return toDTO(res.booking, await store.catalog(), now);
    if (res.conflict) {
      // два одновременных запроса: БД пропустила только один, второй получает альтернативы
      throw new AppError(409, 'SLOT_TAKEN', 'Это время только что заняли', { alternatives: await alternatives(store, i.service_id, i.master_id, i.date) });
    }
  }
  throw new AppError(500, 'CODE', 'Не удалось создать запись, попробуйте ещё раз');
}

export async function listMine(store: Store, token: string, now = Date.now()): Promise<BookingDTO[]> {
  if (!token) return [];
  const [rows, cat] = await Promise.all([store.bookingsByToken(token), store.catalog()]);
  return rows.map((b) => toDTO(b, cat, now));
}

/** ref — код записи (даёт право отмены сам по себе) или id (только владелец сессии). */
async function findOwn(store: Store, ref: string, token: string): Promise<BookingRow> {
  const code = String(ref).trim().toUpperCase();
  const byCode = await store.getBooking({ code });
  if (byCode) return byCode;
  const byId = await store.getBooking({ id: String(ref).trim() }).catch(() => null);
  if (byId && token && byId.client_token === token) return byId;
  throw new AppError(404, 'NOT_FOUND', 'Запись не найдена');
}

function assertChangeable(b: BookingRow, now: number) {
  if (!['pending', 'confirmed'].includes(b.status)) throw new AppError(409, 'NOT_ACTIVE', 'Эту запись уже нельзя изменить');
  if (Date.parse(b.starts_at) - now < BOOKING.cancelMinHours * 3600000) {
    throw new AppError(409, 'TOO_LATE', `Изменить запись можно не позднее чем за ${BOOKING.cancelMinHours} ч до визита. Позвоните нам: ${SALON.phone}`);
  }
}

export async function cancelBooking(store: Store, ref: string, token: string, now = Date.now()): Promise<BookingDTO> {
  const b = await findOwn(store, ref, token);
  assertChangeable(b, now);
  await store.updateBooking(b.id, { status: 'cancelled' });
  return toDTO({ ...b, status: 'cancelled' }, await store.catalog(), now);
}

export async function rescheduleBooking(store: Store, ref: string, token: string, date: string, time: string, now = Date.now()): Promise<BookingDTO> {
  checkSlotArgs(date, time);
  const b = await findOwn(store, ref, token);
  assertChangeable(b, now);
  const r = await freeSlots(store, { serviceId: b.service_id, masterId: b.master_id, dateFrom: date, dateTo: date, excludeBookingId: b.id, now });
  if (!r.groups.some((g) => g.date === date && g.times.includes(time))) {
    throw new AppError(409, 'SLOT_TAKEN', 'Это время недоступно', { alternatives: await alternatives(store, b.service_id, b.master_id, date) });
  }
  const start = zonedToMs(date, time, TZ);
  const patch = { starts_at: new Date(start).toISOString(), ends_at: new Date(start + (Date.parse(b.ends_at) - Date.parse(b.starts_at))).toISOString() };
  const res = await store.updateBooking(b.id, patch);
  if (!res.ok) throw new AppError(409, 'SLOT_TAKEN', 'Это время только что заняли', { alternatives: await alternatives(store, b.service_id, b.master_id, date) });
  return toDTO({ ...b, ...patch }, r.catalog, now);
}
