// Единый источник seed-данных: из него генерируется supabase/seed.sql (npm run seed:sql)
// и берутся данные демо-режима (память) для локальной разработки и тестов.
// Даты — смещения от «сегодня», поэтому тестовые отпуск/выходной всегда в ближайшем будущем.

const uid = (p: string, n: number) => `${p}000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const S = { cut: uid('a1', 1), beard: uid('a1', 2), combo: uid('a1', 3), kids: uid('a1', 4), style: uid('a1', 5), womens: uid('a1', 6) };
export const M = { artem: uid('b2', 1), dmitry: uid('b2', 2), maxim: uid('b2', 3), anna: uid('b2', 4) };

export const seedServices = [
  { id: S.cut, name: 'Мужская стрижка', description: 'Стрижка, мытьё головы, укладка', duration_min: 60, price: 1800, sort: 1 },
  { id: S.beard, name: 'Оформление бороды', description: 'Моделирование, горячее полотенце', duration_min: 30, price: 1000, sort: 2 },
  { id: S.combo, name: 'Стрижка + борода', description: 'Комплекс со скидкой', duration_min: 90, price: 2600, sort: 3 },
  { id: S.kids, name: 'Детская стрижка', description: 'До 12 лет', duration_min: 30, price: 1200, sort: 4 },
  { id: S.style, name: 'Укладка', description: 'Укладка и стайлинг', duration_min: 30, price: 800, sort: 5 },
  { id: S.womens, name: 'Женская стрижка', description: 'Стрижка и укладка', duration_min: 90, price: 3200, sort: 6 },
];

export const seedMasters = [
  { id: M.artem, name: 'Артём', title: 'Топ-барбер', bio: 'Классика и фейды, 8 лет опыта', rating: 4.9, reviews_count: 128, sort: 1 },
  { id: M.dmitry, name: 'Дмитрий', title: 'Барбер', bio: 'Бороды и комплексы', rating: 4.8, reviews_count: 96, sort: 2 },
  { id: M.maxim, name: 'Максим', title: 'Барбер', bio: 'Детские и быстрые стрижки', rating: 4.7, reviews_count: 41, sort: 3 },
  { id: M.anna, name: 'Анна', title: 'Стилист', bio: 'Женские стрижки и укладки', rating: 4.9, reviews_count: 77, sort: 4 },
];

const barber = [S.cut, S.beard, S.combo, S.kids, S.style];
export const seedLinks: [string, string][] = [
  ...barber.map((s): [string, string] => [M.artem, s]),
  ...[S.cut, S.beard, S.combo, S.style].map((s): [string, string] => [M.dmitry, s]),
  ...[S.cut, S.kids, S.style].map((s): [string, string] => [M.maxim, s]),
  ...[S.womens, S.style, S.kids].map((s): [string, string] => [M.anna, s]),
];

/** weekday 1..7 (пн..вс). Нет строки — выходной. */
const week = (from: string, to: string, days: number[]) => days.map((weekday) => ({ weekday, start_time: from, end_time: to }));
export const seedRules: Record<string, { weekday: number; start_time: string; end_time: string }[]> = {
  [M.artem]: week('10:00', '20:00', [1, 2, 3, 4, 5, 6]),
  [M.dmitry]: week('11:00', '21:00', [2, 3, 4, 5, 6, 7]),
  [M.maxim]: week('10:00', '19:00', [1, 2, 3, 4, 5]),
  [M.anna]: week('10:00', '19:00', [2, 3, 4, 5, 6]),
};

/** Обед у каждого мастера во все рабочие дни. */
export const seedBreaks = { start_time: '14:00', end_time: '15:00' };

/** Тестовые исключения: отпуск Дмитрия и разовый выходной Артёма (в днях от сегодня). */
export const seedExceptions = [
  { master_id: M.dmitry, from: 7, to: 13, kind: 'vacation', start_time: null, end_time: null, note: 'Отпуск' },
  { master_id: M.artem, from: 2, to: 2, kind: 'off', start_time: null, end_time: null, note: 'Разовый выходной' },
  { master_id: M.maxim, from: 3, to: 3, kind: 'hours', start_time: '12:00', end_time: '16:00', note: 'Короткий день' },
];

/** Администратор: замените на свой email в README/после деплоя. */
export const seedAdminEmails = ['admin@example.com'];

/** Демо-записи (в днях от сегодня), чтобы было видно занятые окна. */
export const seedBookings = [
  { master: M.artem, service: S.cut, day: 1, time: '11:00', name: 'Иван', phone: '+79001112233', status: 'confirmed' },
  { master: M.artem, service: S.combo, day: 1, time: '16:00', name: 'Олег', phone: '+79002223344', status: 'confirmed' },
  { master: M.dmitry, service: S.beard, day: 1, time: '12:00', name: 'Сергей', phone: '+79003334455', status: 'pending' },
];
