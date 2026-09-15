import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLocalStorageRepository, type KeyValueStorage } from "./local-storage-repository";
import { migrateLocalToCloud } from "./migrate";
import { createSupabaseRepository } from "./supabase-repository";
import { LOCAL_STORAGE_KEY_V1 } from "./types";

// Live migration against the local stack: real localStorage repository as
// the source, real Supabase repository (signed-in user) as the target.
// Gated on env so plain `npm test` stays hermetic:
//   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_KEY=<publishable|anon> npm test

const URL = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_KEY;

function createMemoryStorage(): KeyValueStorage & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

describe.skipIf(!URL || !KEY)("migrateLocalToCloud (local stack)", () => {
  let client: SupabaseClient;

  beforeAll(async () => {
    client = createClient(URL as string, KEY as string);
    const { error } = await client.auth.signUp({
      email: `phase9-${Date.now()}@test.local`,
      password: "Test1234!",
    });
    expect(error).toBeNull();
  }, 30000);

  it("moves local rows to the cloud with backup and clears the live key", async () => {
    const storage = createMemoryStorage();
    const source = createLocalStorageRepository(storage);
    await source.createWorkout({
      title: "Migrate Me",
      startedAt: "2026-09-12T10:00:00.000Z",
      exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 50, reps: 5 }] }],
    });
    const target = createSupabaseRepository(client);

    const result = await migrateLocalToCloud(source, target, storage);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.migrated).toBe(1);
      expect(result.backupKey).toMatch(/:backup:/);
    }
    const cloud = await target.listWorkouts();
    expect(cloud.map((w) => w.title)).toContain("Migrate Me");
    const detail = await target.getWorkout(cloud.find((w) => w.title === "Migrate Me")!.id);
    expect(detail?.exercises[0].sets[0]).toMatchObject({ weightKg: 50, reps: 5 });
    expect(storage.getItem(LOCAL_STORAGE_KEY_V1)).toBeNull();

    // Cleanup: leave the shared local stack tidy.
    for (const w of cloud) await target.deleteWorkout(w.id);
    expect(await target.listWorkouts()).toEqual([]);
  }, 60000);
});
