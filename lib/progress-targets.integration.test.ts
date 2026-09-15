import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRepository } from "./supabase-repository";

// Live history + targets against the local stack with a signed-in user.
// Also proves the targets-table migration + RLS through the app layer.
// Gated on env so plain `npm test` stays hermetic:
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_KEY=<publishable|anon> npm test

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_KEY;

describe.skipIf(!URL || !KEY)("history + targets (local stack)", () => {
  let client: SupabaseClient;

  beforeAll(async () => {
    client = createClient(URL as string, KEY as string);
    const { error } = await client.auth.signUp({
      email: `phaseV3-${Date.now()}@test.local`,
      password: "Test1234!",
    });
    expect(error).toBeNull();
  }, 30000);

  it("isolates history and targets per user", async () => {
    const repo = createSupabaseRepository(client);
    await repo.createWorkout({
      title: "Legs",
      startedAt: "2026-09-10T10:00:00.000Z",
      exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 60, reps: 10 }] }],
    });

    const history = await repo.getExerciseHistory("Squat");
    // Postgres normalizes ISO spellings ("+00:00" vs ".000Z") — compare instants.
    expect(history).toHaveLength(1);
    expect(Date.parse(history[0].date)).toBe(Date.parse("2026-09-10T10:00:00.000Z"));
    expect(history[0].bestTopSetKg).toBe(60);
    expect(history[0].totalVolumeKg).toBe(600);
    expect(await repo.getExerciseHistory("Bench")).toEqual([]);

    expect(await repo.getTarget("Squat")).toBeNull();
    await repo.setTarget({ exerciseName: "Squat", targetWeightKg: 120, targetDate: "2026-12-31" });
    expect(await repo.getTarget("Squat")).toEqual({
      exerciseName: "Squat",
      targetWeightKg: 120,
      targetDate: "2026-12-31",
    });
    await repo.deleteTarget("Squat");
    expect(await repo.getTarget("Squat")).toBeNull();

    // Cleanup: leave the shared local stack tidy.
    for (const w of await repo.listWorkouts()) await repo.deleteWorkout(w.id);
  }, 60000);
});
