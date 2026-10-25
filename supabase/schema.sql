-- La Podrida · esquema de base de datos (Supabase / PostgreSQL)
-- Pégalo entero en: Supabase → SQL Editor → New query → Run.  Es seguro ejecutarlo más de una vez.
-- Puedes usar el MISMO proyecto de Supabase que el Crapé: las tablas llevan el prefijo "podrida_" y no se pisan.

-- ============================================================ SALAS (solo el servidor)
-- Contiene manos y estado completo de la partida: ningún navegador puede leerla ni escribirla.
create table if not exists public.podrida_rooms (
  code         text primary key,
  status       text not null default 'WAITING' check (status in ('WAITING','PLAYING','FINISHED','CLOSED')),
  host_id      uuid not null references auth.users(id) on delete cascade,
  players      jsonb not null default '[]',
  options      jsonb not null default '{}',
  game         jsonb,
  game_number  integer not null default 1,
  version      integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.podrida_rooms enable row level security;   -- sin políticas = acceso denegado a anon/authenticated
revoke all on public.podrida_rooms from anon, authenticated;
create index if not exists podrida_rooms_updated_idx on public.podrida_rooms (updated_at);

-- ============================================================ HISTORIAL (lectura para los jugadores de cada partida)
create table if not exists public.podrida_matches (
  id                uuid primary key default gen_random_uuid(),
  room_code         text not null,
  game_number       integer not null,
  player_ids        uuid[] not null,
  players           jsonb not null,           -- [{id,name,score,rank,abandoned,result}]
  rounds            integer not null,
  double_lap        boolean not null default false,
  ended_by_abandon  boolean not null default false,
  started_at        timestamptz not null,
  ended_at          timestamptz not null,
  unique (room_code, game_number)             -- evita duplicados si se reintenta
);
alter table public.podrida_matches enable row level security;
revoke all on public.podrida_matches from anon, authenticated;
grant select on public.podrida_matches to authenticated;   -- los usuarios anónimos de Supabase también son "authenticated"

drop policy if exists "ver mis partidas" on public.podrida_matches;
create policy "ver mis partidas" on public.podrida_matches
  for select to authenticated
  using (auth.uid() = any (player_ids));
-- No hay políticas de insert/update/delete: solo el servidor (service_role) escribe las estadísticas.

create index if not exists podrida_matches_players_idx on public.podrida_matches using gin (player_ids);
create index if not exists podrida_matches_ended_idx on public.podrida_matches (ended_at desc);

-- ============================================================ LIMPIEZA OPCIONAL
-- Borra salas sin actividad en 30 días. Para programarlo: Database → Extensions → activa "pg_cron" y descomenta:
-- select cron.schedule('limpiar-salas-podrida', '0 4 * * *', $$ delete from public.podrida_rooms where updated_at < now() - interval '30 days' $$);
