import { todayLocalDate } from "./format";
import type { WeightMode, WorkoutDetail } from "./types";
import { normalizeWeightMode } from "./types";
import { browserStorage, type KeyValueStorage } from "./local-storage-repository";
import { EXERCISE_NAME_MAX, REPS_MAX, WEIGHT_KG_MAX } from "./validation";

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
  /** Optional so pre-toggle drafts/tests still typecheck — read as "total". */
  weightMode?: WeightMode;
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
        weightMode: normalizeWeightMode(e.exercise.weightMode),
        sets: [...e.sets]
          .sort((a, b) => a.setNumber - b.setNumber)
          .map((s) => ({ weight: String(s.weightKg), reps: String(s.reps) })),
      })),
  };
}

export function saveDraft(storage: KeyValueStorage, draft: WorkoutDraftState): void {
  storage.setItem(DRAFT_KEY_V1, JSON.stringify(draft));
}

export interface CleanedExerciseInput {
  exerciseName: string;
  weightMode: WeightMode;
  sets: { weightKg: number; reps: number }[];
}

/**
 * Log-tab save policy: empty rows (both kg + reps blank) mean "not
 * performed" and are dropped silently — including whole exercises with no
 * filled sets. Half-filled rows block the save with per-field messages so
 * a typo can't silently vanish. Filled rows get range-checked here (same
 * limits as the validator) with the ORIGINAL form indices, so errors
 * highlight the right inputs; the repository stays the final boundary.
 */
export function cleanDraftExercises(exercises: ExerciseDraftState[]): {
  cleaned: CleanedExerciseInput[];
  fieldErrors: Record<string, string>;
} {
  const fieldErrors: Record<string, string> = {};
  const cleaned: CleanedExerciseInput[] = [];

  exercises.forEach((ex, i) => {
    const name = ex.name.trim();
    const weightMode = normalizeWeightMode(
      (ex as { weightMode?: unknown }).weightMode,
    );
    const kept: { weightKg: number; reps: number }[] = [];

    ex.sets.forEach((s, j) => {
      const wRaw = s.weight.trim();
      const rRaw = s.reps.trim();
      const wPath = `exercises[${i}].sets[${j}].weightKg`;
      const rPath = `exercises[${i}].sets[${j}].reps`;
      if (wRaw === "" && rRaw === "") return; // not performed — silent
      if (wRaw === "" || rRaw === "") {
        if (wRaw === "") fieldErrors[wPath] = "Enter kg, or clear both.";
        else fieldErrors[rPath] = "Enter reps, or clear both.";
        return;
      }
      const w = Number(wRaw);
      const r = Number(rRaw);
      if (
        !Number.isFinite(w) ||
        w <= 0 ||
        w > WEIGHT_KG_MAX ||
        Math.abs(w * 10 - Math.round(w * 10)) > 1e-9
      ) {
        fieldErrors[wPath] =
          `Weight must be above 0, at most ${WEIGHT_KG_MAX} kg, max 1 decimal.`;
        return;
      }
      if (!Number.isInteger(r) || r < 1 || r > REPS_MAX) {
        fieldErrors[rPath] = `Reps must be a whole number 1–${REPS_MAX}.`;
        return;
      }
      kept.push({ weightKg: w, reps: r });
    });

    if (name === "") {
      if (kept.length > 0) {
        fieldErrors[`exercises[${i}].exerciseName`] = "Exercise needs a name.";
      }
      return; // unnamed + empty = not performed — silent
    }
    if (name.length > EXERCISE_NAME_MAX) {
      fieldErrors[`exercises[${i}].exerciseName`] =
        `Exercise name must be at most ${EXERCISE_NAME_MAX} characters.`;
      return;
    }
    if (kept.length === 0) return; // named but no sets = not performed — silent
    cleaned.push({ exerciseName: name, weightMode, sets: kept });
  });

  return { cleaned, fieldErrors };
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
      const draft = parsed as WorkoutDraftState;
      // Backward compat: drafts saved before the per-side toggle lack it.
      draft.exercises = draft.exercises.map((e) => ({
        ...e,
        weightMode: normalizeWeightMode(
          (e as { weightMode?: unknown }).weightMode,
        ),
        sets: Array.isArray(e.sets) ? e.sets : [],
      }));
      return draft;
    }
  } catch {
    // Corrupt draft: already removed above. Fall through to null.
  }
  return null;
}
