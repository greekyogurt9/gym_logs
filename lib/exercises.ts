// Workout-type catalog: Legs / Push / Pull.
//
// One constrained choice replaces the old free-text title. Three options
// cover a full week for most lifters, kill the "what do I call this?"
// friction, and let the form suggest the right exercises per day.
// Stored titles stay plain strings ("Legs" etc.), so old rows keep working
// and no database migration was needed — the constraint lives in
// validateNewWorkout, not in Postgres.

export interface WorkoutType {
  /** Stored as the workout title. Stable — never rename. */
  id: string;
  /** Display label with the day suffix. */
  label: string;
  icon: string;
}

export const WORKOUT_TYPES: WorkoutType[] = [
  { id: "Legs", label: "Leg day", icon: "🦵" },
  { id: "Push", label: "Push day", icon: "💪" },
  { id: "Pull", label: "Pull day", icon: "🏋️" },
];

export function isWorkoutTypeId(v: string): boolean {
  return WORKOUT_TYPES.some((t) => t.id === v);
}

/** Small icon for a stored title, or "" for legacy custom titles. */
export function iconForTitle(title: string): string {
  return WORKOUT_TYPES.find((t) => t.id === title)?.icon ?? "";
}

/** Suggested exercises per day. Free-text entry is still allowed — the
 *  catalog guides, the validator only enforces length, not membership. */
export const EXERCISES_BY_TYPE: Record<string, string[]> = {
  Legs: [
    "Back Squat",
    "Front Squat",
    "Romanian Deadlift",
    "Leg Press",
    "Bulgarian Split Squat",
    "Walking Lunge",
    "Hip Thrust",
    "Leg Curl",
    "Leg Extension",
    "Standing Calf Raise",
  ],
  Push: [
    "Bench Press",
    "Overhead Press",
    "Incline Dumbbell Press",
    "Dips",
    "Push-Up",
    "Lateral Raise",
    "Chest Fly",
    "Triceps Pushdown",
  ],
  Pull: [
    "Deadlift",
    "Pull-Up",
    "Barbell Row",
    "Lat Pulldown",
    "Seated Cable Row",
    "Face Pull",
    "Barbell Curl",
    "Hammer Curl",
  ],
};

export function suggestionsForType(workoutTypeId: string): string[] {
  return EXERCISES_BY_TYPE[workoutTypeId] ?? [];
}

/** How many exercises auto-appear when a day is picked (Log tab). */
export const TEMPLATE_EXERCISES_PER_DAY = 5;

/**
 * Day template: the first 5 catalog names for the day, each with one empty
 * set. Empty rows mean "not performed" — saving skips them, so picking a
 * day never creates phantom volume. Custom names stay allowed via the
 * free-text input + quick-add chips.
 */
export function templateExercisesForType(workoutTypeId: string): string[] {
  return suggestionsForType(workoutTypeId).slice(0, TEMPLATE_EXERCISES_PER_DAY);
}
