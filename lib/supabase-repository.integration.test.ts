import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseRepository } from "./supabase-repository";
import { ValidationError } from "./validation";

// End-to-end through the REAL repository + REAL Postgres (local stack) with
// two genuinely signed-in users. This is the Phase 8 proof that RLS holds
// through the application layer — not just in raw SQL (Phase 2).
//
// Gated on env so plain `npm test` stays hermetic:
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_KEY=<publishable|anon> npm test

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_KEY;

const stamp = Date.now();
const emailA = `phase8-a-${stamp}@test.local`;
const emailB = `phase8-b-${stamp}@test.local`;
const PASSWORD = "Test1234!";

describe.skipIf(!URL || !KEY)("SupabaseRepository (local stack)", () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    clientA = createClient(URL as string, KEY as string);
    clientB = createClient(URL as string, KEY as string);
    // Local stack auto-confirms emails, so sign-up yields a session directly.
    for (const [client, email] of [
      [clientA, emailA],
      [clientB, emailB],
    ] as const) {
      const { error } = await client.auth.signUp({ email, password: PASSWORD });
      expect(error).toBeNull();
    }
  }, 30000);

  it("isolates two users: CRUD works for the owner, invisible to the other", async () => {
    const repoA = createSupabaseRepository(clientA);
    const repoB = createSupabaseRepository(clientB);

    const created = await repoA.createWorkout({
      title: "Cloud Legs",
      startedAt: new Date().toISOString(),
      exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 60, reps: 5 }] }],
    });

    // B sees nothing of A's data…
    expect(await repoB.listWorkouts()).toEqual([]);
    expect(await repoB.getWorkout(created.id)).toBeNull();

    // …and B's delete is a silent no-op that must not touch A's row.
    await repoB.deleteWorkout(created.id);

    const detail = await repoA.getWorkout(created.id);
    expect(detail?.workout.title).toBe("Cloud Legs");
    expect(detail?.exercises).toHaveLength(1);
    expect(detail?.exercises[0].exercise.position).toBe(0);
    expect(detail?.exercises[0].sets[0]).toMatchObject({
      setNumber: 1,
      weightKg: 60,
      reps: 5,
    });

    // Validation still guards the cloud path.
    await expect(repoA.createWorkout({ title: "", exercises: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );

    await repoA.deleteWorkout(created.id);
    expect(await repoA.listWorkouts()).toEqual([]);
  }, 60000);
});
