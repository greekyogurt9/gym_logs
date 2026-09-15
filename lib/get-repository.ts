import { createLocalStorageRepository } from "./local-storage-repository";
import type { WorkoutRepository } from "./repository";
import { createSupabaseRepository } from "./supabase-repository";
import { createClient } from "./supabase/client";
import { isCloudConfigured } from "./supabase/env";

export { isCloudConfigured };

// The ONE place the UI gets its storage. Pages and components call
// getWorkoutRepository() and program against the WorkoutRepository
// interface — they never import localStorage or Supabase directly.
//
// Routing rule (the V1→V2 bridge, decided in Phase 0):
//   cloud configured + signed in  -> SupabaseRepository (personal cloud data)
//   otherwise                     -> LocalStorageRepository (anonymous local data)
//
// Anonymous users keep the exact V1 experience even with cloud configured;
// signing in switches that device to cloud rows. Moving local rows into the
// account is the explicit migrate step in Phase 9 — never automatic.
//
// The factory is async because checking the session needs the Auth server.
// A broken session falls back to local: losing login must never brick the
// logger or hide the user's local workouts.

let localInstance: WorkoutRepository | null = null;

export async function getWorkoutRepository(): Promise<WorkoutRepository> {
  if (isCloudConfigured()) {
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        return createSupabaseRepository(supabase);
      }
    } catch {
      // Fall through to local (see comment above).
    }
  }
  if (!localInstance) {
    localInstance = createLocalStorageRepository();
  }
  return localInstance;
}
