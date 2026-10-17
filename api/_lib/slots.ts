import type { Break, Exception, Rule, SlotGroup } from '../../shared/types';
import { dateRange, hhmmToMin, isoWeekday, minToHhmm, zonedToMs } from '../../shared/time';

export interface Interval { start: number; end: number } // мс UTC

export interface MasterSchedule {
  masterId: string;
  rules: Rule[];
  breaks: Break[];
  exceptions: Exception[];
  busy: Interval[]; // активные записи
}

export interface SlotOpts {
  dateFrom: string;
  dateTo: string;
  durationMin: number;
  tz: string;
  stepMin: number;
  leadMin: number;
  nowMs: number;
  schedules: MasterSchedule[];
}

/**
 * Свободные окна = часы работы дня − перерывы − активные записи; дни с отпуском/выходным пропускаются.
 * Единственное место, где считаются слоты: им пользуются и бот, и ручная запись, и проверка при создании записи.
 */
export function computeSlots(o: SlotOpts): SlotGroup[] {
  const out: SlotGroup[] = [];
  const dur = o.durationMin * 60000;
  for (const date of dateRange(o.dateFrom, o.dateTo)) {
    const wd = isoWeekday(date);
    for (const s of o.schedules) {
      const excs = s.exceptions.filter((e) => e.date_from <= date && date <= e.date_to);
      if (excs.some((e) => e.kind !== 'hours')) continue; // выходной / отпуск
      const custom = excs.find((e) => e.kind === 'hours');
      const rule = s.rules.find((r) => r.weekday === wd);
      const hours = custom ? { start: custom.start_time!, end: custom.end_time! } : rule && { start: rule.start_time, end: rule.end_time };
      if (!hours) continue;
      const startMin = hhmmToMin(hours.start);
      const endMin = hhmmToMin(hours.end);
      const blocked: Interval[] = [
        ...s.busy,
        ...s.breaks.filter((b) => b.weekday === wd).map((b) => ({ start: zonedToMs(date, b.start_time, o.tz), end: zonedToMs(date, b.end_time, o.tz) })),
      ];
      const times: string[] = [];
      for (let m = startMin; m + o.durationMin <= endMin; m += o.stepMin) {
        const t = zonedToMs(date, minToHhmm(m), o.tz);
        if (t < o.nowMs + o.leadMin * 60000) continue;
        if (blocked.some((b) => t < b.end && t + dur > b.start)) continue;
        times.push(minToHhmm(m));
      }
      if (times.length) out.push({ master_id: s.masterId, date, times });
    }
  }
  return out;
}
