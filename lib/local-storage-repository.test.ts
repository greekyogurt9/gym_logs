import { beforeEach, describe, expect, it } from "vitest";
import {
  createLocalStorageRepository,
  type KeyValueStorage,
} from "./local-storage-repository";
import { LOCAL_STORAGE_KEY_V1 } from "./types";
import { ValidationError } from "./validation";

// In-memory stand-in for window.localStorage. Same string-only semantics,
// plus visibility into which keys were written (used for the quarantine test).
function createMemoryStorage(): KeyValueStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) as string : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

function legsInput(startedAt: string) {
  return {
    title: "Legs",
    startedAt,
    exercises: [
      {
        exerciseName: "Squat",
        sets: [
          { weightKg: 30, reps: 10 },
          { weightKg: 35, reps: 8 },
        ],
      },
      { exerciseName: "RDL", sets: [{ weightKg: 30, reps: 10 }] },
    ],
  };
}

describe("LocalStorageRepository", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("starts empty", async () => {
    const repo = createLocalStorageRepository(storage);
    expect(await repo.listWorkouts()).toEqual([]);
    expect(await repo.getWorkout("missing")).toBeNull();
  });

  it("creates a workout with positions, set numbers and ids", async () => {
    const repo = createLocalStorageRepository(storage);
    const summary = await repo.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    expect(summary.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(summary.title).toBe("Legs");

    const detail = await repo.getWorkout(summary.id);
    expect(detail).not.toBeNull();
    expect(detail?.exercises).toHaveLength(2);
    expect(detail?.exercises[0].exercise.position).toBe(0);
    expect(detail?.exercises[1].exercise.position).toBe(1);
    expect(detail?.exercises[0].sets.map((s) => s.setNumber)).toEqual([1, 2]);
    const ids = new Set([
      detail?.workout.id,
      ...(detail?.exercises.flatMap((e) => [
        e.exercise.id,
        ...e.sets.map((s) => s.id),
      ]) ?? []),
    ]);
    // workout + 2 exercises + 3 sets = 6 unique ids
    expect(ids.size).toBe(6);
  });

  it("lists newest first", async () => {
    const repo = createLocalStorageRepository(storage);
    const older = await repo.createWorkout(legsInput("2026-09-10T10:00:00.000Z"));
    const newer = await repo.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    const list = await repo.listWorkouts();
    expect(list.map((w) => w.id)).toEqual([newer.id, older.id]);
    // Summaries carry no exercise data.
    expect(list[0]).not.toHaveProperty("exercises");
  });

  it("deletes a workout and is idempotent on missing ids", async () => {
    const repo = createLocalStorageRepository(storage);
    const a = await repo.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    await repo.deleteWorkout("does-not-exist");
    expect(await repo.listWorkouts()).toHaveLength(1);
    await repo.deleteWorkout(a.id);
    expect(await repo.listWorkouts()).toEqual([]);
    expect(await repo.getWorkout(a.id)).toBeNull();
    await repo.deleteWorkout(a.id); // no throw
  });

  it("updates a workout in place, preserving id and createdAt", async () => {
    const repo = createLocalStorageRepository(storage);
    const created = await repo.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    const updated = await repo.updateWorkout(created.id, {
      title: "Push",
      startedAt: created.startedAt,
      exercises: [{ exerciseName: "Bench Press", sets: [{ weightKg: 60, reps: 8 }] }],
    });
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe("Push");
    expect(updated.createdAt).toBe(created.createdAt);
    const detail = await repo.getWorkout(created.id);
    expect(detail?.exercises).toHaveLength(1);
    expect(detail?.exercises[0].exercise.exerciseName).toBe("Bench Press");
    expect(await repo.listWorkouts()).toHaveLength(1);
  });

  it("update throws on missing id and rejects invalid input", async () => {
    const repo = createLocalStorageRepository(storage);
    await expect(
      repo.updateWorkout("missing", legsInput("2026-09-15T10:00:00.000Z")),
    ).rejects.toThrow("Workout not found.");
    const created = await repo.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    await expect(repo.updateWorkout(created.id, { title: "", exercises: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    // Failed update leaves the original intact.
    expect((await repo.getWorkout(created.id))?.workout.title).toBe("Legs");
  });

  it("rejects invalid input and persists nothing", async () => {
    const repo = createLocalStorageRepository(storage);
    await expect(repo.createWorkout({ title: "", exercises: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(await repo.listWorkouts()).toEqual([]);
    expect(storage.getItem(LOCAL_STORAGE_KEY_V1)).toBeNull();
  });

  it("quarantines corrupt JSON instead of crashing or overwriting", async () => {
    storage.setItem(LOCAL_STORAGE_KEY_V1, "{not json");
    const repo = createLocalStorageRepository(storage);
    expect(await repo.listWorkouts()).toEqual([]);
    const backupKeys = storage.keys().filter((k) => k.startsWith(`${LOCAL_STORAGE_KEY_V1}:corrupt:`));
    expect(backupKeys).toHaveLength(1);
    expect(storage.getItem(backupKeys[0])).toBe("{not json");
  });

  it("quarantines well-formed JSON with the wrong shape", async () => {
    storage.setItem(LOCAL_STORAGE_KEY_V1, JSON.stringify({ oops: true }));
    const repo = createLocalStorageRepository(storage);
    expect(await repo.listWorkouts()).toEqual([]);
  });

  it("shares data across instances on the same storage", async () => {
    const writer = createLocalStorageRepository(storage);
    const created = await writer.createWorkout(legsInput("2026-09-15T10:00:00.000Z"));
    const reader = createLocalStorageRepository(storage);
    expect(await reader.getWorkout(created.id)).not.toBeNull();
  });
});
