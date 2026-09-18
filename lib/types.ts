// Shared domain types for My Gym Buddy.
//
// These types are the contract between the UI, the validation layer,
// local storage (V1) and Postgres rows (V2). Both storage backends use
// the same shapes, which is why V2 (accounts + cloud) does not require
// rewriting V1.
//
// Conventions:
// - IDs are UUID strings in both stores, so rows never collide on migrate.
// - Timestamps are ISO 8601 strings (e.g. new Date().toISOString()).
// - Weight is kilograms, one decimal max. V1 is kg-only, English-only.

export interface Workout {
  id: string;
  title: string;
  startedAt: string;
  endedAt?: string | null;
  createdAt: string;
}

export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseName: string;
  /** Zero-based order within the workout. */
  position: number;
  /**
   * How the logged kg should be read.
   * - "total": barbell / machine / cable — both hands share one load.
   * - "per_side": dumbbell / unilateral — the kg is one side (one hand),
   *   e.g. two 15 kg dumbbells are logged as 15 kg per side.
   * Optional on reads so pre-toggle rows (no column yet) load as "total".
   */
  weightMode?: WeightMode;
}

export type WeightMode = "total" | "per_side";

export const WEIGHT_MODES: WeightMode[] = ["total", "per_side"];

export function normalizeWeightMode(v: unknown): WeightMode {
  return v === "per_side" ? "per_side" : "total";
}

/** Volume multiplier: per-side work moves both limbs, so it counts twice. */
export function weightModeMultiplier(mode: WeightMode | undefined): number {
  return mode === "per_side" ? 2 : 1;
}

export interface SetEntry {
  id: string;
  workoutExerciseId: string;
  /** 1-based set number within the exercise. */
  setNumber: number;
  weightKg: number;
  reps: number;
}

export interface WorkoutExerciseDetail {
  exercise: WorkoutExercise;
  sets: SetEntry[];
}

export interface WorkoutDetail {
  workout: Workout;
  exercises: WorkoutExerciseDetail[];
}

// --- Inputs (no IDs yet; the repository assigns them) ---

export interface NewSetInput {
  weightKg: number;
  reps: number;
}

export interface NewExerciseInput {
  exerciseName: string;
  /** Defaults to "total" when omitted (old clients / old rows). */
  weightMode?: WeightMode;
  sets: NewSetInput[];
}

export interface NewWorkoutInput {
  title: string;
  startedAt: string;
  endedAt?: string | null;
  exercises: NewExerciseInput[];
}

/** localStorage key for V1. Kept as a backup key after V2 cloud migration. */
export const LOCAL_STORAGE_KEY_V1 = "my-gym-buddy:workouts:v1";
