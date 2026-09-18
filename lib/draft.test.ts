import { describe, expect, it } from "vitest";
import { cleanDraftExercises } from "./draft";

describe("cleanDraftExercises", () => {
  it("drops fully-empty rows and exercises silently", () => {
    const { cleaned, fieldErrors } = cleanDraftExercises([
      { name: "Squat", sets: [{ weight: "", reps: "" }, { weight: "60", reps: "8" }] },
      { name: "Bench Press", sets: [{ weight: "", reps: "" }] },
      { name: "   ", sets: [{ weight: "", reps: "" }] },
    ]);
    expect(fieldErrors).toEqual({});
    expect(cleaned).toEqual([
      { exerciseName: "Squat", weightMode: "total", sets: [{ weightKg: 60, reps: 8 }] },
    ]);
  });

  it("blocks half-filled rows with per-field messages", () => {
    const { cleaned, fieldErrors } = cleanDraftExercises([
      { name: "Squat", sets: [{ weight: "60", reps: "" }] },
      { name: "Row", sets: [{ weight: "", reps: "8" }] },
    ]);
    expect(cleaned).toEqual([]);
    expect(fieldErrors["exercises[0].sets[0].reps"]).toMatch(/reps/i);
    expect(fieldErrors["exercises[1].sets[0].weightKg"]).toMatch(/kg/i);
  });

  it("requires a name only when sets are filled", () => {
    const unnamed = cleanDraftExercises([
      { name: "  ", sets: [{ weight: "60", reps: "8" }] },
    ]);
    expect(unnamed.cleaned).toEqual([]);
    expect(unnamed.fieldErrors["exercises[0].exerciseName"]).toMatch(/name/i);

    const emptyUnnamed = cleanDraftExercises([{ name: "", sets: [{ weight: "", reps: "" }] }]);
    expect(emptyUnnamed).toEqual({ cleaned: [], fieldErrors: {} });
  });

  it("range-checks filled rows with original indices", () => {
    const { fieldErrors } = cleanDraftExercises([
      { name: "Squat", sets: [{ weight: "0", reps: "8" }] },
      { name: "Press", sets: [{ weight: "60", reps: "0" }] },
      { name: "Curl", sets: [{ weight: "60.55", reps: "8" }] },
    ]);
    expect(fieldErrors["exercises[0].sets[0].weightKg"]).toBeDefined();
    expect(fieldErrors["exercises[1].sets[0].reps"]).toBeDefined();
    expect(fieldErrors["exercises[2].sets[0].weightKg"]).toMatch(/decimal/);
  });

  it("preserves per-side mode and defaults missing mode to total", () => {
    const { cleaned, fieldErrors } = cleanDraftExercises([
      { name: "Incline Dumbbell Press", weightMode: "per_side", sets: [{ weight: "15", reps: "10" }] },
      { name: "Squat", sets: [{ weight: "60", reps: "8" }] },
    ]);
    expect(fieldErrors).toEqual({});
    expect(cleaned).toEqual([
      {
        exerciseName: "Incline Dumbbell Press",
        weightMode: "per_side",
        sets: [{ weightKg: 15, reps: 10 }],
      },
      { exerciseName: "Squat", weightMode: "total", sets: [{ weightKg: 60, reps: 8 }] },
    ]);
  });
});
