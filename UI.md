# UI Refresh Plan — minimalistic, gym-proven

Status: **proposed, not approved, not built.** No code changes accompany this
document. When a slice is approved, implementation follows the phasing in
§7 and this header is updated.

Date: September 2026. Reference apps: Hevy (4.9★, 15M+ users), Strong.
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
- Awaiting: approval of scope/phasing, and which slice (if any) to build.
