-- My Gym Buddy — per-side weight toggle (third migration).
--
-- Adds workout_exercises.weight_mode so a logged kg can mean either:
--   * 'total'    — barbell / machine / cable, both hands share one load
--   * 'per_side' — dumbbell / unilateral, the kg is one side (one hand),
--                  e.g. two 15 kg dumbbells are logged as 15 kg per side.
--
-- Old rows default to 'total', so existing logs keep working with no
-- backfill. Volume doubles for per_side (both limbs move), while the
-- progress best stays the entered per-side number.

alter table public.workout_exercises
  add column weight_mode text not null default 'total'
  check (weight_mode in ('total', 'per_side'));
