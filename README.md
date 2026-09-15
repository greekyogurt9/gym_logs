# My Gym Buddy

A minimal workout logger: Workout → Exercise → Set → Weight × Reps.

Phase 1 done: Next.js scaffold + data-layer contract live in this repo. Full roadmap below.

## Project Goal

Build the smallest useful end-to-end workout logger in ~1 hour, but on top of a
real-world architecture and workflow:

- Log a workout with exercises and sets (weight + reps).
- View history, view one workout in detail, delete a workout.
- Run locally, store data sensibly, deploy to production.
- Learn the engineering process: Next.js, TypeScript, Postgres, Supabase,
  Row Level Security (RLS), auth architecture, env vars, Git/GitHub,
  migrations, Vercel, testing, production debugging.

V1 is deliberately boring. It should simply work and be deployable.

Example data model:

```text
Workout: Legs (2026-09-08)
  Squat
    Set 1 — 30 kg x 10
    Set 2 — 35 kg x 8
  RDL
    Set 1 — 30 kg x 10
```

## Product Philosophy

1. **Complete over polished.** No animations, dashboards, social, AI, or programming.
2. **Boring technology.** Next.js + TypeScript + Supabase/Postgres + Vercel.
3. **Local-first V1, cloud in V2.** V1 must work without login. V2 adds accounts
   without rewriting V1.
4. **Database is the source of truth for authorization.** RLS enforces
   "users see only their own data", not just UI checks.
5. **Small files, clear boundaries.** UI never talks to Postgres directly.
   All data access goes through one layer.
6. **Migrations, not dashboard clicks.** Every schema change is a SQL file
   in `supabase/migrations`, reviewable in Git.
7. **No secrets in Git. Ever.** Public repo. Env vars for everything sensitive.

## Architecture

```text
Next.js App Router (TypeScript, Vercel)
  |
  v
Data-access layer (`lib/` — the only place that imports Supabase)
  |
  +---> V1: LocalStorage repository (no login required)
  +---> V2: Supabase repository (authenticated, RLS-enforced)
  |
  v
Supabase (Auth + PostgREST API)
  |
  v
PostgreSQL (tables + constraints + RLS policies)
```

### Where does logic live?

| Concern | Location | Rule |
|---|---|---|
| UI rendering, forms, routing | `app/`, `components/` | No SQL, no `supabase.from()` calls here. Call functions from `lib/`. |
| Business/data logic | `lib/workouts.ts`, `lib/validation.ts`, `lib/types.ts` | Validation (weight > 0, reps > 0, non-empty names), sorting, shaping data. Pure TypeScript, easily unit-tested. |
| Supabase queries | `lib/supabase/client.ts`, `lib/supabase/queries.ts` (V2) | Only place that imports `@supabase/supabase-js`. Exposes functions like `listWorkouts()`, `createWorkout()`, not raw query builders. |
| Auth logic (V2) | `lib/supabase/auth.ts`, `middleware.ts`, Supabase Auth | Login, logout, session refresh, protected routes. UI only calls `signInWithGoogle()`, `signOut()`, `getUser()`. |
| Env configuration | `.env.local` (local, gitignored), Vercel dashboard (prod), `.env.example` (template) | Code reads `process.env.NEXT_PUBLIC_SUPABASE_URL` etc. Never hardcode URLs or keys. |

### Key architectural decision: Repository interface

V1 defines a TypeScript interface once, and V2 reuses it:

```ts
// lib/types.ts (shared by V1 local + V2 cloud)
type Workout = { id: string; title: string; startedAt: string; endedAt?: string };
type WorkoutExercise = { id: string; workoutId: string; exerciseName: string; position: number };
type SetEntry = { id: string; workoutExerciseId: string; setNumber: number; weightKg: number; reps: number };

// lib/repository.ts (implemented twice, UI doesn't care)
interface WorkoutRepository {
  listWorkouts(): Promise<Workout[]>;
  getWorkout(id: string): Promise<WorkoutDetail>;
  createWorkout(input: NewWorkout): Promise<Workout>;
  deleteWorkout(id: string): Promise<void>;
}
```

- V1 implements it with `localStorage`.
- V2 implements it with Supabase.
- UI components depend only on the interface.

Why this matters: V2 (Google login + cloud sync) becomes "add a new
implementation + a migrate button", not a rewrite. This is the single most
important decision for staying inside the 1-hour V1 budget while staying
production-aware.

### Why Next.js App Router (not Vite / plain React)?

- File-based routing gives us `/`, `/workouts/[id]`, `/new` for free.
- Server Components by default keep secrets server-side in V2.
- Vercel deploys Next.js with zero config (Git push → deploy).
- One repo, one framework, one deployment target = less to learn and debug.

### Why Supabase instead of a custom Express backend?

- No backend server to write, host, or secure in V1.
- Postgres + Auth + auto-generated API in one service.
- RLS lets Postgres enforce per-user isolation even if frontend code has bugs.
- Migrations via Supabase CLI teach real DB workflow without DevOps overhead.

Trade-off we accept: we learn PostgREST/RLS patterns instead of learning how
to build a REST API from scratch. For a 1-hour MVP that is the right trade.

## Tech Stack

| Layer | Choice | Purpose |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript | UI, routing, deployment unit |
| Validation | Zod (or minimal hand-rolled checks in V1) | Single validation schema shared by form + data layer |
| Backend API | Supabase (PostgREST + Auth) | No custom server; DB-backed API |
| Database | PostgreSQL (via Supabase) | Relational workout data + RLS |
| Auth (V2) | Supabase Auth, Google OAuth provider | No passwords to store |
| Deploy | Vercel, connected to GitHub `main` | Push → preview/production deploy |
| VCS | Git + GitHub (`greekyogurt9/gym_logs`) | History, PRs, code review |
| Testing (V1) | `tsc --noEmit` + small Vitest unit tests + manual smoke list | Catch type/validation bugs fast |
| Testing (later) | Playwright smoke test, SQL RLS tests | Auth + deployment confidence |

No ORM in V1. Supabase client + SQL migrations are enough. Adding Prisma/Drizzle
now would blow the 1-hour budget for zero user value.

## V1 — Minimal Workout Logger

Goal: smallest useful end-to-end product. No login.

Must have (10 items):

1. Create/start a workout (title + date, default today).
2. Add exercises to it (free-text name, e.g. "Squat").
3. Add multiple sets per exercise.
4. Record weight (kg) + reps per set.
5. Save workout (explicit Save; draft lives in form state until saved).
6. View workout history (list, newest first).
7. View one previous workout with all exercises + sets.
8. Delete a workout (with confirm).
9. Basic input validation (see below).
10. Basic error handling (empty states, load failure, save failure).

Validation (V1):

- Workout title: 1–80 chars.
- Exercise name: 1–60 chars, trim whitespace.
- Weight: number, > 0, <= 1000, max 1 decimal.
- Reps: integer, 1–1000.
- At least 1 exercise, at least 1 set per exercise to save.
- All validation runs in `lib/validation.ts` so V2 reuses it.

Error handling (V1):

- Storage failure → show message, don't lose form state.
- Workout not found (bad `/workouts/[id]`) → friendly "not found" page.
- Delete → `confirm()` + undo is out of scope; just confirm.

V1 storage: `localStorage` behind the repository interface. DB schema is
created in parallel (Phase 2) with RLS ON, but V1 UI does not require auth.
This keeps V1 deployable to Vercel with zero secrets while the production
schema already exists and is locked down.

V1 pages (only 3):

- `/` — history list + "New workout" button.
- `/new` — create form (workout + exercises + sets).
- `/workouts/[id]` — detail + delete.

That's it. No edit-workout, no charts, no search in V1.

## V2 — Accounts & Cloud Data

Goal: Google login + personal cloud data. No rewrite.

Scope:

- Supabase Auth with Google OAuth provider.
- Protected routes via `middleware.ts` (redirect anonymous away from `/new` only
  if they opted into cloud; local logging still allowed).
- Supabase repository implementation of the same `WorkoutRepository` interface.
- RLS policies enforced (see Database Design).
- Migrate button: "Upload my local workouts to my account".
- Sign out. Delete account data is out of scope (manual via Supabase dashboard).

Explicitly NOT in V2: sharing, friends, offline conflict resolution,
multi-device realtime sync. Just single-direction local → cloud copy.

Why Google via Supabase (not NextAuth / custom JWT)?

- Zero password storage, zero session tables to manage.
- Supabase gives `auth.uid()` directly inside Postgres RLS policies.
- One vendor for Auth + DB means fewer env vars and fewer failure modes.

## V3 — Progress Tracking

Goal: useful tracking, not a fitness platform.

Worth building:

- Show previous weight/reps inline when logging a set ("last time: 35 × 8").
- Exercise history page (`/exercises/[name]` — all sets over time).
- Personal records (max weight, max volume per exercise).
- Simple progression line (weight over time, no chart library in first pass —
  table + minimal SVG or later Recharts).
- "Repeat previous workout" (copy exercises/sets as a new draft).
- Basic stats: workouts/week, total volume per workout.
- Better offline: queue writes, retry on reconnect.
- Real local/cloud sync (timestamps + `updated_at`, last-write-wins first).

Unnecessary (do not build):

- Social feed, likes, follows, comments.
- AI coach, recommendations, auto-programming.
- Video library, GIF demos, animation-heavy UI.
- Calorie/macros tracking, wearables integration.
- Admin panel, roles, teams, payments.

Rule: if a feature doesn't help answer "am I lifting more than last time?",
it waits.

## Database Design

Postgres via Supabase. UUIDs everywhere. `timestamptz` for all times.
RLS ON from the first migration.

### Tables

**1. `profiles` — public mirror of `auth.users`**

- Purpose: store app-level user data; `auth.users` is managed by Supabase and
  should not be written to directly.
- Columns: `id uuid PK FK -> auth.users.id ON DELETE CASCADE`, `email text`,
  `created_at timestamptz default now()`.
- Indexes: PK is enough.
- Ownership: one row per user, `id = auth.uid()`.

**2. `exercises` — exercise catalog (per user)**

- Purpose: canonical names ("Squat") so history/PRs can group by exercise.
- Columns: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL FK -> auth.users.id ON DELETE CASCADE`,
  `name text NOT NULL`, `created_at timestamptz default now()`,
  `UNIQUE (user_id, name)`.
- Indexes: `idx_exercises_user (user_id)`, unique constraint covers `(user_id, name)` lookups.
- Relationships: one user → many exercises; one exercise → many `workout_exercises`.
- Note: V1 uses free-text names locally; V2 inserts into this table on first use
  (upsert on `(user_id, name)`).

**3. `workouts` — one training session**

- Purpose: the top-level log entry.
- Columns: `id uuid PK default gen_random_uuid()`, `user_id uuid NOT NULL FK -> auth.users.id ON DELETE CASCADE`,
  `title text NOT NULL (e.g. "Legs")`, `started_at timestamptz NOT NULL default now()`,
  `ended_at timestamptz NULL`, `created_at timestamptz default now()`.
- Indexes: `idx_workouts_user_created (user_id, created_at DESC)` — covers the
  history list query.
- Relationships: one user → many workouts; one workout → many `workout_exercises`.
- Delete behavior: `ON DELETE CASCADE` from user; deleting a workout cascades to
  its `workout_exercises` → `sets`.

**4. `workout_exercises` — join: which exercises were in which workout, in what order**

- Purpose: preserves order (`position`) and allows the same exercise in many workouts.
- Columns: `id uuid PK`, `workout_id uuid NOT NULL FK -> workouts.id ON DELETE CASCADE`,
  `exercise_id uuid NOT NULL FK -> exercises.id ON DELETE RESTRICT`,
  `position int NOT NULL CHECK (position >= 0)`, `UNIQUE (workout_id, position)`,
  `UNIQUE (workout_id, exercise_id)` (V1: one entry per exercise per workout; relax later if supersets needed).
- Indexes: `idx_we_workout (workout_id)`, `idx_we_exercise (exercise_id)`.
- Ownership: inherited from parent workout (see RLS below). No `user_id` column
  in V1 to avoid dual sources of truth.

**5. `sets` — one set: weight × reps**

- Purpose: the actual logged data.
- Columns: `id uuid PK`, `workout_exercise_id uuid NOT NULL FK -> workout_exercises.id ON DELETE CASCADE`,
  `set_number int NOT NULL CHECK (set_number >= 1)`, `weight_kg numeric(6,1) NOT NULL CHECK (weight_kg > 0 AND weight_kg <= 1000)`,
  `reps int NOT NULL CHECK (reps >= 1 AND reps <= 1000)`, `created_at timestamptz default now()`,
  `UNIQUE (workout_exercise_id, set_number)`.
- Indexes: `idx_sets_we (workout_exercise_id)`.
- Ownership: inherited from grandparent workout via join.

```text
auth.users 1──* profiles
auth.users 1──* exercises 1──* workout_exercises *──1 workouts
auth.users 1──* workouts 1──* workout_exercises 1──* sets
```

### Row Level Security

Principles:

- `ENABLE ROW LEVEL SECURITY` on every app table. Default deny.
- Authenticated users can only touch their own rows: `auth.uid() = user_id`.
- Child tables (`workout_exercises`, `sets`) authorize by joining to `workouts`
  so there is exactly one ownership column in the model.
- `service_role` key bypasses RLS — it must never ship to the browser or Git.
- Anonymous (`anon`) role is locked out by RLS, not by missing grants: Supabase
  pre-grants table access to `anon`/`authenticated`, so `anon` SELECTs return
  0 rows (`auth.uid()` is null) and `anon` INSERTs fail the WITH CHECK.
  Verified locally in Phase 2. V1 local mode needs no DB access at all,
  so nothing is opened up for anonymous users.

Example policies (illustrative — final SQL lives in `supabase/migrations/`):

```sql
-- workouts: direct ownership
create policy "own_workouts_select" on workouts
  for select using (auth.uid() = user_id);
create policy "own_workouts_insert" on workouts
  for insert with check (auth.uid() = user_id);
create policy "own_workouts_update" on workouts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_workouts_delete" on workouts
  for delete using (auth.uid() = user_id);

-- workout_exercises: ownership via parent workout
create policy "own_we_select" on workout_exercises
  for select using (
    exists (select 1 from workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid())
  );
-- (repeat for insert/update/delete with with check on the same exists() test)

-- sets: ownership via grandparent workout
create policy "own_sets_select" on sets
  for select using (
    exists (
      select 1 from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );
-- (repeat for insert/update/delete)
```

Alternative considered: duplicate `user_id` onto every child table for simpler
policies and faster queries. Rejected for V1 because it creates two sources of
truth (risk of `sets.user_id != workouts.user_id`). If join-based policies
prove slow at scale, add `user_id` later as a denormalized column with a trigger.

What you should understand about RLS after this project: the database — not
the frontend — is the last line of defense; `USING` filters reads, `WITH CHECK`
validates writes; `auth.uid()` comes from the verified JWT, not from client input.

## Authentication Strategy

V1: architected for, not implemented. No login screen, no session code in V1.
But types, repository interface, and `user_id` columns already assume "one user
owns many rows", so V2 slots in.

V2 (planned):

1. Enable Google provider in Supabase dashboard (authorized redirect URLs:
   `http://localhost:3000/auth/callback` + production URL).
2. `@supabase/ssr` for cookie-based sessions. Client Component for the
   "Sign in with Google" button → `supabase.auth.signInWithOAuth({ provider: 'google' })`.
3. `app/auth/callback/route.ts` exchanges code for session, sets cookies.
4. `middleware.ts` refreshes the session on every request and optionally guards
   `/new` for users who chose cloud-only mode.
5. `profiles` row auto-created by a `handle_new_user()` trigger on
   `auth.users` insert (standard Supabase pattern).
6. All data queries use the anon key + user JWT. RLS does the isolation.
   `service_role` is never used by the app.

What you should understand: OAuth flow (redirect → provider → callback → cookie),
why the anon key is safe to expose but `service_role` is not, and why session
refresh belongs in middleware rather than in every page.

## Local vs Cloud Data Strategy

Intended V2 migration (designed now, built later):

```text
V1: localStorage only (key: "my-gym-buddy:workouts:v1")
         |
         v (user clicks "Sign in with Google")
Authenticated, empty cloud account
         |
         v (user clicks "Upload my local workouts")
For each local workout (oldest first):
  insert workout -> insert exercises (upsert by name)
  -> insert workout_exercises -> insert sets
         |
         v
Cloud is now source of truth on this device.
Local key kept as backup ("...:backup:<timestamp>"), then cleared.
```

Rules to avoid a rewrite:

- Local and cloud share the same TypeScript types (`lib/types.ts`).
- IDs are UUIDs in both stores, so inserts don't collide.
- `started_at` is the ordering key, not auto-increment IDs.
- Migration is explicit (button), not automatic — no surprise overwrites,
  no conflict resolution needed in V2.
- After migration, the Supabase repository is the default; local becomes
  read-only backup until user confirms.

Edge cases V2 must handle (not V1): user signs in on a second device (cloud wins),
user edits local data after uploading (warn before re-upload), upload partially
fails (stop, report count, keep local intact — never delete local until cloud
read-back succeeds).

## Security

This repo is PUBLIC. Treat it as hostile-readable.

Never commit or paste anywhere (code, README, logs, screenshots, commit messages):

- passwords, API keys, OAuth secrets, `service_role` keys, DB passwords,
  GitHub/Vercel tokens, cookies, `.env` contents.

Rules:

- `.env`, `.env.local`, `.env.production`, `*.pem`, `credentials.json`,
  `service_role.json` are gitignored from Phase 0. Check `git status` + `git diff`
  before every commit.
- Frontend may only use `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  The anon key is designed to be public *when RLS is on* — it is still a secret
  in the sense that you never commit it; it lives in `.env.local` + Vercel env vars.
- `service_role` key: server/emergency use only, never in `NEXT_PUBLIC_*`,
  never in client components, never in Git.
- If a secret is ever committed: rotate it immediately in Supabase/Vercel
  dashboards, purge history is not enough (assume it was scraped).
- If OpenCode or a log prints a secret during development: stop, rotate, and
  do not copy it into chat or docs.

`.gitignore` (from Phase 0) must cover at minimum:

```gitignore
node_modules/
.next/
.env
.env.local
.env.production
*.pem
credentials*.json
supabase/.branches
supabase/.temp
```

## Development Workflow

```text
Local (npm run dev) -> branch -> PR -> review -> merge to main
                                          |
                              GitHub (history + PRs)
                                          |
                        Supabase migration (supabase db push)
                                          |
                              Vercel (auto-deploy main)
```

Daily loop:

1. `git pull origin main`, create branch (`git checkout -b feat/history-list`).
2. `npm run dev` — build against local types + localStorage (V1) or
   `supabase start` for local Postgres (Phase 2+).
3. Schema change? Write `supabase/migrations/<timestamp>_what.sql`, test with
   `supabase db reset`, never edit prod via dashboard.
4. `npx tsc --noEmit`, run unit tests, manual smoke checklist.
5. `git status` → `git diff` (secret check) → commit → push → open PR.
6. Merge to `main` only when Vercel preview deploy passes.

Branch naming: `feat/*`, `fix/*`, `chore/*`, `docs/*`. One concern per PR.
Commit messages: imperative, short (`Add workout history list`).

## Deployment Workflow

```text
Local dev -> Git -> GitHub (main) -> Vercel build -> Production
                                    -> Supabase (prod project, migrations applied)
```

- Vercel project is connected to `greekyogurt9/gym_logs`, root = repo root,
  framework preset = Next.js, branch = `main`.
- Every push to `main` → production deploy. Every PR → preview URL for review.
- Supabase has exactly one remote project (prod). Schema changes reach it via
  `supabase db push` (or `supabase link` + `supabase migration up`) from a clean
  local migration — never by clicking in the prod dashboard.
- Rollback: `git revert` + redeploy on Vercel; DB rollback = new down-migration,
  never `db reset` on prod.

Prod vs dev config:

| | Local dev | Production (Vercel) |
|---|---|---|
| URL | `http://localhost:3000` | `https://<app>.vercel.app` |
| Supabase URL/key | `.env.local` (gitignored) | Vercel → Settings → Environment Variables |
| OAuth redirect | `http://localhost:3000/auth/callback` | `https://<app>.vercel.app/auth/callback` |
| Debug | console + React devtools | Vercel logs + Supabase logs; no `console.log(secrets)` |

Deployment checklist (Phase 7): `npm run build` passes locally → env vars set in
Vercel → `main` deployed → open prod URL → create/view/delete one workout →
check Vercel + Supabase logs for errors.

## Environment Variables

| Name | Scope | Required in | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public (safe for browser) | V2+ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public *only with RLS on* | V2+ | Client key, governed by RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | server only — NEVER `NEXT_PUBLIC_*`, never commit | emergency scripts only | Bypasses RLS; not used by the app |
| `NEXT_PUBLIC_APP_URL` | public | V2+ | Canonical URL for OAuth redirects |

`.env.example` (committed, no values) documents the shape:

```bash
# Copy to .env.local and fill in. Never commit .env.local.
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Rules: code fails fast with a clear message if a required var is missing
(`Missing NEXT_PUBLIC_SUPABASE_URL — copy .env.example to .env.local`);
V1 runs without any vars (localStorage mode); Vercel vars are set per
environment (Production vs Preview) in the dashboard, never in Git.

## Testing Strategy

Keep it proportional to a 1-hour MVP. Three layers, lightest first:

1. **Type safety (always).** `npx tsc --noEmit` in every phase. Catches most
   V1 bugs (wrong field names, null handling) for free.
2. **Unit tests (V1).** Vitest, only for pure logic: `lib/validation.ts`
   (reject weight 0, reps 0, empty names), set ordering, total-volume math.
   Goal: ~10 fast tests, run with `npm test`. No component tests in V1.
3. **Manual smoke list (V1 deploy gate).** Create workout → reload → history shows
   it → open detail → delete → confirm gone. Run against local + prod URL.
4. **Later (V2+).** RLS tests in SQL (user A cannot select user B's workouts),
   one Playwright happy-path test (new → history → detail), Vercel preview
   checks on every PR.

What you should understand: tests are cheapest at the pure-function level;
DB authorization needs its own tests because UI tests can't see RLS bypasses;
a short manual checklist beats a flaky E2E suite for V1.

## Learning Objectives

1. **Next.js application structure** — App Router (`app/`, `page.tsx`, `layout.tsx`,
   dynamic `[id]` routes), Server vs Client Components, why data fetching lives
   outside components.
2. **TypeScript** — shared types as the contract between UI, validation, local
   storage, and Postgres rows; `strict` mode catching null/undefined before runtime.
3. **PostgreSQL schema design** — UUIDs, foreign keys with `ON DELETE CASCADE`,
   `UNIQUE` + `CHECK` constraints, join tables with ordering, indexes for the
   actual queries (`(user_id, created_at DESC)`).
4. **Supabase** — managed Postgres + auto API + CLI; local (`supabase start`) vs
   linked remote; why you use the anon key from the browser.
5. **Row Level Security** — `ENABLE RLS`, `USING` vs `WITH CHECK`, `auth.uid()`,
   join-based child policies, verifying isolation with two test users.
6. **Authentication architecture** — Google OAuth code exchange, cookie sessions,
   `middleware.ts` refresh, why auth is designed in V1 (types + `user_id`) but
   implemented in V2.
7. **Environment variables** — `NEXT_PUBLIC_*` vs server-only, `.env.local` vs
   `.env.example` vs Vercel dashboard, fail-fast on missing config.
8. **Git/GitHub workflow** — branches, small PRs, secret-check before commit,
   `main` as the deployable branch.
9. **Vercel deployment** — Git-connected deploys, preview URLs, env vars per
   environment, reading build/runtime logs.
10. **Production debugging** — reproduce locally first, then check Vercel logs,
    Supabase logs, and RLS policy evaluation; never `console.log` secrets.
11. **Basic testing** — unit-test pure validation, smoke-test the happy path,
    SQL-test RLS; know what each layer can and cannot catch.
12. **Database migrations** — every schema/RLS change is a timestamped SQL file,
    applied with `supabase db reset` (local) and `supabase db push` (prod);
    dashboards don't count as history.

## Future Ideas

Only after V1–V3 are stable and used:

- Metric/imperial toggle (kg/lb) with stored canonical unit.
- Rest timer, RPE field per set.
- CSV export of history.
- Simple PWA installability for gym use.
- Seed library of common exercises (still per-user rows, just pre-inserted).

Each needs its own migration + validation update + smoke test. No silent schema edits.

## What We Are Explicitly NOT Building

- Fancy UI, animations, theming system, marketing pages.
- Dashboards with charts in V1 (tables first).
- Social features (friends, feeds, sharing).
- AI coaching, recommendations, auto-programming.
- Payments, teams, roles, admin panel.
- Custom backend framework, ORM, GraphQL, monorepo tooling.
- Multi-language, multi-unit complexity in V1 (kg only, English only).

If a request doesn't serve "record weight × reps in under 30 seconds in the gym",
it is out of scope until V3 is done.

## Development Milestones

- [x] **Phase 0 — Planning (V0)** — this README. No code.
- [x] **Phase 1 — Project setup (V1)** — `npx create-next-app` (TS, App Router),
  `.gitignore`, `.env.example`, `lib/types.ts` + repository interface, `npm run dev` renders hello page.
- [x] **Phase 2 — Database (V1 schema, V2 enforcement)** — `supabase init` + `link`,
  migration with 5 tables + constraints + RLS policies + `handle_new_user` trigger,
  `supabase db reset` passes locally.
- [x] **Phase 3 — Backend/data layer (V1)** — `lib/validation.ts` (hand-rolled, zero deps),
  `LocalStorageRepository` implementing the interface, Vitest unit tests (20 passing), `tsc` clean.
- [x] **Phase 4 — Minimal UI (V1)** — `/`, `/new`, `/workouts/[id]`, create/list/detail/delete,
  validation messages, empty states. Route smoke passes (`tsc` + `lint` clean).
- [x] **Phase 5 — Testing (V1 gate)** — 26 unit tests passing + `npm run build` +
  prod-mode (`next start`) route smoke. Accepted cuts documented in chat; no new features.
- [x] **Phase 6 — GitHub (V1)** — repo initialized locally on `main`, first clean commit
  (secret-checked), pushed to `greekyogurt9/gym_logs`. Branch protection: enable in GitHub UI.
- [ ] **Phase 7 — Vercel deployment (V1 live)** — import repo, set env vars (none required for V1
  local mode), deploy `main`, verify prod smoke list, record prod URL.
- [ ] **Phase 8 — Authentication (V2)** — Google provider, callback route, middleware,
  `SupabaseRepository`, RLS verified with two users, sign in/out UI.
- [ ] **Phase 9 — Local/cloud sync (V2)** — migrate button (local → cloud with read-back
  verification), cloud-as-default after migration, backup key retained.

Phases 0–7 = V1 (usable, deployable, no login).
Phases 8–9 = V2 (accounts + personal cloud data).
V3 features (PRs, graphs, repeat-workout) start only after Phase 9 is live and smoke-tested.

---

_Phase 6 complete. Next action: say "proceed to Phase 7" to deploy to Vercel._
