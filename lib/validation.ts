import type {
  NewExerciseInput,
  NewSetInput,
  NewWorkoutInput,
} from "./types";

export interface TargetInput {
  exerciseName: string;
  targetWeightKg: number;
  targetDate: string;
}

// Validation for My Gym Buddy.
//
// Hand-rolled on purpose: the rules are small (lengths, ranges, required
// fields) and this file has zero dependencies. It is the single source of
// truth for "what counts as a valid workout" and is used in three places:
//   1. Phase 4 forms — to show per-field messages before saving.
//   2. LocalStorageRepository.createWorkout — invalid data never gets stored.
//   3. V2 cloud migration — local rows are re-validated before upload, so a
//      corrupt localStorage can never poison Postgres (whose CHECK
//      constraints mirror these same limits).
//
// Design: validateNewWorkout collects ALL problems (with field paths like
// "exercises[0].sets[2].weightKg") instead of throwing on the first one,
// because forms need to highlight every bad field at once. It returns
// normalized data (trimmed strings), so callers store clean values.

export interface ValidationIssue {
  /** Field path, e.g. "title" or "exercises[1].sets[0].reps". */
  path: string;
  message: string;
}

export class ValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(
      issues.length === 1
        ? issues[0].message
        : `${issues.length} problems found. First: ${issues[0].message}`,
    );
    this.name = "ValidationError";
    this.issues = issues;
  }
}

export function isValidationError(e: unknown): e is ValidationError {
  return e instanceof ValidationError;
}

export const TITLE_MAX = 80;
export const EXERCISE_NAME_MAX = 60;
export const WEIGHT_KG_MAX = 1000;
export const REPS_MAX = 1000;
export const MAX_EXERCISES_PER_WORKOUT = 50;
export const MAX_SETS_PER_EXERCISE = 200;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function checkDate(
  issues: ValidationIssue[],
  path: string,
  v: unknown,
  label: string,
): string | null {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
    issues.push({ path, message: `${label} must be a valid date.` });
    return null;
  }
  return v;
}

function validateSet(
  issues: ValidationIssue[],
  path: string,
  v: unknown,
): NewSetInput | null {
  if (!isRecord(v)) {
    issues.push({ path, message: "Set must be an object." });
    return null;
  }
  let weightKg = 0;
  let reps = 0;
  let ok = true;

  const w = v["weightKg"];
  if (
    typeof w !== "number" ||
    !Number.isFinite(w) ||
    w <= 0 ||
    w > WEIGHT_KG_MAX ||
    Math.abs(w * 10 - Math.round(w * 10)) > 1e-9
  ) {
    issues.push({
      path: `${path}.weightKg`,
      message: `Weight must be a number above 0, at most ${WEIGHT_KG_MAX} kg, with at most 1 decimal.`,
    });
    ok = false;
  } else {
    weightKg = w;
  }

  const r = v["reps"];
  if (
    typeof r !== "number" ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > REPS_MAX
  ) {
    issues.push({
      path: `${path}.reps`,
      message: `Reps must be a whole number between 1 and ${REPS_MAX}.`,
    });
    ok = false;
  } else {
    reps = r;
  }

  return ok ? { weightKg, reps } : null;
}

function validateExercise(
  issues: ValidationIssue[],
  path: string,
  v: unknown,
): NewExerciseInput | null {
  if (!isRecord(v)) {
    issues.push({ path, message: "Exercise must be an object." });
    return null;
  }
  let name = "";
  let ok = true;

  const n = v["exerciseName"];
  if (typeof n !== "string" || n.trim().length === 0) {
    issues.push({ path: `${path}.exerciseName`, message: "Exercise needs a name." });
    ok = false;
  } else if (n.trim().length > EXERCISE_NAME_MAX) {
    issues.push({
      path: `${path}.exerciseName`,
      message: `Exercise name must be at most ${EXERCISE_NAME_MAX} characters.`,
    });
    ok = false;
  } else {
    name = n.trim();
  }

  const setsRaw = v["sets"];
  const sets: NewSetInput[] = [];
  if (!Array.isArray(setsRaw) || setsRaw.length === 0) {
    issues.push({ path: `${path}.sets`, message: "Each exercise needs at least 1 set." });
    ok = false;
  } else if (setsRaw.length > MAX_SETS_PER_EXERCISE) {
    issues.push({
      path: `${path}.sets`,
      message: `At most ${MAX_SETS_PER_EXERCISE} sets per exercise.`,
    });
    ok = false;
  } else {
    setsRaw.forEach((s, i) => {
      const set = validateSet(issues, `${path}.sets[${i}]`, s);
      if (set) sets.push(set);
      else ok = false;
    });
  }

  return ok ? { exerciseName: name, sets } : null;
}

export function validateNewWorkout(input: unknown): NewWorkoutInput {
  const issues: ValidationIssue[] = [];

  if (!isRecord(input)) {
    throw new ValidationError([{ path: "", message: "Workout must be an object." }]);
  }

  let title = "";
  const t = input["title"];
  if (typeof t !== "string" || t.trim().length === 0) {
    issues.push({ path: "title", message: "Workout needs a title." });
  } else if (t.trim().length > TITLE_MAX) {
    issues.push({
      path: "title",
      message: `Title must be at most ${TITLE_MAX} characters.`,
    });
  } else {
    title = t.trim();
  }

  const startedAt = checkDate(issues, "startedAt", input["startedAt"], "Start date");

  let endedAt: string | null | undefined;
  const e = input["endedAt"];
  if (e !== undefined && e !== null) {
    const parsed = checkDate(issues, "endedAt", e, "End date");
    if (parsed && startedAt && Date.parse(parsed) < Date.parse(startedAt)) {
      issues.push({ path: "endedAt", message: "End date cannot be before the start date." });
    } else if (parsed) {
      endedAt = parsed;
    }
  }

  const exercises: NewExerciseInput[] = [];
  const exRaw = input["exercises"];
  if (!Array.isArray(exRaw) || exRaw.length === 0) {
    issues.push({ path: "exercises", message: "Add at least 1 exercise." });
  } else if (exRaw.length > MAX_EXERCISES_PER_WORKOUT) {
    issues.push({
      path: "exercises",
      message: `At most ${MAX_EXERCISES_PER_WORKOUT} exercises per workout.`,
    });
  } else {
    exRaw.forEach((ex, i) => {
      const exercise = validateExercise(issues, `exercises[${i}]`, ex);
      // Nested failures already recorded their own issues; only keep complete ones.
      if (exercise) exercises.push(exercise);
    });
  }

  if (issues.length > 0) {
    throw new ValidationError(issues);
  }

  return { title, startedAt: startedAt as string, endedAt, exercises };
}

function checkWeight(
  issues: ValidationIssue[],
  path: string,
  v: unknown,
): number | null {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v <= 0 ||
    v > WEIGHT_KG_MAX ||
    Math.abs(v * 10 - Math.round(v * 10)) > 1e-9
  ) {
    issues.push({
      path,
      message: `Weight must be a number above 0, at most ${WEIGHT_KG_MAX} kg, with at most 1 decimal.`,
    });
    return null;
  }
  return v;
}

function checkExerciseName(
  issues: ValidationIssue[],
  path: string,
  v: unknown,
): string | null {
  if (typeof v !== "string" || v.trim().length === 0) {
    issues.push({ path, message: "Exercise needs a name." });
    return null;
  }
  if (v.trim().length > EXERCISE_NAME_MAX) {
    issues.push({
      path,
      message: `Exercise name must be at most ${EXERCISE_NAME_MAX} characters.`,
    });
    return null;
  }
  return v.trim();
}

/**
 * Target form validation: same name/weight rules as sets, plus a calendar
 * date (past allowed — the UI renders the overdue state instead of
 * forbidding it).
 */
export function validateTarget(input: unknown): TargetInput {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    throw new ValidationError([{ path: "", message: "Target must be an object." }]);
  }
  const exerciseName = checkExerciseName(issues, "exerciseName", input["exerciseName"]);
  const targetWeightKg = checkWeight(issues, "targetWeightKg", input["targetWeightKg"]);

  let targetDate = "";
  const d = input["targetDate"];
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d))) {
    issues.push({ path: "targetDate", message: "Target date must be a valid YYYY-MM-DD date." });
  } else {
    targetDate = d;
  }

  if (issues.length > 0 || !exerciseName || targetWeightKg === null) {
    if (issues.length === 0) {
      issues.push({ path: "", message: "Invalid target." });
    }
    throw new ValidationError(issues);
  }
  return { exerciseName, targetWeightKg, targetDate };
}
