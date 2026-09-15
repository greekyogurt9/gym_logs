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
 */
export interface WorkoutRepository {
  listWorkouts(): Promise<Workout[]>;
  getWorkout(id: string): Promise<WorkoutDetail | null>;
  createWorkout(input: unknown): Promise<Workout>;
  deleteWorkout(id: string): Promise<void>;
}
