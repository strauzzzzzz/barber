import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Break, BookingRow, Catalog, Exception, Rule } from '../../shared/types';
import { ACTIVE_STATUSES } from '../../shared/config';

export type NewBooking = Omit<BookingRow, 'id'> & { consent_at: string; reminders_ok: boolean };

export interface Store {
  catalog(): Promise<Catalog>;
  schedules(masterIds: string[], fromIso: string, toIso: string): Promise<{ rules: Rule[]; breaks: Break[]; exceptions: Exception[]; bookings: BookingRow[] }>;
  /** conflict = слот уже занят (ограничение БД); duplicateCode = код записи уже есть. */
  insertBooking(b: NewBooking): Promise<{ ok: true; booking: BookingRow } | { ok: false; conflict?: boolean; duplicateCode?: boolean }>;
  getBooking(by: { id?: string; code?: string }): Promise<BookingRow | null>;
  bookingsByToken(token: string): Promise<BookingRow[]>;
  bookingsBetween(fromIso: string, toIso: string): Promise<BookingRow[]>;
  updateBooking(id: string, patch: Partial<Pick<BookingRow, 'status' | 'starts_at' | 'ends_at'>>): Promise<{ ok: boolean; conflict?: boolean }>;
  /** true — запрос разрешён, false — лимит исчерпан. */
  hitRate(key: string, windowS: number, max: number): Promise<boolean>;
  /** email админа по JWT или null. */
  adminEmail(jwt: string): Promise<string | null>;
  adminEmails(): Promise<string[]>;
}

const num = (r: any) => ({ ...r, rating: Number(r.rating) });

export function supabaseStore(url: string, serviceKey: string): Store {
  const db: SupabaseClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const must = <T>(r: { data: T | null; error: any }): T => {
    if (r.error) throw new Error(r.error.message);
    return r.data as T;
  };
  const conflict = (e: any) => e?.code === '23P01' || (e?.code === '23505' && !String(e.message).includes('bookings_code_key'));
  return {
    async catalog() {
      const [services, masters, links] = await Promise.all([
        db.from('services').select('*').order('sort'),
        db.from('masters').select('*').order('sort'),
        db.from('master_services').select('master_id, service_id'),
      ]);
      return { services: must(services), masters: must(masters).map(num), links: must(links) };
    },
    async schedules(ids, fromIso, toIso) {
      const [rules, breaks, exceptions, bookings] = await Promise.all([
        db.from('schedule_rules').select('*').in('master_id', ids),
        db.from('schedule_breaks').select('*').in('master_id', ids),
        db.from('schedule_exceptions').select('*').in('master_id', ids),
        db.from('bookings').select('*').in('master_id', ids).in('status', ACTIVE_STATUSES).lt('starts_at', toIso).gt('ends_at', fromIso),
      ]);
      return { rules: must(rules), breaks: must(breaks), exceptions: must(exceptions), bookings: must(bookings) };
    },
    async insertBooking(b) {
      const { data, error } = await db.from('bookings').insert(b).select().single();
      if (!error) return { ok: true, booking: data as BookingRow };
      if (conflict(error)) return { ok: false, conflict: true };
      if (error.code === '23505') return { ok: false, duplicateCode: true };
      throw new Error(error.message);
    },
    async getBooking({ id, code }) {
      const q = db.from('bookings').select('*');
      const { data, error } = await (id ? q.eq('id', id) : q.eq('code', code ?? '')).maybeSingle();
      if (error) throw new Error(error.message);
      return data as BookingRow | null;
    },
    async bookingsByToken(token) {
      return must(await db.from('bookings').select('*').eq('client_token', token).order('starts_at', { ascending: false }).limit(50));
    },
    async bookingsBetween(fromIso, toIso) {
      return must(await db.from('bookings').select('*').gte('starts_at', fromIso).lt('starts_at', toIso).order('starts_at'));
    },
    async updateBooking(id, patch) {
      const { error } = await db.from('bookings').update(patch).eq('id', id);
      if (!error) return { ok: true };
      if (conflict(error)) return { ok: false, conflict: true };
      throw new Error(error.message);
    },
    async hitRate(key, windowS, max) {
      return must(await db.rpc('hit_rate', { p_key: key, p_window_s: windowS, p_max: max })) as boolean;
    },
    async adminEmails() {
      return must(await db.from('admin_emails').select('email')).map((r: { email: string }) => r.email);
    },
    async adminEmail(jwt) {
      const { data } = await db.auth.getUser(jwt);
      const email = data.user?.email?.toLowerCase();
      if (!email) return null;
      const { data: row } = await db.from('admin_emails').select('email').ilike('email', email).maybeSingle();
      return row ? email : null;
    },
  };
}
