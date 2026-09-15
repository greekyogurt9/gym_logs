import { describe, expect, it } from "vitest";
import {
  EXERCISES_BY_TYPE,
  WORKOUT_TYPES,
  iconForTitle,
  isWorkoutTypeId,
  suggestionsForType,
} from "./exercises";
import { ValidationError, validateNewWorkout } from "./validation";

function validLegs() {
  return {
    title: "Legs",
    startedAt: "2026-09-15T10:00:00.000Z",
    exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 30, reps: 10 }] }],
  };
}

describe("workout-type catalog", () => {
  it("offers exactly Legs / Push / Pull with unique ids and icons", () => {
    expect(WORKOUT_TYPES.map((t) => t.id)).toEqual(["Legs", "Push", "Pull"]);
    expect(new Set(WORKOUT_TYPES.map((t) => t.icon)).size).toBe(3);
    for (const t of WORKOUT_TYPES) {
      expect(isWorkoutTypeId(t.id)).toBe(true);
      expect(iconForTitle(t.id).length).toBeGreaterThan(0);
    }
  });

  it("suggests a non-empty exercise list per type, empty for unknown", () => {
    for (const t of WORKOUT_TYPES) {
      expect(suggestionsForType(t.id).length).toBeGreaterThan(5);
    }
    expect(suggestionsForType("Yoga")).toEqual([]);
    expect(EXERCISES_BY_TYPE["Legs"]).toContain("Back Squat");
    expect(EXERCISES_BY_TYPE["Push"]).toContain("Bench Press");
    expect(EXERCISES_BY_TYPE["Pull"]).toContain("Deadlift");
  });

  it("returns no icon for legacy custom titles", () => {
    expect(iconForTitle("Chest day")).toBe("");
    expect(isWorkoutTypeId("Chest day")).toBe(false);
  });
});

describe("constrained workout titles", () => {
  it("accepts each of the three days", () => {
    for (const title of ["Legs", "Push", "Pull"]) {
      expect(validateNewWorkout({ ...validLegs(), title }).title).toBe(title);
    }
  });

  it("rejects anything else, even valid-looking names", () => {
    for (const title of ["", "   ", "Chest day", "legs", "LEGS", "Leg day"]) {
      try {
        validateNewWorkout({ ...validLegs(), title });
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).issues.map((i) => i.path)).toContain("title");
        continue;
      }
      throw new Error(`Expected ValidationError for title "${title}"`);
    }
  });
});
