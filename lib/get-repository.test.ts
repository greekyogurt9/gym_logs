import { describe, expect, it } from "vitest";
import { getWorkoutRepository } from "./get-repository";

// Guards the Phase 8 seam: the UI depends on this accessor, so it must
// always hand out the same interface-conformant instance.

describe("getWorkoutRepository", () => {
  it("returns a stable singleton implementing the interface", () => {
    const a = getWorkoutRepository();
    const b = getWorkoutRepository();
    expect(a).toBe(b);
    for (const method of ["listWorkouts", "getWorkout", "createWorkout", "deleteWorkout"] as const) {
      expect(typeof a[method]).toBe("function");
    }
  });
});
