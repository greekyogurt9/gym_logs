import type { WorkoutRepository } from "./repository";
import { browserStorage, type KeyValueStorage } from "./local-storage-repository";
import { LOCAL_STORAGE_KEY_V1, normalizeWeightMode } from "./types";

// Local -> cloud migration (Phase 9). Explicit, user-triggered, and
// paranoid in exactly one way: local data is NEVER deleted until every
// migrated workout has been read back from the cloud and compared.
//
// Contract:
//   * Source and target are both WorkoutRepository — the engine works with
//     any pair (memory fakes in tests, localStorage -> Supabase in prod).
//   * Oldest-first, so cloud history keeps chronological order.
//   * Already-present workouts (same title + start time) are SKIPPED, so a
//     retry after a failure can't create duplicates. Best-effort identity,
//     not true sync — documented limitation, fine for an explicit button.
//   * First failure stops the run. Local storage is untouched (no backup,
//     no clear) so retrying is always safe.
//   * Only after ALL writes verify: the raw local payload is copied to a
//     timestamped backup key, then the live key is removed. The backup is
//     never auto-deleted — storage is cheap, user data is not.

export interface MigrationSuccess {
  ok: true;
  migrated: number;
  skipped: number;
  /** Timestamped backup key holding the pre-migration payload, or null if there was nothing. */
  backupKey: string | null;
}

export interface MigrationFailure {
  ok: false;
  migrated: number;
  total: number;
  message: string;
}

export type MigrationResult = MigrationSuccess | MigrationFailure;

function identityOf(title: string, startedAt: string): string {
  // Compare instants, not strings: local ISO (".000Z") and Postgres
  // ("+00:00") spell the same moment differently across backends.
  const t = Date.parse(startedAt);
  return `${title}\n${Number.isNaN(t) ? startedAt : t}`;
}

export async function migrateLocalToCloud(
  source: WorkoutRepository,
  target: WorkoutRepository,
  explicitStorage?: KeyValueStorage,
): Promise<MigrationResult> {
  const storage = explicitStorage ?? browserStorage();

  const summaries = await source.listWorkouts();
  if (summaries.length === 0) {
    return { ok: true, migrated: 0, skipped: 0, backupKey: null };
  }
  const ordered = [...summaries].sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) || a.createdAt.localeCompare(b.createdAt),
  );

  const alreadyThere = new Set(
    (await target.listWorkouts()).map((w) => identityOf(w.title, w.startedAt)),
  );

  let migrated = 0;
  let skipped = 0;
  try {
    for (const summary of ordered) {
      if (alreadyThere.has(identityOf(summary.title, summary.startedAt))) {
        skipped++;
        continue;
      }
      const detail = await source.getWorkout(summary.id);
      if (!detail) {
        skipped++; // Vanished mid-run (another tab?) — don't fail the batch.
        continue;
      }
      const created = await target.createWorkout({
        title: detail.workout.title,
        startedAt: detail.workout.startedAt,
        endedAt: detail.workout.endedAt,
        exercises: detail.exercises.map((e) => ({
          exerciseName: e.exercise.exerciseName,
          weightMode: normalizeWeightMode(e.exercise.weightMode),
          sets: e.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
        })),
      });
      // Read-back verification: re-fetch and compare shape, not just id.
      const check = await target.getWorkout(created.id);
      const wantSets = detail.exercises.reduce((n, e) => n + e.sets.length, 0);
      const gotSets = check?.exercises.reduce((n, e) => n + e.sets.length, 0) ?? -1;
      if (
        !check ||
        check.workout.title !== detail.workout.title ||
        check.exercises.length !== detail.exercises.length ||
        gotSets !== wantSets
      ) {
        throw new Error(
          `Verification failed for "${detail.workout.title}" — the cloud copy ` +
            `does not match. Nothing was deleted locally; fix the problem and retry.`,
        );
      }
      migrated++;
    }
  } catch (e: unknown) {
    return {
      ok: false,
      migrated,
      total: ordered.length,
      message: e instanceof Error ? e.message : "Migration failed.",
    };
  }

  const raw = storage.getItem(LOCAL_STORAGE_KEY_V1);
  let backupKey: string | null = null;
  if (raw !== null) {
    backupKey = `${LOCAL_STORAGE_KEY_V1}:backup:${Date.now()}`;
    storage.setItem(backupKey, raw);
    storage.removeItem(LOCAL_STORAGE_KEY_V1);
  }
  return { ok: true, migrated, skipped, backupKey };
}
