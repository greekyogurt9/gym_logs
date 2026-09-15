import { todayLocalDate } from "./format";
import type { WorkoutDetail } from "./types";
import { browserStorage, type KeyValueStorage } from "./local-storage-repository";

// Repeat-draft: cloning a past workout into the /new form. The detail page
// writes it, /new consumes it on mount (client-only, so no SSR hydration
// mismatch), then the key is removed. Drafts prefill with last session's
// numbers as the starting point — the standard "repeat" behavior.

export const DRAFT_KEY_V1 = "my-gym-buddy:draft:v1";

export interface SetDraftState {
  weight: string;
  reps: string;
}

export interface ExerciseDraftState {
  name: string;
  sets: SetDraftState[];
}

export interface WorkoutDraftState {
  title: string;
  date: string;
  exercises: ExerciseDraftState[];
}

export function draftFromDetail(detail: WorkoutDetail): WorkoutDraftState {
  return {
    title: detail.workout.title,
    date: todayLocalDate(),
    exercises: [...detail.exercises]
      .sort((a, b) => a.exercise.position - b.exercise.position)
      .map((e) => ({
        name: e.exercise.exerciseName,
        sets: [...e.sets]
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => ({ weight: String(s.weightKg), reps: String(s.reps) })),
      })),
  };
}

export function saveDraft(storage: KeyValueStorage, draft: WorkoutDraftState): void {
  storage.setItem(DRAFT_KEY_V1, JSON.stringify(draft));
}

/** Loads and clears the draft. Returns null when absent, corrupt, or server-side. */
export function takeDraft(storage?: KeyValueStorage): WorkoutDraftState | null {
  let store: KeyValueStorage;
  try {
    store = storage ?? browserStorage();
  } catch {
    return null;
  }
  const raw = store.getItem(DRAFT_KEY_V1);
  if (!raw) return null;
  try {
    store.removeItem(DRAFT_KEY_V1);
  } catch {
    // Non-fatal: worst case the draft reappears once.
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>)["title"] === "string" &&
      Array.isArray((parsed as Record<string, unknown>)["exercises"])
    ) {
      return parsed as WorkoutDraftState;
    }
  } catch {
    // Corrupt draft: already removed above. Fall through to null.
  }
  return null;
}
