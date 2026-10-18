-- Схема барбершопа. Выполнить целиком в Supabase → SQL Editor (один раз).

create extension if not exists btree_gist;

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  duration_min int not null check (duration_min between 5 and 480),
  price int not null check (price >= 0),
  active boolean not null default true,
  sort int not null default 0
);

create table masters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null default '',
  bio text not null default '',
  active boolean not null default true,
  rating numeric(2,1) not null default 5.0 check (rating between 0 and 5),
  reviews_count int not null default 0 check (reviews_count >= 0),
  sort int not null default 0
);

create table master_services (
  master_id uuid not null references masters(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (master_id, service_id)
);

-- Часы работы: одна строка = рабочий день недели (1 = пн … 7 = вс). Нет строки — выходной.
create table schedule_rules (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references masters(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time),
  unique (master_id, weekday)
);

-- Повторяющиеся перерывы по дням недели.
create table schedule_breaks (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references masters(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

-- Исключения на даты: разовый выходной, отпуск (диапазон) или особые часы.
create table schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  master_id uuid not null references masters(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  kind text not null check (kind in ('off', 'vacation', 'hours')),
  start_time time,
  end_time time,
  note text not null default '',
  check (date_to >= date_from),
  check (kind <> 'hours' or (start_time is not null and end_time is not null and end_time > start_time))
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  master_id uuid not null references masters(id),
  service_id uuid not null references services(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  client_name text not null,
  client_phone text not null,
  client_token text,                       -- идентификатор браузерной сессии клиента
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'arrived', 'no_show', 'cancelled')),
  price int not null,
  source text not null default 'web' check (source in ('web', 'chat', 'admin')),
  consent_at timestamptz,
  reminders_ok boolean not null default false,
  created_at timestamptz not null default now(),
  constraint bookings_code_key unique (code),
  check (ends_at > starts_at)
);
create index bookings_token_idx on bookings (client_token);
create index bookings_starts_idx on bookings (starts_at);

-- Защита от двойной записи (занятыми считаются pending/confirmed/arrived):
-- 1) один мастер не может иметь два активных визита с одним началом;
create unique index bookings_master_start_uq on bookings (master_id, starts_at)
  where status in ('pending', 'confirmed', 'arrived');
-- 2) и любые пересекающиеся по времени визиты одного мастера.
alter table bookings add constraint bookings_no_overlap
  exclude using gist (master_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending', 'confirmed', 'arrived'));

-- Список админов (email). Доступ в /admin только им — проверяется в RLS и на сервере.
create table admin_emails (email text primary key);

-- Счётчики лимита сообщений (обслуживает функция hit_rate).
create table rate_hits (
  key text not null,
  window_start timestamptz not null,
  n int not null default 0,
  primary key (key, window_start)
);

create or replace function hit_rate(p_key text, p_window_s int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  cnt int;
begin
  insert into rate_hits (key, window_start, n) values (p_key, w, 1)
  on conflict (key, window_start) do update set n = rate_hits.n + 1
  returning n into cnt;
  -- чистим старое; суточные окна живут до 2 дней, иначе сбросили бы дневной счётчик
  if random() < 0.02 then delete from rate_hits where window_start < now() - interval '2 days'; end if;
  return cnt <= p_max;
end $$;
revoke all on function hit_rate(text, int, int) from public, anon, authenticated;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admin_emails where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

-- RLS: включена везде. Клиентские запросы идут через серверные функции (service_role обходит RLS),
-- поэтому для anon доступа к таблицам нет вообще. Админ (authenticated + is_admin) управляет данными напрямую.
alter table services enable row level security;
alter table masters enable row level security;
alter table master_services enable row level security;
alter table schedule_rules enable row level security;
alter table schedule_breaks enable row level security;
alter table schedule_exceptions enable row level security;
alter table bookings enable row level security;
alter table admin_emails enable row level security;
alter table rate_hits enable row level security;

do $$
declare t text;
begin
  foreach t in array array['services','masters','master_services','schedule_rules','schedule_breaks','schedule_exceptions','bookings'] loop
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

create policy own_row on admin_emails for select to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));
