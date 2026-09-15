# UI Refresh Plan — minimalistic, gym-proven

Status: **proposed, not approved, not built.** No code changes accompany this
document. When a slice is approved, implementation follows the phasing in
§7 and §10, and this header is updated.

Date: September 2026 (extended: progress charts + per-exercise targets).
Reference apps: Hevy (4.9★, 15M+ users), Strong.
UX sources: thumb-zone research (~70% one-handed mobile use), fitness-UX
progressive-disclosure practice.

## 1. Industry standard, distilled

The best trackers converge on the same patterns; everything else is decoration:

1. **Bottom tab bar, 2–4 tabs.** Thumb-reachable primary nav; top bars hold
   only the screen title.
2. **Log-as-you-go session screen.** Tap + New workout, add an exercise, log
   each set *the moment you finish it* with a **checkmark per set**. This is
   Hevy's core interaction and our single biggest gap.
3. **Previous performance inline.** Every set row ghosts last session's
   `kg × reps`; tapping it prefills. Answers "am I lifting more?" in place.
4. **"Repeat last workout" shortcut.** One tap clones a past session into a
   live draft. Cheap for us (we store full details), high value.
5. **Quiet rest timer.** Tapping ✓ starts an unobtrusive countdown chip
   (default 90s). No modal, no sound in v1.
6. **History as rich cards.** Date + title + total volume + exercise count
   (+ PR dot in Hevy's case). Ours shows title + date only.
7. **Dark-first, high-contrast, giant touch targets.** Gym lighting + chalky
   fingers + one hand on the bar: ≥48px targets, big numerals.
8. **Friction audit.** Hevy's mantra: start a workout in one tap. Our flow
   (History → New → pre-declare all sets → Save) has ~3x the taps and loses
   everything on accidental navigation (no draft autosave).

Deliberately excluded: social feeds, videos, chart dashboards, plate
calculators, supersets, RPE, wearables. (Hevy's founder story: the MVP nearly
died of bloat — "3 pillars, everything else peripheral.")

## 2. Gap list (our UI today)

| # | Gap | Severity |
|---|---|---|
| 1 | Top header nav — unreachable one-handed | High |
| 2 | Declare-everything-then-Save form (no per-set ✓, no live logging) | High |
| 3 | No previous-values ghost/prefill | High |
| 4 | No Repeat-workout | High value, trivial cost |
| 5 | History rows carry no volume/exercise info | Medium |
| 6 | No rest timer | Medium |
| 7 | No draft autosave (back-button = data loss) | Medium |
| 8 | Dense inputs, desktop-column layout, system-following theme | Medium |
| 9 | Detail page is a dead-end receipt (no Repeat, no volume total) | Low |

## 3. Information architecture (URLs unchanged)

```text
┌─────────────────────────────────┐
│  Screen content                 │
│                                 │
│  ┌───────────────────────────┐  │
│  │ +  Log   │  History  │ 👤 │  │  ← bottom tab bar (48px+, thumb zone)
│  └───────────────────────────┘  │
└─────────────────────────────────┘

Tabs (2½, not 5):
  Log      → live session screen (new: /workout/active, replaces /new)
  History  → / (upgraded cards) + /workouts/[id] (receipt + Repeat + volume)
  (avatar) → tiny account sheet: email, sign out, migrate status, Privacy link
```

No URL breakage: `/new` redirects to the session screen; old links keep working.

## 4. Core screen (80% of the value)

Active session — one exercise card per exercise, set rows completed live:

```text
Legs · 12:04 elapsed                    [Finish]
─────────────────────────────────────────
SQUAT                              ⋯ menu
fr: 35 × 8   ← faint "last time" hint
┌─────────────────────────────────────┐
│ 1 │ [ 35  ] kg │ [ 8 ] reps │ [ ✓ ] │  ← done: dimmed, green edge
│ 2 │ [ 35  ] kg │ [ 8 ] reps │ [ ✓ ] │
│ 3 │ [ 37.5] kg │ [ 8 ] reps │ [ ○ ] │  ← active row: full contrast
└─────────────────────────────────────┘
[ + Add set ]        (48px, full-width, quiet)
─────────────────────────────────────────
RDL …
─────────────────────────────────────────
[ + Add exercise ]      [ Cancel workout ]
```

Rules: tapping a ghost value prefills the row; ✓ stamps the set done +
starts the rest chip (`⏳ 1:30`, tappable to dismiss/adjust); sets save to the
repository **as completed** (autosave — navigation-safe); Finish validates
leftovers (empty rows discarded silently, half-filled rows warn once).
Numeric keyboards only (`inputMode` already in place).

History card: `Legs · Sep 12` / `3 exercises · 9 sets · 1,240 kg` / chevron.
Volume (Σ kg×reps) computed from already-fetched data.

Detail: same receipt + volume header + **Repeat** (clones to live session)
and Delete.

## 5. Design tokens (one small file, no framework)

```text
--bg #0a0a0a (dark-first; light theme dropped for v1 — gym readability + less code)
--surface #161616   --border #2a2a2a
--text #f2f2f2      --muted #9a9a9a
--accent #4ade80 (complete/save)   --danger #f87171
--tap 48px min-height on every control; --radius 10px; spacing 4/8/16/24
Type: system stack, 16px min (no iOS zoom), numerals tabular-nums, 20px+ for set values
```

Dark-first, not dark-only forever — light theme is a single token swap later;
supporting both today doubles QA for zero user value.

## 6. Component inventory (new code lives in `components/`)

`TabBar`, `ExerciseCard`, `SetRow` (ghost + inputs + ✓), `RestChip`,
`HistoryCard`, `AccountSheet`, `EmptyState`. Pages become thin: fetch via
repository → render components. Validation, repository, RLS, and test
strategy all untouched.

## 7. Phased build (each shippable, each ≤ one session)

- **UI-A — Shell + History.** Tokens, TabBar, account sheet (moves AuthButton
  + Privacy link out of the header), history cards with volume, detail +
  volume + Repeat. Acceptance: old flows work, phone thumb-test passes.
- **UI-B — Live session.** Replaces `/new`: inline set rows, ✓ flow, ghost
  prefill, autosave-as-you-go, Finish/Cancel. Acceptance: log a 3-exercise
  workout one-handed in under 2 minutes.
- **UI-C — Rest timer + hardening.** Countdown chip (90s default, ±15s
  adjust), draft survives reload mid-session, empty/half-filled-row policy,
  full test pass + prod smoke.

Explicitly **not** in any slice: charts, PRs (that's V3), kg/lb toggle,
exercise library/search, edit-past-workout, sounds/haptics, custom numpad
(native keyboards win).

## 8. Risks & mitigations

- **Autosave vs explicit Save:** completed ✓ = saved immediately;
  uncompleted rows are draft-only. No silent loss, no surprise writes.
- **`/new` back-compat:** keep as redirect, not duplicate. One screen, one
  code path.
- **Scope creep into V3:** Repeat + ghost-values *look* like V3 progress
  tracking but they're logging accelerators, not analytics — in scope by the
  "30 seconds in the gym" rule. Charts stay parked.

## 9. Decision log

- Plan presented in chat; user chose: save plan to `UI.md` (this file).
- User added: visual "am I lifting higher" charts + per-exercise targets
  (e.g. 120 kg barbell squat by Dec '26, with a dot showing how far away).
  Planned below as §10 (V3-A). Awaiting: approval of scope/phasing, and which
  slice (if any) to build.
- Metric debate resolved: Epley 1RM and total volume were offered; user kept
  **best top-set weight per session** — most literal reading of "lifting
  higher," no formula to explain. Raw sets stay visible in the table below.
- Refined: only sets of **8+ reps** qualify for the line and for hitting a
  target ("120 kg" = 120 for 8). Heavy low-rep sets can't hijack the trend;
  sessions without a qualifying set are skipped, never zero-filled.

## 10. V3-A — Progress charts + targets ("am I lifting higher?")

Goal: one screen per exercise that answers the lifter's core question at a
glance, plus an optional target with a visible gap. Still no dashboards,
no analytics section — this is a *logging accelerator with a mirror*.

### 10.1 Metric (one, not three)

Headline metric: **best top-set weight per session among sets of 8+ reps**
(max `weightKg` where `reps >= 8`). The rep floor is the point: heavy
singles, doubles, and triples don't move the line — only working-range
strength counts, so the chart answers "lifting higher *for reps*?" Total
volume per session is computed alongside and shown as a number, not a second
chart — one line keeps the screen honest and the code small. (A volume
toggle is a documented follow-up, not v1.)

Sessions with no 8+ set are skipped (no dot, line bridges nothing — gaps
are honest). Fewer than 2 qualifying sessions: "Log sets of 8+ to draw the
line." Targets inherit the rule: "120 kg" means 120 *for 8*.

### 10.2 Chart spec (hand-rolled SVG, zero dependencies)

No chart library: one line-chart with dots + target overlay is ~100 lines of
SVG and avoids a dependency with more API surface than our whole app. New
pure module `lib/progress.ts` holds the math (unit-tested); new presentational
`components/progress-chart.tsx` renders it:

- X = sessions in chronological order (evenly spaced by session index, real
  dates in labels/tooltips — simpler than time-scaling, no distortion lie).
  Sessions without a qualifying (8+) set are omitted, never zero-filled.
- Y = qualifying best top-set kg, auto-scaled with padding; 3–4 faint gridlines, min/max
  labels only. `viewBox="0 0 600 260"`, width 100% (responsive free).
- Dots on every session; the latest dot accented.
- Target overlay (when set): dashed horizontal line at target weight
  (y-scale extends to include it), a marker dot positioned by target date,
  label `120 kg · Dec ’26`, and a delta chip: **`8 kg to go`** (or `Hit it 🎉`
  when current best ≥ target, or `Overdue — adjust?` past the date).
- Fewer than 2 sessions: no line yet — show the dots plus
  "Log once more to see your line."
- Table fallback under the chart (date, best, volume): readable, testable,
  and the honest accessible version of the same data.
- Dark-first colors from §5 tokens; tabular numerals.

### 10.3 Target model (one active target per exercise)

```ts
type Target = { exerciseName: string; targetWeightKg: number; targetDate: string /* YYYY-MM-DD */ };
```

- New `public.targets` table via migration (the project's *second*
  migration — same workflow as Phase 2): `id`, `user_id → auth.users`
  cascade, `exercise_id → exercises` cascade, `target_weight_kg numeric(6,1)`
  with the standard weight CHECK, `target_date date`, `UNIQUE(user_id,
  exercise_id)`, RLS `auth.uid() = user_id` on all four operations (direct
  ownership, like `exercises`).
- Local twin: new localStorage key, same shape, same interface.
- Interface additions (both repos implement):
  `getExerciseHistory(name) → { date, bestWeightKg, totalVolumeKg }[]`,
  `getTarget(name)`, `setTarget(...)`. Weight/date rules reuse
  `lib/validation.ts` limits; past dates allowed (shows the overdue state).
- UI: target card on the exercise screen — shows target + gap, or a
  "Set target" button opening weight + date inputs (prefilled on edit),
  plus a quiet delete. No target history/archive in v1.

### 10.4 Screen + entry points

New route `/exercises/[name]`: chart → stats row (current best · sessions
logged · last session) → target card → session table. Entry: exercise names
become tappable links on the detail page (needs UI-A's detail upgrade —
**dependency: build UI-A first**). No new tab; progress stays one tap from
data you already look at.

### 10.5 Build order inside V3-A

1. Data: interface additions → both repositories → migration + RLS →
   unit tests (aggregation math, target validation) + live integration test
   (two-user pattern from Phase 8).
2. Presentation: `lib/progress.ts` chart math (tested) → `progress-chart.tsx`
   → exercise screen → target card/form → tappable entry points.
3. Gate: suite + `tsc` + `lint` + `build` + prod smoke (chart renders with
   real cloud data on the phone).

Out: estimated-1RM line, volume toggle, PR badges, charts anywhere else,
notifications/reminders about targets.
