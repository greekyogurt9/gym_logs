import { describe, expect, it } from "vitest";
import {
  ValidationError,
  isValidationError,
  validateNewWorkout,
} from "./validation";

function validInput() {
  return {
    title: "Legs",
    startedAt: "2026-09-15T10:00:00.000Z",
    exercises: [
      {
        exerciseName: "Squat",
        sets: [
          { weightKg: 30, reps: 10 },
          { weightKg: 35, reps: 8 },
        ],
      },
    ],
  };
}

function expectInvalid(input: unknown, pathPart: string) {
  try {
    validateNewWorkout(input);
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationError);
    expect(isValidationError(e)).toBe(true);
    const paths = (e as ValidationError).issues.map((i) => i.path);
    expect(paths.some((p) => p.includes(pathPart))).toBe(true);
    return;
  }
  throw new Error(`Expected ValidationError containing "${pathPart}", but input passed.`);
}

describe("validateNewWorkout", () => {
  it("accepts a valid workout and trims names", () => {
    const out = validateNewWorkout({
      ...validInput(),
      title: "  Legs  ",
      exercises: [{ exerciseName: "  Squat ", sets: [{ weightKg: 30, reps: 10 }] }],
    });
    expect(out.title).toBe("Legs");
    expect(out.exercises[0].exerciseName).toBe("Squat");
  });

  it("rejects non-objects", () => {
    expectInvalid(null, "");
    expectInvalid("Legs", "");
    expectInvalid([], "");
  });

  it("rejects missing/blank/oversize titles", () => {
    expectInvalid({ ...validInput(), title: "" }, "title");
    expectInvalid({ ...validInput(), title: "   " }, "title");
    expectInvalid({ ...validInput(), title: "x".repeat(81) }, "title");
    expectInvalid({ ...validInput(), title: 42 }, "title");
  });

  it("rejects bad dates and end-before-start", () => {
    expectInvalid({ ...validInput(), startedAt: "not-a-date" }, "startedAt");
    expectInvalid(
      { ...validInput(), endedAt: "2026-09-15T09:00:00.000Z" },
      "endedAt",
    );
  });

  it("accepts an end date after the start", () => {
    const out = validateNewWorkout({
      ...validInput(),
      endedAt: "2026-09-15T11:00:00.000Z",
    });
    expect(out.endedAt).toBe("2026-09-15T11:00:00.000Z");
  });

  it("rejects missing or oversize exercise lists", () => {
    expectInvalid({ ...validInput(), exercises: [] }, "exercises");
    expectInvalid(
      {
        ...validInput(),
        exercises: Array.from({ length: 51 }, (_, i) => ({
          exerciseName: `Ex ${i}`,
          sets: [{ weightKg: 10, reps: 10 }],
        })),
      },
      "exercises",
    );
  });

  it("rejects blank/oversize exercise names", () => {
    expectInvalid(
      { ...validInput(), exercises: [{ exerciseName: "  ", sets: [{ weightKg: 10, reps: 10 }] }] },
      "exerciseName",
    );
    expectInvalid(
      {
        ...validInput(),
        exercises: [{ exerciseName: "x".repeat(61), sets: [{ weightKg: 10, reps: 10 }] }],
      },
      "exerciseName",
    );
  });

  it("rejects empty set lists", () => {
    expectInvalid(
      { ...validInput(), exercises: [{ exerciseName: "Squat", sets: [] }] },
      "sets",
    );
  });

  it("rejects bad weights", () => {
    for (const weightKg of [0, -5, Number.NaN, Infinity, 1000.1, 30.55, "35"]) {
      expectInvalid(
        {
          ...validInput(),
          exercises: [{ exerciseName: "Squat", sets: [{ weightKg, reps: 8 }] }],
        },
        "weightKg",
      );
    }
  });

  it("accepts boundary weights", () => {
    for (const weightKg of [0.5, 30.5, 1000]) {
      const out = validateNewWorkout({
        ...validInput(),
        exercises: [{ exerciseName: "Squat", sets: [{ weightKg, reps: 8 }] }],
      });
      expect(out.exercises[0].sets[0].weightKg).toBe(weightKg);
    }
  });

  it("rejects bad reps", () => {
    for (const reps of [0, -1, 1.5, 1001, "10", Number.NaN]) {
      expectInvalid(
        {
          ...validInput(),
          exercises: [{ exerciseName: "Squat", sets: [{ weightKg: 30, reps }] }],
        },
        "reps",
      );
    }
  });

  it("collects every problem with field paths, not just the first", () => {
    try {
      validateNewWorkout({
        title: "",
        startedAt: "junk",
        exercises: [{ exerciseName: "", sets: [{ weightKg: 0, reps: 0 }] }],
      });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const paths = (e as ValidationError).issues.map((i) => i.path).sort();
      expect(paths).toContain("title");
      expect(paths).toContain("startedAt");
      expect(paths).toContain("exercises[0].exerciseName");
      expect(paths).toContain("exercises[0].sets[0].weightKg");
      expect(paths).toContain("exercises[0].sets[0].reps");
    }
  });

  it("defaults missing weightMode to total and accepts per_side", () => {
    const def = validateNewWorkout(validInput());
    expect(def.exercises[0].weightMode).toBe("total");
    const per = validateNewWorkout({
      ...validInput(),
      exercises: [
        { exerciseName: "Squat", weightMode: "per_side", sets: [{ weightKg: 15, reps: 10 }] },
      ],
    });
    expect(per.exercises[0].weightMode).toBe("per_side");
  });

  it("rejects unknown weightMode", () => {
    expectInvalid(
      {
        ...validInput(),
        exercises: [
          { exerciseName: "Squat", weightMode: "dumbbell", sets: [{ weightKg: 15, reps: 10 }] },
        ],
      },
      "weightMode",
    );
  });
});
