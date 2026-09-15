import { describe, expect, it } from "vitest";
import { dateInputToIso, formatWorkoutDate, todayLocalDate } from "./format";

describe("todayLocalDate", () => {
  it("returns a local YYYY-MM-DD string", () => {
    const out = todayLocalDate();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const now = new Date();
    const [y, m, d] = out.split("-").map(Number);
    expect(y).toBe(now.getFullYear());
    expect(m).toBe(now.getMonth() + 1);
    expect(d).toBe(now.getDate());
  });
});

describe("dateInputToIso", () => {
  it("converts a date input to a parseable ISO timestamp on the same local day", () => {
    const out = dateInputToIso("2026-09-15");
    const parsed = new Date(out);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(15);
  });

  it("passes garbage through for the validator to report", () => {
    expect(dateInputToIso("")).toBe("");
    expect(dateInputToIso("junk")).toBe("junk");
    // Matches the shape but is not a real date — still passed through.
    expect(dateInputToIso("2026-13-45")).toBe("2026-13-45");
  });
});

describe("formatWorkoutDate", () => {
  it("formats valid timestamps for display", () => {
    const out = formatWorkoutDate("2026-09-15T06:30:00.000Z");
    expect(out).not.toBe("2026-09-15T06:30:00.000Z");
    expect(out).toMatch(/2026/);
  });

  it("returns garbage untouched instead of crashing", () => {
    expect(formatWorkoutDate("junk")).toBe("junk");
  });
});
