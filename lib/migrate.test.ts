import { describe, expect, it } from "vitest";
import { createLocalStorageRepository, type KeyValueStorage } from "./local-storage-repository";
import { migrateLocalToCloud } from "./migrate";
import type { Workout, WorkoutDetail } from "./types";
import type { WorkoutRepository } from "./repository";
import { LOCAL_STORAGE_KEY_V1 } from "./types";
import { validateNewWorkout } from "./validation";

function createMemoryStorage(): KeyValueStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function legsInput(startedAt: string, title = "Legs") {
  return {
    title,
    startedAt,
    exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 30, reps: 10 }] }],
  };
}

/**
 * Controllable fake cloud. failTitles makes createWorkout throw;
 * dropSets simulates a backend that loses data (read-back must catch it).
 */
function createFakeCloud(opts: { failTitles?: string[]; dropSets?: boolean } = {}): WorkoutRepository & {
  details: WorkoutDetail[];
} {
  const details: WorkoutDetail[] = [];
  let n = 0;
  return {
    details,
    async listWorkouts(): Promise<Workout[]> {
      return details.map((d) => d.workout).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },
    async getWorkout(id: string): Promise<WorkoutDetail | null> {
      return details.find((d) => d.workout.id === id) ?? null;
    },
    async createWorkout(input: unknown): Promise<Workout> {
      const valid = validateNewWorkout(input);
      if (opts.failTitles?.includes(valid.title)) throw new Error(`boom on ${valid.title}`);
      const workoutId = `cloud-${++n}`;
      const detail: WorkoutDetail = {
        workout: {
          id: workoutId,
          title: valid.title,
          startedAt: valid.startedAt,
          endedAt: valid.endedAt,
          createdAt: new Date().toISOString(),
        },
        exercises: valid.exercises.map((ex, i) => ({
          exercise: { id: `we-${n}-${i}`, workoutId, exerciseName: ex.exerciseName, position: i },
          sets: opts.dropSets
            ? []
            : ex.sets.map((s, j) => ({
                id: `s-${n}-${i}-${j}`,
                workoutExerciseId: `we-${n}-${i}`,
                setNumber: j + 1,
                weightKg: s.weightKg,
                reps: s.reps,
              })),
        })),
      };
      details.push(detail);
      return detail.workout;
    },
    async deleteWorkout(id: string): Promise<void> {
      const i = details.findIndex((d) => d.workout.id === id);
      if (i >= 0) details.splice(i, 1);
    },
    // New interface methods — unused by migration flows, minimal stubs.
    async getExerciseHistory() {
      return [];
    },
    async getTarget() {
      return null;
    },
    async setTarget() {
      throw new Error("not implemented in fake");
    },
    async deleteTarget() {
      // no-op
    },
  };
}

describe("migrateLocalToCloud", () => {
  it("moves everything oldest-first, verifies, backs up and clears", async () => {
    const storage = createMemoryStorage();
    const source = createLocalStorageRepository(storage);
    await source.createWorkout(legsInput("2026-09-15T10:00:00.000Z", "Push"));
    await source.createWorkout(legsInput("2026-09-10T10:00:00.000Z", "Legs"));
    const rawBefore = storage.getItem(LOCAL_STORAGE_KEY_V1);
    const target = createFakeCloud();

    const result = await migrateLocalToCloud(source, target, storage);

    expect(result).toMatchObject({ ok: true, migrated: 2, skipped: 0 });
    expect(target.details.map((d) => d.workout.title)).toEqual(["Legs", "Push"]);
    const moved = target.details[0];
    expect(moved.exercises[0].exercise.exerciseName).toBe("Squat");
    expect(moved.exercises[0].sets[0]).toMatchObject({ weightKg: 30, reps: 10 });
    // Live key cleared, exact pre-migration payload kept under a backup key.
    expect(storage.getItem(LOCAL_STORAGE_KEY_V1)).toBeNull();
    const backupKeys = storage.keys().filter((k) => k.startsWith(`${LOCAL_STORAGE_KEY_V1}:backup:`));
    expect(backupKeys).toHaveLength(1);
    expect(storage.getItem(backupKeys[0])).toBe(rawBefore);
    // Source now reads empty through the same key.
    expect(await source.listWorkouts()).toEqual([]);
  });

  it("is a no-op when local is empty", async () => {
    const storage = createMemoryStorage();
    const result = await migrateLocalToCloud(
      createLocalStorageRepository(storage),
      createFakeCloud(),
      storage,
    );
    expect(result).toEqual({ ok: true, migrated: 0, skipped: 0, backupKey: null });
    expect(storage.keys()).toEqual([]);
  });

  it("skips workouts already in the cloud (retry-safe)", async () => {
    const storage = createMemoryStorage();
    const source = createLocalStorageRepository(storage);
    await source.createWorkout(legsInput("2026-09-15T10:00:00.000Z", "Legs"));
    const target = createFakeCloud();
    await target.createWorkout(legsInput("2026-09-15T10:00:00.000Z", "Legs"));

    const result = await migrateLocalToCloud(source, target, storage);

    expect(result).toMatchObject({ ok: true, migrated: 0, skipped: 1 });
    expect(target.details).toHaveLength(1); // no duplicate
  });

  it("stops on first failure and leaves local data fully intact", async () => {
    const storage = createMemoryStorage();
    const source = createLocalStorageRepository(storage);
    await source.createWorkout(legsInput("2026-09-10T10:00:00.000Z", "Legs"));
    await source.createWorkout(legsInput("2026-09-15T10:00:00.000Z", "Push"));
    const target = createFakeCloud({ failTitles: ["Push"] });

    const result = await migrateLocalToCloud(source, target, storage);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.migrated).toBe(1);
      expect(result.total).toBe(2);
    }
    // Nothing deleted, nothing backed up — retry is safe (Bad still fails,
    // Good is now skipped as already-present).
    expect(storage.getItem(LOCAL_STORAGE_KEY_V1)).not.toBeNull();
    expect(storage.keys().filter((k) => k.includes(":backup:"))).toEqual([]);
    expect((await source.listWorkouts()).map((w) => w.title).sort()).toEqual(["Legs", "Push"]);
  });

  it("treats read-back mismatch as failure and keeps local intact", async () => {
    const storage = createMemoryStorage();
    const source = createLocalStorageRepository(storage);
    await source.createWorkout(legsInput("2026-09-15T10:00:00.000Z", "Legs"));

    const result = await migrateLocalToCloud(source, createFakeCloud({ dropSets: true }), storage);

    expect(result.ok).toBe(false);
    expect(storage.getItem(LOCAL_STORAGE_KEY_V1)).not.toBeNull();
  });
});
