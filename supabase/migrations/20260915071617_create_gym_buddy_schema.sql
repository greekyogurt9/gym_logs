-- My Gym Buddy — V1 schema (Phase 2).
--
-- Model: Workout -> WorkoutExercise -> Set, plus a per-user Exercise catalog
-- and a Profiles mirror of auth.users. See README "Database Design".
--
-- Conventions:
--   * UUID primary keys everywhere (gen_random_uuid() is core Postgres 13+).
--   * timestamptz for all times. started_at is the ordering key, not IDs.
--   * Ownership lives in exactly ONE column: user_id on exercises/workouts.
--     Child tables authorize through joins to workouts (see RLS below).
--   * CHECK constraints mirror the V1 validation rules in lib/validation.ts
--     (Phase 3), so invalid data is rejected even if the app has a bug.
--   * RLS is ON from day one with default-deny. The anon/authenticated roles
--     get explicit GRANTs; without them PostgREST returns "permission denied"
--     even when a policy would allow the row. Grants open the door, RLS
--     policies decide which rows each user may touch.

-- ---------------------------------------------------------------- profiles
-- Public mirror of auth.users. Never write to auth.users directly; a trigger
-- (bottom of this file) creates one profile row per new auth user.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- exercises
-- Canonical exercise names, one catalog per user ("Squat" for user A is a
-- different row than "Squat" for user B). Workout history and PRs (V3) group
-- by exercise_id. The UNIQUE constraint doubles as the lookup index for
-- WHERE user_id = ? (btree prefix), so no extra index is needed.

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) >= 1 and char_length(name) <= 60),
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ----------------------------------------------------------------- workouts
-- One training session. Deleting a workout cascades to its
-- workout_exercises and (through them) to sets.

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) >= 1 and char_length(title) <= 80),
  started_at timestamptz not null default now(),
  ended_at timestamptz null check (ended_at is null or ended_at >= started_at),
  created_at timestamptz not null default now()
);

-- Covers the history list: WHERE user_id = ? ORDER BY created_at DESC.
create index idx_workouts_user_created
  on public.workouts (user_id, created_at desc);

-- -------------------------------------------------------- workout_exercises
-- Join: which exercises were in which workout, and in what order (position).
-- V1 allows one entry per exercise per workout; relax the second UNIQUE later
-- if supersets (same exercise twice) are ever needed.

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete restrict,
  position int not null check (position >= 0),
  unique (workout_id, position),
  unique (workout_id, exercise_id)
);

create index idx_workout_exercises_workout on public.workout_exercises (workout_id);
create index idx_workout_exercises_exercise on public.workout_exercises (exercise_id);

-- ---------------------------------------------------------------------- sets
-- One logged set: weight x reps. set_number is 1-based within the exercise.

create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number int not null check (set_number >= 1),
  weight_kg numeric(6, 1) not null check (weight_kg > 0 and weight_kg <= 1000),
  reps int not null check (reps >= 1 and reps <= 1000),
  created_at timestamptz not null default now(),
  unique (workout_exercise_id, set_number)
);

create index idx_sets_workout_exercise on public.sets (workout_exercise_id);

-- ----------------------------------------------------------------------- RLS
-- Default deny on every app table. auth.uid() comes from the verified JWT,
-- never from client input, so policies hold even if frontend code has bugs.
-- USING filters rows for reads; WITH CHECK validates rows for writes.

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.sets enable row level security;

-- Profiles: a user sees and edits only their own row. (Creation is done by
-- the handle_new_user trigger, which runs as SECURITY DEFINER and bypasses
-- RLS. No DELETE policy: profiles disappear via ON DELETE CASCADE from
-- auth.users, never by direct delete.)

create policy "own_profile_select" on public.profiles
  for select using (auth.uid() = id);

create policy "own_profile_insert" on public.profiles
  for insert with check (auth.uid() = id);

create policy "own_profile_update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Exercises: direct ownership.

create policy "own_exercises_select" on public.exercises
  for select using (auth.uid() = user_id);

create policy "own_exercises_insert" on public.exercises
  for insert with check (auth.uid() = user_id);

create policy "own_exercises_update" on public.exercises
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_exercises_delete" on public.exercises
  for delete using (auth.uid() = user_id);

-- Workouts: direct ownership.

create policy "own_workouts_select" on public.workouts
  for select using (auth.uid() = user_id);

create policy "own_workouts_insert" on public.workouts
  for insert with check (auth.uid() = user_id);

create policy "own_workouts_update" on public.workouts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own_workouts_delete" on public.workouts
  for delete using (auth.uid() = user_id);

-- Workout_exercises: ownership inherited from the parent workout via join.
-- Deliberately no user_id column here: one source of truth for ownership,
-- so a child row can never disagree with its workout about who owns it.

create policy "own_we_select" on public.workout_exercises
  for select using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  );

create policy "own_we_insert" on public.workout_exercises
  for insert with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  );

create policy "own_we_update" on public.workout_exercises
  for update
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  );

create policy "own_we_delete" on public.workout_exercises
  for delete using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  );

-- Sets: ownership inherited from the grandparent workout via two joins.

create policy "own_sets_select" on public.sets
  for select using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );

create policy "own_sets_insert" on public.sets
  for insert with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );

create policy "own_sets_update" on public.sets
  for update
  using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );

create policy "own_sets_delete" on public.sets
  for delete using (
    exists (
      select 1
      from public.workout_exercises we
      join public.workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );

-- -------------------------------------------------------------------- grants
-- RLS policies alone are not enough: Postgres also requires table-level
-- GRANTs for the anon/authenticated roles, otherwise every API call fails
-- with "permission denied for table ...". No grants to anon: V1 local mode
-- needs no DB access, and V2 always talks as an authenticated user.

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.exercises to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.sets to authenticated;

-- ------------------------------------------------- auto-create profile rows
-- Standard Supabase pattern: one public.profiles row per auth.users row.
-- SECURITY DEFINER lets the trigger write through RLS; search_path is fixed
-- so the function cannot be tricked into resolving objects elsewhere.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
