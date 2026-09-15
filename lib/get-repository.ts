import { createLocalStorageRepository } from "./local-storage-repository";
import type { WorkoutRepository } from "./repository";

// The ONE place the UI gets its storage. Pages and components call
// getWorkoutRepository() and program against the WorkoutRepository
// interface — they never import localStorage or Supabase directly.
//
// Phase 8 (accounts + cloud) changes exactly one line here: construct
// SupabaseRepository instead of LocalStorageRepository once the user is
// signed in. No page needs editing.

let instance: WorkoutRepository | null = null;

export function getWorkoutRepository(): WorkoutRepository {
  if (!instance) {
    instance = createLocalStorageRepository();
  }
  return instance;
}
