import { describe, expect, it } from "vitest";
import { getWorkoutRepository } from "./get-repository";

// Guards the Phase 8 seam: the UI depends on this accessor, so it must
// always hand out an interface-conformant instance. Without cloud env vars
// (unit-test environment) it is the stable local singleton.

describe("getWorkoutRepository", () => {
  it("returns a stable singleton implementing the interface", async () => {
    const a = await getWorkoutRepository();
    const b = await getWorkoutRepository();
    expect(a).toBe(b);
    for (const method of ["listWorkouts", "getWorkout", "createWorkout", "deleteWorkout"] as const) {
      expect(typeof a[method]).toBe("function");
    }
  });
});
