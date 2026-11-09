-- Herramientas de Guerra · Calculadora (Matriz de Duelos)
-- Pegar una vez en Supabase → SQL Editor → Run. No toca las tablas del Diario.

-- Listas guardadas de cada usuario. Cada fila es un documento:
--   col = 'lists'  → una lista (nombre, texto, rol atacante/defensor…)
--   col = 'lunits' → las unidades ajustadas de una lista (en trozos)
create table if not exists public.calc_docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  col text not null,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, col, id)
);
alter table public.calc_docs enable row level security;
drop policy if exists "calc_select_own" on public.calc_docs;
drop policy if exists "calc_insert_own" on public.calc_docs;
drop policy if exists "calc_update_own" on public.calc_docs;
drop policy if exists "calc_delete_own" on public.calc_docs;
create policy "calc_select_own" on public.calc_docs for select to authenticated using (auth.uid() = user_id);
create policy "calc_insert_own" on public.calc_docs for insert to authenticated with check (auth.uid() = user_id);
create policy "calc_update_own" on public.calc_docs for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "calc_delete_own" on public.calc_docs for delete to authenticated using (auth.uid() = user_id);
