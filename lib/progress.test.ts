import { describe, expect, it } from "vitest";
import {
  chartDomain,
  layoutChart,
  shortDate,
  targetStatus,
  toChartDots,
  toChartModel,
  workoutVolume,
} from "./progress";
import type { ExerciseHistoryPoint } from "./repository";

function point(date: string, bestTopSetKg: number | null, totalVolumeKg = 100): ExerciseHistoryPoint {
  return { date, bestTopSetKg, totalVolumeKg };
}

describe("toChartDots", () => {
  it("skips sessions without a qualifying set and sorts oldest first", () => {
    const dots = toChartDots([
      point("2026-09-15T10:00:00.000Z", 60),
      point("2026-09-10T10:00:00.000Z", null),
      point("2026-09-12T10:00:00.000Z", 55),
    ]);
    expect(dots.map((d) => d.valueKg)).toEqual([55, 60]);
  });
});

describe("chartDomain", () => {
  it("pads the range and floors at zero", () => {
    const { yMin, yMax } = chartDomain([
      { label: "a", date: "2026-09-10", valueKg: 60 },
      { label: "b", date: "2026-09-15", valueKg: 70 },
    ]);
    expect(yMin).toBeGreaterThanOrEqual(0);
    expect(yMin).toBeLessThanOrEqual(60);
    expect(yMax).toBeGreaterThanOrEqual(70);
  });

  it("stretches to include the target", () => {
    const { yMax } = chartDomain(
      [{ label: "a", date: "2026-09-10", valueKg: 60 }],
      120,
    );
    expect(yMax).toBeGreaterThanOrEqual(120);
  });

  it("handles empty input", () => {
    expect(chartDomain([])).toEqual({ yMin: 0, yMax: 100 });
  });
});

describe("targetStatus", () => {
  const history = [point("2026-09-10T10:00:00.000Z", 100)];
  const target = { exerciseName: "Squat", targetWeightKg: 120, targetDate: "2026-12-31" };

  it("reports none without a target", () => {
    expect(targetStatus(history, null, "2026-09-15")).toEqual({ kind: "none" });
  });

  it("reports the gap when ahead", () => {
    expect(targetStatus(history, target, "2026-09-15")).toEqual({ kind: "ahead", gapKg: 20 });
  });

  it("reports hit at or above target", () => {
    expect(
      targetStatus([point("2026-09-10T10:00:00.000Z", 120)], target, "2026-09-15"),
    ).toEqual({ kind: "hit" });
  });

  it("reports overdue past the date", () => {
    expect(targetStatus(history, target, "2027-01-05")).toEqual({ kind: "overdue", gapKg: 20 });
  });

  it("treats no history as zero current best", () => {
    expect(targetStatus([], target, "2026-09-15")).toEqual({ kind: "ahead", gapKg: 120 });
  });
});

describe("layoutChart", () => {
  it("places later sessions right and heavier sessions up", () => {
    const model = toChartModel([
      point("2026-09-10T10:00:00.000Z", 60),
      point("2026-09-20T10:00:00.000Z", 70),
    ]);
    const layout = layoutChart(model, null);
    expect(layout.dots).toHaveLength(2);
    expect(layout.dots[0].x).toBeLessThan(layout.dots[1].x);
    expect(layout.dots[0].y).toBeGreaterThan(layout.dots[1].y); // SVG y grows downward
    expect(layout.targetMarker).toBeNull();
  });

  it("centers a lone dot and stretches for a future target", () => {
    const model = toChartModel([point("2026-09-10T10:00:00.000Z", 60)]);
    const solo = layoutChart(model, null);
    expect(solo.dots[0].x).toBe(315); // center of the plot area, not the viewBox
    const withTarget = layoutChart(model, {
      exerciseName: "Squat",
      targetWeightKg: 120,
      targetDate: "2026-12-31",
    });
    expect(withTarget.targetMarker).not.toBeNull();
    expect(withTarget.targetMarker!.x).toBeGreaterThan(withTarget.dots[0].x);
    expect(withTarget.targetLineY).not.toBeNull();
  });

  it("returns empty geometry without dots", () => {
    const layout = layoutChart(toChartModel([]), null);
    expect(layout.dots).toEqual([]);
    expect(layout.targetMarker).toBeNull();
  });
});

describe("workoutVolume", () => {
  it("sums weight × reps across the workout", () => {
    expect(
      workoutVolume({
        workout: { id: "w", title: "Legs", startedAt: "2026-09-10", createdAt: "2026-09-10" },
        exercises: [
          {
            exercise: { id: "e1", workoutId: "w", exerciseName: "Squat", position: 0 },
            sets: [
              { id: "s1", workoutExerciseId: "e1", setNumber: 1, weightKg: 30, reps: 10 },
              { id: "s2", workoutExerciseId: "e1", setNumber: 2, weightKg: 35, reps: 8 },
            ],
          },
        ],
      }),
    ).toBe(580);
  });

  it("doubles per-side volume (both limbs move)", () => {
    expect(
      workoutVolume({
        workout: { id: "w", title: "Push", startedAt: "2026-09-10", createdAt: "2026-09-10" },
        exercises: [
          {
            exercise: {
              id: "e1",
              workoutId: "w",
              exerciseName: "Incline Dumbbell Press",
              position: 0,
              weightMode: "per_side",
            },
            sets: [{ id: "s1", workoutExerciseId: "e1", setNumber: 1, weightKg: 15, reps: 10 }],
          },
        ],
      }),
    ).toBe(300);
  });
});

describe("shortDate", () => {
  it("passes garbage through", () => {
    expect(shortDate("junk")).toBe("junk");
  });
});
