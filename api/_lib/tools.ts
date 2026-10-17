import type { BookingDTO, Catalog, ChatBlock, Master, MasterBrief, Service, SlotGroup } from '../../shared/types';
import { SALON } from '../../shared/config';
import { addDays, dateLabel, isDate, todayIn, zonedToMs } from '../../shared/time';
import type { Store } from './store';
import { AppError, alternatives, cancelBooking, freeSlots, listMine, proposeBooking } from './booking';

export interface ToolCtx { store: Store; token: string; now: number; admin: string | null }
export interface ToolOut { result: unknown; blocks: ChatBlock[] }

const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } },
});
const str = (description: string) => ({ type: 'string', description });

export function toolDefs(isAdmin: boolean) {
  const tools = [
    fn('get_services', 'Список услуг с ценами и длительностью. Единственный источник цен.', {}),
    fn('get_masters', 'Мастера (с рейтингом и числом отзывов), которые делают услугу.', { service_id: str('id или точное название услуги; можно опустить') }),
    fn('get_free_slots', 'Реально свободные окна из расписания. Единственный источник свободного времени. Если на период пусто, вернёт ближайшие альтернативы.', {
      date_from: str('YYYY-MM-DD, по умолчанию сегодня'), date_to: str('YYYY-MM-DD, максимум 14 дней от date_from'),
      service_id: str('id или название услуги'), master_id: str('id или имя мастера; можно опустить'),
    }, ['service_id']),
    fn('propose_booking', 'Показать клиенту карточку записи с кнопками «Подтвердить»/«Изменить». Запись создаёт только клиент кнопкой — ты её не создаёшь.', {
      service_id: str('id услуги'), master_id: str('id мастера'), date: str('YYYY-MM-DD'), time: str('HH:MM, строго из get_free_slots'),
    }, ['service_id', 'master_id', 'date', 'time']),
    fn('get_my_bookings', 'Записи текущего клиента (только его собственные).', {}),
    fn('cancel_booking', 'Отменить запись клиента по её коду. Вызывай только после явного «да, отменить» от клиента.', { booking_code: str('код записи из get_my_bookings') }, ['booking_code']),
  ];
  if (isAdmin) tools.push(fn('admin_list_bookings', 'АДМИН: все записи на дату с именами и телефонами.', { date: str('YYYY-MM-DD') }, ['date']));
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

async function slotsTool(ctx: ToolCtx, a: any): Promise<ToolOut> {
  const today = todayIn(SALON.timezone, ctx.now);
  const cat = await ctx.store.catalog();
  const service = findService(cat, a.service_id);
  if (!service) return { result: { error: 'Услуга не найдена. Вызови get_services.' }, blocks: [] };
  const master = a.master_id ? findMaster(cat, a.master_id) : undefined;
  if (a.master_id && !master) return { result: { error: 'Мастер не найден. Вызови get_masters.' }, blocks: [] };
  const from = isDate(a.date_from) ? a.date_from : today;
  let to = isDate(a.date_to) ? a.date_to : addDays(from, 2);
  if (to > addDays(from, 13)) to = addDays(from, 13);
  if (to < from) to = from;
  let groups = (await freeSlots(ctx.store, { serviceId: service.id, masterId: master?.id, dateFrom: from, dateTo: to, now: ctx.now })).groups;
  let isAlt = false;
  if (!groups.length) {
    groups = await alternatives(ctx.store, service.id, master?.id, from, 4);
    isAlt = true;
  }
  const block = groups.length ? slotsBlock(cat, service, groups) : null;
  const shown = block && block.type === 'slots' ? block.groups : [];
  return {
    result: {
      service: { id: service.id, name: service.name, price: service.price, duration_min: service.duration_min },
      requested: { from, to },
      found: groups.length > 0,
      is_alternative: isAlt, // true: на запрошенный период пусто, это ближайшие другие окна
      slots: shown.map((g) => ({
        master_id: g.master.id, master: g.master.name, rating: g.master.rating, reviews: g.master.reviews,
        recommended: !!g.master.recommended, date: g.date, weekday: dateLabel(g.date).split(',')[0], times: g.times.slice(0, 10),
      })),
      note: groups.length ? 'Карточки с этими окнами уже показаны клиенту.' : 'Свободных окон в ближайшие 2 недели нет.',
    },
    blocks: block ? [block] : [],
  };
}

const myBlock = (bookings: BookingDTO[]): ChatBlock[] => (bookings.length ? [{ type: 'bookings', bookings }] : []);

export async function runTool(name: string, a: any, ctx: ToolCtx): Promise<ToolOut> {
  try {
    const cat = await ctx.store.catalog();
    switch (name) {
      case 'get_services':
        return { result: cat.services.filter((s) => s.active).map(({ id, name, description, duration_min, price }) => ({ id, name, description, duration_min, price_rub: price })), blocks: [] };
      case 'get_masters': {
        const svc = a.service_id ? findService(cat, a.service_id) : undefined;
        if (a.service_id && !svc) return { result: { error: 'Услуга не найдена' }, blocks: [] };
        const ms = cat.masters.filter((m) => m.active && (!svc || cat.links.some((l) => l.master_id === m.id && l.service_id === svc.id)));
        const top = Math.max(0, ...ms.map((m) => m.reviews_count));
        const list = ms.map((m) => ({ ...brief(m, m.reviews_count === top && ms.length > 1), title: m.title }));
        return { result: list, blocks: list.length ? [{ type: 'masters', masters: list }] : [] };
      }
      case 'get_free_slots':
        return await slotsTool(ctx, a);
      case 'propose_booking': {
        const draft = await proposeBooking(ctx.store, { service_id: a.service_id, master_id: a.master_id, date: a.date, time: a.time });
        return { result: { ok: true, draft, note: 'Карточка подтверждения показана клиенту. Попроси нажать «Подтвердить». Запись ещё НЕ создана.' }, blocks: [{ type: 'draft', draft }] };
      }
      case 'get_my_bookings': {
        const all = await listMine(ctx.store, ctx.token, ctx.now);
        const up = all.filter((b) => ['pending', 'confirmed'].includes(b.status) && Date.parse(b.starts_at) > ctx.now).reverse();
        return { result: { bookings: up.map((b) => ({ code: b.code, service: b.service.name, master: b.master.name, date: b.date, time: b.time, price_rub: b.price, status: b.status, can_change: b.can_change })) }, blocks: myBlock(up) };
      }
      case 'cancel_booking': {
        const b = await cancelBooking(ctx.store, a.booking_code, ctx.token, ctx.now);
        return { result: { ok: true, cancelled: { code: b.code, date: b.date, time: b.time } }, blocks: [] };
      }
      case 'admin_list_bookings': {
        if (!ctx.admin) return { result: { error: 'Недостаточно прав' }, blocks: [] };
        if (!isDate(a.date)) return { result: { error: 'Неверная дата' }, blocks: [] };
        const rows = await ctx.store.bookingsBetween(new Date(zonedToMs(a.date, '00:00', SALON.timezone)).toISOString(), new Date(zonedToMs(addDays(a.date, 1), '00:00', SALON.timezone)).toISOString());
        const dto = rows.map((r) => ({ ...(({ id, code, status }) => ({ id, code, status }))(r), master: cat.masters.find((m) => m.id === r.master_id)?.name, service: cat.services.find((s) => s.id === r.service_id)?.name, starts_at: r.starts_at, client: r.client_name, phone: r.client_phone }));
        return { result: dto, blocks: [] };
      }
      default:
        return { result: { error: 'Неизвестный инструмент' }, blocks: [] };
    }
  } catch (e) {
    if (e instanceof AppError) return { result: { ok: false, error: e.code, message: e.message, alternatives: e.extra.alternatives }, blocks: [] };
    throw e;
  }
}
