import type {
  Workout,
  WorkoutDetail,
  WorkoutExerciseDetail,
} from "./types";
import { LOCAL_STORAGE_KEY_V1, normalizeWeightMode, weightModeMultiplier } from "./types";
import type {
  ExerciseHistoryPoint,
  ExerciseTarget,
  WorkoutRepository,
} from "./repository";
import { QUALIFYING_REPS_MIN } from "./repository";
import { validateNewWorkout, validateTarget } from "./validation";

/** Local targets live beside workouts under their own key (same backup rules apply). */
export const LOCAL_TARGETS_KEY_V1 = "my-gym-buddy:targets:v1";

// V1 storage: browser localStorage behind the WorkoutRepository interface.
//
// Two decisions make this file do more teaching than its size suggests:
//
// 1. Dependency injection. The repository takes a minimal KeyValueStorage
//    instead of touching window.localStorage directly. That keeps it usable
//    during server-side rendering (no window on the server — the error says
//    so) and makes unit tests pass a fake in-memory store. Phase 8 adds
//    SupabaseRepository next to this file; the UI never notices the swap.
//
// 2. Never silently destroy user data. Stored JSON is shape-checked on every
//    load (localStorage belongs to the user, not to us — it can be edited,
//    truncated, or left behind by an older app version). Corrupt data is
//    quarantined under "<key>:corrupt:<timestamp>" and loads as empty,
//    instead of crashing the history page or being overwritten on next save.

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Browser localStorage as a KeyValueStorage. Exported (rather than buried
 * inside the repository) so the Phase 9 migration can back up and clear the
 * same store — pages still never touch window.localStorage directly.
 */
export function browserStorage(): KeyValueStorage {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  throw new Error(
    "localStorage is not available (server-side render?). Pass a storage explicitly.",
  );
}

function resolveStorage(explicit?: KeyValueStorage): KeyValueStorage {
  return explicit ?? browserStorage();
}

function newId(): string {
  // Available in all modern browsers and Node 19+. Deliberately no
  // Math.random fallback: weak IDs could collide during the V2 cloud
  // migration, and a loud crash beats silent duplicates.
  return crypto.randomUUID();
}

function isWorkoutDetail(v: unknown): v is WorkoutDetail {
  if (typeof v !== "object" || v === null) return false;
  const d = v as Record<string, unknown>;
  if (typeof d["workout"] !== "object" || d["workout"] === null) return false;
  const w = d["workout"] as Record<string, unknown>;
  if (typeof w["id"] !== "string" || typeof w["title"] !== "string") return false;
  if (typeof w["startedAt"] !== "string" || typeof w["createdAt"] !== "string") return false;
  if (!Array.isArray(d["exercises"])) return false;
  return (d["exercises"] as unknown[]).every((e) => {
    if (typeof e !== "object" || e === null) return false;
    const entry = (e as Record<string, unknown>)["exercise"] as Record<string, unknown> | undefined;
    const sets = (e as Record<string, unknown>)["sets"];
    return (
      !!entry &&
      typeof entry["id"] === "string" &&
      typeof entry["workoutId"] === "string" &&
      Array.isArray(sets)
    );
  });
}

function toSummary(detail: WorkoutDetail): Workout {
  const { workout } = detail;
  return {
    id: workout.id,
    title: workout.title,
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    createdAt: workout.createdAt,
  };
}

function byNewestFirst(a: Workout, b: Workout): number {
  if (a.startedAt !== b.startedAt) return b.startedAt.localeCompare(a.startedAt);
  return b.createdAt.localeCompare(a.createdAt);
}

export function createLocalStorageRepository(
  explicitStorage?: KeyValueStorage,
): WorkoutRepository {
  const storage = () => resolveStorage(explicitStorage);
  const KEY = LOCAL_STORAGE_KEY_V1;

  function loadAll(): WorkoutDetail[] {
    const raw = storage().getItem(KEY);
    if (raw === null) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    if (Array.isArray(parsed) && parsed.every(isWorkoutDetail)) {
      // Backward compat: rows saved before the per-side toggle lack
      // weightMode — read them as "total" so old logs keep working.
      for (const d of parsed as WorkoutDetail[]) {
        for (const e of d.exercises) {
          e.exercise.weightMode = normalizeWeightMode(e.exercise.weightMode);
        }
      }
      return parsed;
    }
    // Quarantine, don't delete: the next save would otherwise overwrite
    // evidence the user might want back.
    try {
      storage().setItem(`${KEY}:corrupt:${Date.now()}`, raw);
    } catch {
      // Storage full/blocked — still better to show empty than to crash.
    }
    return [];
  }

  function saveAll(details: WorkoutDetail[]): void {
    storage().setItem(KEY, JSON.stringify(details));
  }

  return {
    async listWorkouts(): Promise<Workout[]> {
      return loadAll().map(toSummary).sort(byNewestFirst);
    },

    async getWorkout(id: string): Promise<WorkoutDetail | null> {
      // Fresh parse on every call, so callers can never mutate stored state
      // through a returned reference.
      return loadAll().find((d) => d.workout.id === id) ?? null;
    },

    async createWorkout(input: unknown): Promise<Workout> {
      const valid = validateNewWorkout(input);
      const now = new Date().toISOString();
      const workoutId = newId();
      const exercises: WorkoutExerciseDetail[] = valid.exercises.map((ex, i) => {
        const workoutExerciseId = newId();
        return {
          exercise: {
            id: workoutExerciseId,
            workoutId,
            exerciseName: ex.exerciseName,
            position: i,
            weightMode: normalizeWeightMode(ex.weightMode),
          },
          sets: ex.sets.map((s, j) => ({
            id: newId(),
            workoutExerciseId,
            setNumber: j + 1,
            weightKg: s.weightKg,
            reps: s.reps,
          })),
        };
      });
      const detail: WorkoutDetail = {
        workout: {
          id: workoutId,
          title: valid.title,
          startedAt: valid.startedAt,
          endedAt: valid.endedAt,
          createdAt: now,
        },
        exercises,
      };
      const all = loadAll();
      all.push(detail);
      saveAll(all);
      return toSummary(detail);
    },

    async updateWorkout(id: string, input: unknown): Promise<Workout> {
      const valid = validateNewWorkout(input);
      const all = loadAll();
      const idx = all.findIndex((d) => d.workout.id === id);
      if (idx === -1) throw new Error("Workout not found.");
      const prev = all[idx];
      // New child ids keep the update free of id-reuse bugs; the workout
      // id + createdAt are stable so history/calendar links don't break.
      const exercises: WorkoutExerciseDetail[] = valid.exercises.map((ex, i) => {
        const workoutExerciseId = newId();
        return {
          exercise: {
            id: workoutExerciseId,
            workoutId: id,
            exerciseName: ex.exerciseName,
            position: i,
            weightMode: normalizeWeightMode(ex.weightMode),
          },
          sets: ex.sets.map((s, j) => ({
            id: newId(),
            workoutExerciseId,
            setNumber: j + 1,
            weightKg: s.weightKg,
            reps: s.reps,
          })),
        };
      });
      const detail: WorkoutDetail = {
        workout: {
          id,
          title: valid.title,
          startedAt: valid.startedAt,
          endedAt: valid.endedAt,
          createdAt: prev.workout.createdAt,
        },
        exercises,
      };
      all[idx] = detail;
      saveAll(all);
      return toSummary(detail);
    },

    async deleteWorkout(id: string): Promise<void> {
      const all = loadAll();
      const kept = all.filter((d) => d.workout.id !== id);
      // Idempotent: deleting a missing id is a no-op and skips the write,
      // so we never clobber storage for nothing.
      if (kept.length !== all.length) saveAll(kept);
    },

    async getExerciseHistory(exerciseName: string): Promise<ExerciseHistoryPoint[]> {
      const name = exerciseName.trim();
      return loadAll()
        .flatMap((d) =>
          d.exercises
            .filter((e) => e.exercise.exerciseName === name)
            .map((e) => {
              const mult = weightModeMultiplier(
                normalizeWeightMode(e.exercise.weightMode),
              );
              const qualifying = e.sets.filter((s) => s.reps >= QUALIFYING_REPS_MIN);
              return {
                date: d.workout.startedAt,
                bestTopSetKg:
                  qualifying.length > 0 ? Math.max(...qualifying.map((s) => s.weightKg)) : null,
                totalVolumeKg: e.sets.reduce((n, s) => n + s.weightKg * s.reps * mult, 0),
              };
            }),
        )
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getTarget(exerciseName: string): Promise<ExerciseTarget | null> {
      return loadTargets(storage()).find((t) => t.exerciseName === exerciseName.trim()) ?? null;
    },

    async setTarget(input: unknown): Promise<ExerciseTarget> {
      const valid = validateTarget(input);
      const all = loadTargets(storage()).filter((t) => t.exerciseName !== valid.exerciseName);
      const target: ExerciseTarget = { ...valid };
      all.push(target);
      saveTargets(storage(), all);
      return target;
    },

    async deleteTarget(exerciseName: string): Promise<void> {
      const all = loadTargets(storage());
      const kept = all.filter((t) => t.exerciseName !== exerciseName.trim());
      if (kept.length !== all.length) saveTargets(storage(), kept);
    },
  };
}

function loadTargets(storage: KeyValueStorage): ExerciseTarget[] {
  const raw = storage.getItem(LOCAL_TARGETS_KEY_V1);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      Array.isArray(parsed) &&
      parsed.every(
        (t) =>
          typeof t === "object" &&
          t !== null &&
          typeof (t as Record<string, unknown>)["exerciseName"] === "string" &&
          typeof (t as Record<string, unknown>)["targetWeightKg"] === "number" &&
          typeof (t as Record<string, unknown>)["targetDate"] === "string",
      )
    ) {
      return parsed as ExerciseTarget[];
    }
  } catch {
    // Corrupt: quarantine like workouts rather than crash or overwrite.
  }
  try {
    storage.setItem(`${LOCAL_TARGETS_KEY_V1}:corrupt:${Date.now()}`, raw);
  } catch {
    // Storage blocked — show empty rather than crash.
  }
  return [];
}

function saveTargets(storage: KeyValueStorage, targets: ExerciseTarget[]): void {
  storage.setItem(LOCAL_TARGETS_KEY_V1, JSON.stringify(targets));
}
