import { describe, expect, it } from "vitest";
import { buildMonthGrid, groupWorkoutsByDay } from "./calendar";
import { localDayKeyFromDate } from "./format";
import type { Workout } from "./types";

function workout(id: string, title: string, startedAt: string): Workout {
  return { id, title, startedAt, createdAt: startedAt };
}

describe("groupWorkoutsByDay", () => {
  it("buckets by local day and skips garbage dates", () => {
    const map = groupWorkoutsByDay([
      workout("a", "Legs", "2026-09-15T10:00:00.000Z"),
      workout("b", "Push", "2026-09-15T18:00:00.000Z"),
      workout("c", "Pull", "junk"),
    ]);
    const key = localDayKeyFromDate(new Date("2026-09-15T10:00:00.000Z"));
    expect(map.get(key)?.map((w) => w.id).sort()).toEqual(["a", "b"]);
    expect([...map.values()].flat()).toHaveLength(2);
  });
});

describe("buildMonthGrid", () => {
  it("covers September 2026 in full Monday-first weeks", () => {
    const cells = buildMonthGrid(2026, 8);
    expect(cells.length % 7).toBe(0);
    // Sep 1 2026 is a Tuesday -> first cell is Monday Aug 31.
    expect(cells[0].date.getDay()).toBe(1);
    expect(cells.filter((c) => c.inMonth)).toHaveLength(30);
    const keys = new Set(cells.map((c) => c.key));
    expect(keys.size).toBe(cells.length);
  });
});
