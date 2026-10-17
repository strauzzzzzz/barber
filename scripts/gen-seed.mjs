// node scripts/gen-seed.mjs > supabase/seed.sql   (Node 22.6+/24 читает .ts напрямую)
import * as s from '../shared/seed.ts';

const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const rows = (table, cols, data) =>
  `insert into ${table} (${cols.join(', ')}) values\n${data.map((r) => '  (' + r.join(', ') + ')').join(',\n')}\non conflict do nothing;\n`;

const out = ['-- СГЕНЕРИРОВАНО из shared/seed.ts (npm run seed:sql). Не править руками.', ''];
out.push(rows('services', ['id', 'name', 'description', 'duration_min', 'price', 'sort'], s.seedServices.map((x) => [q(x.id), q(x.name), q(x.description), x.duration_min, x.price, x.sort])));
out.push(rows('masters', ['id', 'name', 'title', 'bio', 'rating', 'reviews_count', 'sort'], s.seedMasters.map((x) => [q(x.id), q(x.name), q(x.title), q(x.bio), x.rating, x.reviews_count, x.sort])));
out.push(rows('master_services', ['master_id', 'service_id'], s.seedLinks.map(([m, sv]) => [q(m), q(sv)])));
const rules = Object.entries(s.seedRules).flatMap(([m, list]) => list.map((r) => [q(m), r.weekday, q(r.start_time), q(r.end_time)]));
out.push(rows('schedule_rules', ['master_id', 'weekday', 'start_time', 'end_time'], rules));
const breaks = Object.entries(s.seedRules).flatMap(([m, list]) => list.map((r) => [q(m), r.weekday, q(s.seedBreaks.start_time), q(s.seedBreaks.end_time)]));
out.push(rows('schedule_breaks', ['master_id', 'weekday', 'start_time', 'end_time'], breaks));
out.push(rows('schedule_exceptions', ['master_id', 'date_from', 'date_to', 'kind', 'start_time', 'end_time', 'note'],
  s.seedExceptions.map((e) => [q(e.master_id), `current_date + ${e.from}`, `current_date + ${e.to}`, q(e.kind), q(e.start_time), q(e.end_time), q(e.note)])));
out.push(rows('admin_emails', ['email'], s.seedAdminEmails.map((e) => [q(e)])));
// демо-записи: время локальное (Europe/Moscow — замените зону, если меняли SALON.timezone)
const price = Object.fromEntries(s.seedServices.map((x) => [x.id, x]));
out.push(rows('bookings', ['code', 'master_id', 'service_id', 'starts_at', 'ends_at', 'client_name', 'client_phone', 'status', 'price', 'source', 'consent_at'],
  s.seedBookings.map((b, i) => {
    const start = `((current_date + ${b.day} + time '${b.time}') at time zone 'Europe/Moscow')`;
    return [q('DEMO' + (i + 1) + 'AAA'), q(b.master), q(b.service), start, `${start} + interval '${price[b.service].duration_min} minutes'`, q(b.name), q(b.phone), q(b.status), price[b.service].price, q('admin'), 'now()'];
  })));
console.log(out.join('\n'));
