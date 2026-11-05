-- Diario de Guerra: tablas y seguridad (pegar una vez en Supabase → SQL Editor → Run)

-- Partidas: cada fila es una partida de un usuario
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.games enable row level security;
drop policy if exists "games_select_own" on public.games;
drop policy if exists "games_insert_own" on public.games;
drop policy if exists "games_update_own" on public.games;
drop policy if exists "games_delete_own" on public.games;
create policy "games_select_own" on public.games for select to authenticated using (auth.uid() = user_id);
create policy "games_insert_own" on public.games for insert to authenticated with check (auth.uid() = user_id);
create policy "games_update_own" on public.games for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "games_delete_own" on public.games for delete to authenticated using (auth.uid() = user_id);
create index if not exists games_user_idx on public.games (user_id);

-- Ilustraciones de ejército aprendidas: cuando un usuario corrige el ejército,
-- se guarda la "huella" de color de la ilustración para acertar la próxima vez.
create table if not exists public.army_refs (
  id bigint generated always as identity primary key,
  army text not null,
  feat real[] not null,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.army_refs enable row level security;
drop policy if exists "army_refs_read" on public.army_refs;
drop policy if exists "army_refs_insert_own" on public.army_refs;
create policy "army_refs_read" on public.army_refs for select to authenticated using (true);
create policy "army_refs_insert_own" on public.army_refs for insert to authenticated with check (auth.uid() = created_by);
