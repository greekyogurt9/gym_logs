-- My Gym Buddy — per-exercise targets (second migration).
--
-- One active target per exercise per user ("120 kg squat by 2026-12-31").
-- Direct user_id ownership like exercises (not join-based): targets are
-- top-level user intent, not children of any workout.

create table public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  target_weight_kg numeric(6, 1) not null check (target_weight_kg > 0 and target_weight_kg <= 1000),
  target_date date not null,
  created_at timestamptz not null default now(),
  unique (user_id, exercise_id)
);

create index idx_targets_user on public.targets (user_id);

alter table public.targets enable row level security;

create policy "own_targets_select" on public.targets
  for select using (auth.uid() = user_id);

create policy "own_targets_insert" on public.targets
  for insert with check (auth.uid() = user_id);

create policy "own_targets_update" on public.targets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_targets_delete" on public.targets
  for delete using (auth.uid() = user_id);

grant select, insert, update, delete on public.targets to authenticated;
