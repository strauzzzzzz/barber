// Работа с датами 'YYYY-MM-DD' и временем 'HH:MM' в часовом поясе салона. Без внешних библиотек.

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Смещение зоны относительно UTC в мс на момент ts. */
function offsetMs(ts: number, tz: string): number {
  const p: Record<string, number> = {};
  for (const x of dtf(tz).formatToParts(new Date(ts))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

export const hhmmToMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const minToHhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Локальные дата+время салона → момент UTC (мс). */
export function zonedToMs(date: string, time: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, mo - 1, d, 0, 0) + hhmmToMin(time) * 60000;
  const o1 = offsetMs(guess, tz);
  const t = guess - o1;
  const o2 = offsetMs(t, tz);
  return o1 === o2 ? t : guess - o2;
}

/** Момент UTC → локальные дата и время салона. */
export function msToLocal(ms: number, tz: string): { date: string; time: string } {
  const p: Record<string, number> = {};
  for (const x of dtf(tz).formatToParts(new Date(ms))) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export const todayIn = (tz: string, nowMs = Date.now()) => msToLocal(nowMs, tz).date;

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** ISO-день недели: 1 = понедельник … 7 = воскресенье. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));
export const isTime = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

const ru = (o: Intl.DateTimeFormatOptions, date: string) =>
  new Intl.DateTimeFormat('ru-RU', { ...o, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
/** «пн, 19 окт» */
export const dateLabel = (date: string) => ru({ weekday: 'short', day: 'numeric', month: 'short' }, date).replace('.', '');
export const weekdayShort = (date: string) => ru({ weekday: 'short' }, date).replace('.', '');
/** «19 октября» */
export const dateLong = (date: string) => ru({ day: 'numeric', month: 'long' }, date);
