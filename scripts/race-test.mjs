// Проверка двойной записи на живом деплое: два одновременных запроса на один слот.
// node scripts/race-test.mjs https://your-app.vercel.app   (создаст одну тестовую запись; потом отмените её в админке)
const base = (process.argv[2] ?? 'http://localhost:5173').replace(/\/$/, '');
const get = (p) => fetch(base + p).then((r) => r.json());

const cat = await get('/api/catalog');
const service = cat.services[0];
const from = new Date().toISOString().slice(0, 10);
const to = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const { groups } = await get(`/api/slots?service_id=${service.id}&date_from=${from}&date_to=${to}`);
const g = groups.find((x) => x.times.length);
if (!g) throw new Error('нет свободных слотов для теста');

const body = (n) => JSON.stringify({ service_id: service.id, master_id: g.master_id, date: g.date, time: g.times.at(-1), name: `Гонка ${n}`, phone: '+79990000000', consent: true, reminders: false, source: 'web' });
const post = (n) => fetch(base + '/api/bookings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client-token': `race-${n}-${Date.now()}` }, body: body(n) }).then(async (r) => [r.status, (await r.json()).error ?? 'ok']);

const res = await Promise.all([post(1), post(2), post(3)]);
console.log(res.map((r) => r.join(' ')).join(' | '));
const ok = res.filter(([s]) => s === 200).length;
console.log(ok === 1 ? 'OK: создана ровно одна запись, остальные получили SLOT_TAKEN' : `FAIL: успешных записей ${ok}`);
process.exit(ok === 1 ? 0 : 1);
