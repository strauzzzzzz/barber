// Демо-хранилище в памяти (DEMO_MODE=1): локальная разработка и тесты без Supabase.
// Повторяет ограничения БД: пересечение активных записей одного мастера = conflict.
import type { BookingRow } from '../../shared/types';
import { ACTIVE_STATUSES, SALON } from '../../shared/config';
import { addDays, todayIn, zonedToMs } from '../../shared/time';
import * as seed from '../../shared/seed';
import type { Store } from './store';

export function memoryStore(now = Date.now()): Store {
  const today = todayIn(SALON.timezone, now);
  const catalog = {
    services: seed.seedServices.map((s) => ({ ...s, active: true })),
    masters: seed.seedMasters.map((m) => ({ ...m, active: true })),
    links: seed.seedLinks.map(([master_id, service_id]) => ({ master_id, service_id })),
  };
  const rules = Object.entries(seed.seedRules).flatMap(([master_id, l]) => l.map((r) => ({ master_id, ...r })));
  const breaks = rules.map((r) => ({ ...r, ...seed.seedBreaks }));
  const exceptions = seed.seedExceptions.map((e) => ({
    master_id: e.master_id, date_from: addDays(today, e.from), date_to: addDays(today, e.to),
    kind: e.kind as 'off' | 'vacation' | 'hours', start_time: e.start_time, end_time: e.end_time,
  }));
  const rows: BookingRow[] = seed.seedBookings.map((b, i) => {
    const svc = catalog.services.find((s) => s.id === b.service)!;
    const start = zonedToMs(addDays(today, b.day), b.time, SALON.timezone);
    return {
      id: `demo-${i}`, code: `DEMO${i + 1}AAA`, master_id: b.master, service_id: b.service,
      starts_at: new Date(start).toISOString(), ends_at: new Date(start + svc.duration_min * 60000).toISOString(),
      client_name: b.name, client_phone: b.phone, client_token: null, status: b.status as BookingRow['status'], price: svc.price, source: 'admin',
    };
  });
  const hits = new Map<string, number>();
  let seq = 0;
  const overlaps = (b: Pick<BookingRow, 'master_id' | 'starts_at' | 'ends_at'>, skip?: string) =>
    rows.some((r) => r.id !== skip && r.master_id === b.master_id && ACTIVE_STATUSES.includes(r.status) && r.starts_at < b.ends_at && b.starts_at < r.ends_at);

  return {
    catalog: async () => structuredClone(catalog),
    async schedules(ids, fromIso, toIso) {
      return {
        rules: rules.filter((r) => ids.includes(r.master_id)), breaks: breaks.filter((r) => ids.includes(r.master_id)),
        exceptions: exceptions.filter((r) => ids.includes(r.master_id)),
        bookings: rows.filter((r) => ids.includes(r.master_id) && ACTIVE_STATUSES.includes(r.status) && r.starts_at < toIso && r.ends_at > fromIso),
      };
    },
    async insertBooking(b) {
      if (rows.some((r) => r.code === b.code)) return { ok: false, duplicateCode: true };
      if (overlaps(b)) return { ok: false, conflict: true };
      const row = { ...b, id: `mem-${++seq}` } as BookingRow;
      rows.push(row);
      return { ok: true, booking: row };
    },
    getBooking: async ({ id, code }) => rows.find((r) => (id ? r.id === id : r.code === code)) ?? null,
    bookingsByToken: async (t) => rows.filter((r) => r.client_token === t).sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1)),
    bookingsBetween: async (f, t) => rows.filter((r) => r.starts_at >= f && r.starts_at < t).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)),
    async updateBooking(id, patch) {
      const r = rows.find((x) => x.id === id);
      if (!r) return { ok: false };
      const next = { ...r, ...patch };
      if (ACTIVE_STATUSES.includes(next.status) && overlaps(next, id)) return { ok: false, conflict: true };
      Object.assign(r, patch);
      return { ok: true };
    },
    async hitRate(key, windowS, max) {
      const k = `${key}:${Math.floor(Date.now() / 1000 / windowS)}`;
      const n = (hits.get(k) ?? 0) + 1;
      hits.set(k, n);
      return n <= max;
    },
    adminEmails: async () => seed.seedAdminEmails,
    adminEmail: async (jwt) => (jwt === 'demo-admin' ? 'admin@example.com' : null),
  };
}
