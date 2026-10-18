// Проверка настоящей схемы и seed.sql в Postgres (PGlite = Postgres в WASM): ограничения от двойной записи, лимит.
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { M, S } from '../shared/seed';

let db: PGlite;
const sql = (f: string) => readFileSync(new URL(`../supabase/${f}`, import.meta.url), 'utf8');

const ins = (code: string, start: string, end: string, status = 'confirmed', master = M.anna) =>
  db.query(
    `insert into bookings (code, master_id, service_id, starts_at, ends_at, client_name, client_phone, status, price)
     values ($1, $2, $3, $4, $5, 'T', '+7', $6, 1)`,
    [code, master, S.cut, start, end, status],
  );

beforeAll(async () => {
  db = new PGlite({ extensions: { btree_gist } });
  // заглушки того, что в Supabase есть из коробки
  await db.exec(`create schema auth; create function auth.jwt() returns jsonb language sql as $$ select '{}'::jsonb $$;
                 create role anon; create role authenticated;`);
  await db.exec(sql('migrations/001_init.sql'));
  await db.exec(sql('seed.sql'));
});

describe('схема и seed в Postgres', () => {
  it('seed загрузился, RLS включён на всех таблицах', async () => {
    expect((await db.query<{ n: string }>('select count(*)::text n from masters')).rows[0].n).toBe('4');
    const off = await db.query("select relname from pg_class where relkind='r' and relnamespace='public'::regnamespace and not relrowsecurity");
    expect(off.rows).toEqual([]);
  });

  it('второй визит с тем же началом у мастера отклоняется', async () => {
    await ins('T1AAAAAA', '2030-01-01 10:00+00', '2030-01-01 11:00+00');
    await expect(ins('T2AAAAAA', '2030-01-01 10:00+00', '2030-01-01 10:30+00')).rejects.toThrow(/bookings_master_start_uq|bookings_no_overlap/);
  });

  it('пересекающийся по времени визит отклоняется, смежный — нет', async () => {
    await expect(ins('T3AAAAAA', '2030-01-01 10:30+00', '2030-01-01 11:30+00')).rejects.toThrow(/bookings_no_overlap/);
    await ins('T4AAAAAA', '2030-01-01 11:00+00', '2030-01-01 12:00+00');
  });

  it('другой мастер в то же время — можно; отменённая запись слот не держит', async () => {
    await ins('T5AAAAAA', '2030-01-01 10:00+00', '2030-01-01 11:00+00', 'confirmed', M.artem);
    await db.query("update bookings set status='cancelled' where code='T1AAAAAA'");
    await ins('T6AAAAAA', '2030-01-01 10:00+00', '2030-01-01 11:00+00');
  });

  it('код записи уникален', async () => {
    await expect(ins('T6AAAAAA', '2031-01-01 10:00+00', '2031-01-01 11:00+00')).rejects.toThrow(/bookings_code_key/);
  });

  it('hit_rate: после лимита возвращает false', async () => {
    const hit = async () => (await db.query<{ hit_rate: boolean }>("select hit_rate('k', 3600, 3)")).rows[0].hit_rate;
    expect([await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false]);
  });
});
