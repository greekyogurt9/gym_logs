import { describe, expect, it } from "vitest";
import { createLocalStorageRepository, type KeyValueStorage } from "./local-storage-repository";
import { LOCAL_TARGETS_KEY_V1 } from "./local-storage-repository";
import { ValidationError, validateTarget } from "./validation";

function createMemoryStorage(): KeyValueStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

describe("validateTarget", () => {
  it("accepts a valid target and trims the name", () => {
    expect(
      validateTarget({ exerciseName: "  Squat ", targetWeightKg: 120, targetDate: "2026-12-31" }),
    ).toEqual({ exerciseName: "Squat", targetWeightKg: 120, targetDate: "2026-12-31" });
  });

  it("rejects bad names, weights, and dates with field paths", () => {
    for (const [input, path] of [
      [{ exerciseName: "", targetWeightKg: 120, targetDate: "2026-12-31" }, "exerciseName"],
      [{ exerciseName: "Squat", targetWeightKg: 0, targetDate: "2026-12-31" }, "targetWeightKg"],
      [{ exerciseName: "Squat", targetWeightKg: 30.55, targetDate: "2026-12-31" }, "targetWeightKg"],
      [{ exerciseName: "Squat", targetWeightKg: 120, targetDate: "Dec 2026" }, "targetDate"],
      [{ exerciseName: "Squat", targetWeightKg: 120, targetDate: "2026-13-45" }, "targetDate"],
    ] as const) {
      try {
        validateTarget(input);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).issues.map((i) => i.path)).toContain(path);
        continue;
      }
      throw new Error(`Expected ValidationError for ${path}`);
    }
  });
});

describe("local history + targets", () => {
  it("builds per-session history with the 8+ rule", async () => {
    const repo = createLocalStorageRepository(createMemoryStorage());
    await repo.createWorkout({
      title: "Legs",
      startedAt: "2026-09-10T10:00:00.000Z",
      exercises: [
        { exerciseName: "Squat", sets: [{ weightKg: 100, reps: 3 }, { weightKg: 60, reps: 10 }] },
        { exerciseName: "RDL", sets: [{ weightKg: 40, reps: 12 }] },
      ],
    });
    await repo.createWorkout({
      title: "Legs 2",
      startedAt: "2026-09-15T10:00:00.000Z",
      exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 90, reps: 5 }] }],
    });

    // Heavy triple ignored (reps < 8); 60x10 qualifies.
    expect(await repo.getExerciseHistory("Squat")).toEqual([
      { date: "2026-09-10T10:00:00.000Z", bestTopSetKg: 60, totalVolumeKg: 900 },
      { date: "2026-09-15T10:00:00.000Z", bestTopSetKg: null, totalVolumeKg: 450 },
    ]);
    expect(await repo.getExerciseHistory("Bench")).toEqual([]);
    // Name matching is exact (trimmed).
    expect(await repo.getExerciseHistory("  Squat ")).toHaveLength(2);
  });

  it("upserts one target per exercise and deletes idempotently", async () => {
    const storage = createMemoryStorage();
    const repo = createLocalStorageRepository(storage);

    expect(await repo.getTarget("Squat")).toBeNull();
    await repo.setTarget({ exerciseName: "Squat", targetWeightKg: 100, targetDate: "2026-12-31" });
    await repo.setTarget({ exerciseName: "Squat", targetWeightKg: 120, targetDate: "2026-12-31" });
    expect(await repo.getTarget("Squat")).toEqual({
      exerciseName: "Squat",
      targetWeightKg: 120,
      targetDate: "2026-12-31",
    });
    // Survives a round-trip through JSON with its own key.
    expect(storage.getItem(LOCAL_TARGETS_KEY_V1)).toContain("Squat");

    await repo.deleteTarget("Squat");
    expect(await repo.getTarget("Squat")).toBeNull();
    await repo.deleteTarget("Squat"); // no throw
    await expect(
      repo.setTarget({ exerciseName: "Squat", targetWeightKg: 0, targetDate: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
