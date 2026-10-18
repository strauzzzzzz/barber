import type { BookingDTO, Catalog, ChatBlock, Master, MasterBrief, Service, SlotGroup } from '../../shared/types';
import { SALON } from '../../shared/config';
import { addDays, dateLabel, isDate, isTime, todayIn, zonedToMs } from '../../shared/time';
import type { Store } from './store';
import { AppError, alternatives, cancelBooking, freeSlots, listMine, proposeBooking } from './booking';

export interface ToolCtx { store: Store; token: string; now: number; admin: string | null }
export interface ToolOut { result: unknown; blocks: ChatBlock[] }

// Описания короткие и английские: лимит бесплатного Groq считается в токенах за минуту, русский текст вдвое дороже.
// Модель работает с названиями услуг и именами мастеров (UUID стоят ~20 токенов каждый); сервер сам находит их по названию.
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const str = (description: string) => ({ type: 'string', description });

export function toolDefs(isAdmin: boolean) {
  const tools = [
    fn('get_services', 'Services with prices (only source of prices).'),
    fn('get_masters', 'Masters with rating and review count.', { service: str('service name, optional') }),
    fn('get_free_slots', 'Real free time slots (only source of availability). If the period is empty returns nearest alternatives.', {
      service: str('service name'), master: str('master name, optional'), date_from: str('YYYY-MM-DD, default today'), date_to: str('YYYY-MM-DD, max 14 days'),
      time_from: str('HH:MM, earliest start, e.g. 17:00 for evening'), time_to: str('HH:MM, latest start, optional'),
    }, ['service']),
    fn('propose_booking', 'Show the client a confirmation card. Only the client creates the booking, by pressing a button.', {
      service: str('service name'), master: str('master name'), date: str('YYYY-MM-DD'), time: str('HH:MM from get_free_slots'),
    }, ['service', 'master', 'date', 'time']),
    fn('get_my_bookings', "Current client's own bookings."),
    fn('cancel_booking', 'Cancel a booking by code, only after the client explicitly agreed.', { code: str('booking code') }, ['code']),
  ];
  if (isAdmin) tools.push(fn('admin_list_bookings', 'ADMIN: all bookings for a date with client names and phones.', { date: str('YYYY-MM-DD') }, ['date']));
  return tools;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/ё/g, 'е');
function findService(cat: Catalog, ref: unknown): Service | undefined {
  const r = String(ref ?? '');
  const act = cat.services.filter((s) => s.active);
  return act.find((s) => s.id === r) ?? act.find((s) => norm(s.name) === norm(r)) ?? act.find((s) => norm(s.name).includes(norm(r)) && r.length > 2);
}
function findMaster(cat: Catalog, ref: unknown): Master | undefined {
  const r = String(ref ?? '');
  const act = cat.masters.filter((m) => m.active);
  return act.find((m) => m.id === r) ?? act.find((m) => norm(m.name) === norm(r));
}

const brief = (m: Master, recommended = false): MasterBrief => ({ id: m.id, name: m.name, rating: m.rating, reviews: m.reviews_count, recommended });

/** Карточка слотов для чата: сортировка по дате, затем по числу отзывов; рекомендуется мастер с максимумом отзывов. */
export function slotsBlock(cat: Catalog, service: Service, groups: SlotGroup[], maxGroups = 6): ChatBlock {
  const ms = groups.map((g) => cat.masters.find((m) => m.id === g.master_id)!).filter(Boolean);
  const top = ms.length ? Math.max(...ms.map((m) => m.reviews_count)) : 0;
  const sorted = [...groups].sort((a, b) => a.date.localeCompare(b.date) || (cat.masters.find((m) => m.id === b.master_id)!.reviews_count - cat.masters.find((m) => m.id === a.master_id)!.reviews_count));
  return {
    type: 'slots',
    service: { id: service.id, name: service.name, price: service.price, duration_min: service.duration_min },
    groups: sorted.slice(0, maxGroups).map((g) => {
      const m = cat.masters.find((x) => x.id === g.master_id)!;
      return { master: brief(m, m.reviews_count === top && ms.length > 1), date: g.date, times: g.times };
    }),
  };
}

const wd = (date: string) => dateLabel(date).split(',')[0];
/** Окна в компактном виде для модели: без id, времена строкой. */
const slotLines = (cat: Catalog, groups: SlotGroup[]) => groups.map((g) => {
  const m = cat.masters.find((x) => x.id === g.master_id);
  return { master: m?.name, date: g.date, wd: wd(g.date), times: g.times.slice(0, 14).join(' ') };
});

async function slotsTool(ctx: ToolCtx, cat: Catalog, a: any): Promise<ToolOut> {
  const today = todayIn(SALON.timezone, ctx.now);
  const service = findService(cat, a.service);
  if (!service) return { result: { error: 'Unknown service. Use a name from the list.' }, blocks: [] };
  const master = a.master ? findMaster(cat, a.master) : undefined;
  if (a.master && !master) return { result: { error: 'Unknown master. Use a name from the list.' }, blocks: [] };
  const from = isDate(a.date_from) ? a.date_from : today;
  let to = isDate(a.date_to) ? a.date_to : addDays(from, 2);
  if (to > addDays(from, 13)) to = addDays(from, 13);
  if (to < from) to = from;
  const tf = isTime(a.time_from) ? a.time_from : '00:00';
  const tt = isTime(a.time_to) ? a.time_to : '23:59';
  const raw = (await freeSlots(ctx.store, { serviceId: service.id, masterId: master?.id, dateFrom: from, dateTo: to, now: ctx.now })).groups;
  // окно по времени суток («вечером» = time_from 17:00): карточки и ответ модели содержат только подходящее время
  let groups = raw.map((g) => ({ ...g, times: g.times.filter((t) => t >= tf && t <= tt) })).filter((g) => g.times.length);
  let isAlt = false;
  if (!groups.length) {
    groups = await alternatives(ctx.store, service.id, master?.id, from, 4);
    isAlt = true;
  }
  const block = groups.length ? slotsBlock(cat, service, groups) : null;
  const shown = block && block.type === 'slots' ? block.groups : [];
  return {
    result: {
      service: service.name, price_rub: service.price, min: service.duration_min,
      found: groups.length > 0,
      alt: isAlt, // true: на запрошенный период пусто, это ближайшие другие окна
      slots: shown.slice(0, 5).map((g) => ({ master: g.master.name, rating: g.master.rating, reviews: g.master.reviews, top: !!g.master.recommended, date: g.date, wd: wd(g.date), times: g.times.slice(0, 14).join(' ') })),
      note: groups.length ? 'Cards with these slots are already shown to the client.' : 'No free slots in the next 2 weeks.',
    },
    blocks: block ? [block] : [],
  };
}

const myBlock = (bookings: BookingDTO[]): ChatBlock[] => (bookings.length ? [{ type: 'bookings', bookings }] : []);

export async function runTool(name: string, a: any, ctx: ToolCtx): Promise<ToolOut> {
  const cat = await ctx.store.catalog();
  try {
    switch (name) {
      case 'get_services':
        return { result: cat.services.filter((s) => s.active).map(({ name, duration_min, price }) => ({ name, price_rub: price, min: duration_min })), blocks: [] };
      case 'get_masters': {
        const svc = a.service ? findService(cat, a.service) : undefined;
        if (a.service && !svc) return { result: { error: 'Unknown service' }, blocks: [] };
        const ms = cat.masters.filter((m) => m.active && (!svc || cat.links.some((l) => l.master_id === m.id && l.service_id === svc.id)));
        const top = Math.max(0, ...ms.map((m) => m.reviews_count));
        const list = ms.map((m) => ({ ...brief(m, m.reviews_count === top && ms.length > 1), title: m.title }));
        return { result: list.map((m) => ({ name: m.name, title: m.title, rating: m.rating, reviews: m.reviews, top: !!m.recommended })), blocks: list.length ? [{ type: 'masters', masters: list }] : [] };
      }
      case 'get_free_slots':
        return await slotsTool(ctx, cat, a);
      case 'propose_booking': {
        const service = findService(cat, a.service), master = findMaster(cat, a.master);
        if (!service || !master) return { result: { error: 'Unknown service or master. Use names from the list.' }, blocks: [] };
        const draft = await proposeBooking(ctx.store, { service_id: service.id, master_id: master.id, date: a.date, time: a.time });
        return { result: { ok: true, service: draft.service_name, master: draft.master_name, date: draft.date, time: draft.time, price_rub: draft.price, note: 'Confirmation card shown. Ask the client to press Confirm. NOT booked yet.' }, blocks: [{ type: 'draft', draft }] };
      }
      case 'get_my_bookings': {
        const all = await listMine(ctx.store, ctx.token, ctx.now);
        const up = all.filter((b) => ['pending', 'confirmed'].includes(b.status) && Date.parse(b.starts_at) > ctx.now).reverse();
        return { result: { bookings: up.map((b) => ({ code: b.code, service: b.service.name, master: b.master.name, date: b.date, time: b.time, price_rub: b.price, can_change: b.can_change })) }, blocks: myBlock(up) };
      }
      case 'cancel_booking': {
        const b = await cancelBooking(ctx.store, a.code, ctx.token, ctx.now);
        return { result: { ok: true, cancelled: { code: b.code, date: b.date, time: b.time } }, blocks: [] };
      }
      case 'admin_list_bookings': {
        if (!ctx.admin) return { result: { error: 'Forbidden' }, blocks: [] };
        if (!isDate(a.date)) return { result: { error: 'Bad date' }, blocks: [] };
        const rows = await ctx.store.bookingsBetween(new Date(zonedToMs(a.date, '00:00', SALON.timezone)).toISOString(), new Date(zonedToMs(addDays(a.date, 1), '00:00', SALON.timezone)).toISOString());
        const dto = rows.map((r) => ({ code: r.code, status: r.status, master: cat.masters.find((m) => m.id === r.master_id)?.name, service: cat.services.find((s) => s.id === r.service_id)?.name, starts_at: r.starts_at, client: r.client_name, phone: r.client_phone }));
        return { result: dto, blocks: [] };
      }
      default:
        return { result: { error: 'Unknown tool' }, blocks: [] };
    }
  } catch (e) {
    if (e instanceof AppError) return { result: { ok: false, error: e.code, message: e.message, alternatives: slotLines(cat, (e.extra.alternatives as SlotGroup[]) ?? []) }, blocks: [] };
    throw e;
  }
}
