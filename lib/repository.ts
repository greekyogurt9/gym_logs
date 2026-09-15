import type { Workout, WorkoutDetail } from "./types";

/**
 * Storage contract for workouts.
 *
 * The UI depends ONLY on this interface — never on localStorage or Supabase
 * directly. That is the decision that lets V2 (Google login + cloud data)
 * ship without rewriting V1:
 *
 * - Phase 3 implements this with localStorage (`LocalStorageRepository`).
 * - Phase 8 adds a second implementation with Supabase (`SupabaseRepository`).
 * - A "migrate my local workouts" button copies data from one to the other.
 *
 * Rules for implementations:
 * - listWorkouts() returns newest first (by startedAt desc).
 * - getWorkout() returns null when the id does not exist (page shows "not found").
 * - createWorkout() takes unknown on purpose: the repository is the
 *   validation boundary. It validates (throwing ValidationError on bad
 *   input) and assigns UUIDs + createdAt. Callers pass raw form state or
 *   parsed storage JSON directly — no "as" casts at call sites.
 * - deleteWorkout() removes the workout and all its exercises + sets. It must
 *   not throw when the id is already gone (idempotent delete).
 * - getExerciseHistory() returns one point per session containing the
 *   exercise, oldest first. bestTopSetKg is null when the session has no
 *   qualifying set (see QUALIFYING_REPS_MIN) — presentation skips those.
 * - Targets: one active target per exercise. setTarget() upserts (same
 *   exercise twice replaces), deleteTarget() is idempotent like
 *   deleteWorkout().
 */

/** Minimum reps for a set to count toward the progress line and targets. */
export const QUALIFYING_REPS_MIN = 8;

export interface ExerciseHistoryPoint {
  /** ISO timestamp of the session (workout.startedAt). */
  date: string;
  /** Best weightKg among sets with reps >= QUALIFYING_REPS_MIN, else null. */
  bestTopSetKg: number | null;
  totalVolumeKg: number;
}

export interface ExerciseTarget {
  exerciseName: string;
  targetWeightKg: number;
  /** YYYY-MM-DD the lifter aims to hit it by. */
  targetDate: string;
}

export interface WorkoutRepository {
  listWorkouts(): Promise<Workout[]>;
  getWorkout(id: string): Promise<WorkoutDetail | null>;
  createWorkout(input: unknown): Promise<Workout>;
  deleteWorkout(id: string): Promise<void>;
  getExerciseHistory(exerciseName: string): Promise<ExerciseHistoryPoint[]>;
  getTarget(exerciseName: string): Promise<ExerciseTarget | null>;
  setTarget(input: unknown): Promise<ExerciseTarget>;
  deleteTarget(exerciseName: string): Promise<void>;
}
