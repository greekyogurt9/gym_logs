// Minimal calendar helpers: group workouts by local day + build a
// Monday-first month grid. Pure functions, easily unit-tested. The calendar
// page stays thin: fetch summaries via the repository, group here, render.

import { localDayKeyFromDate, localDayKeyFromIso } from "./format";
import type { Workout } from "./types";

export interface MonthCell {
  date: Date;
  /** Local YYYY-MM-DD key for grouping lookups. */
  key: string;
  inMonth: boolean;
}

/** Workouts bucketed by local calendar day (key YYYY-MM-DD). */
export function groupWorkoutsByDay(workouts: Workout[]): Map<string, Workout[]> {
  const map = new Map<string, Workout[]>();
  for (const w of workouts) {
    const key = localDayKeyFromIso(w.startedAt);
    if (key === "") continue;
    const list = map.get(key) ?? [];
    list.push(w);
    map.set(key, list);
  }
  // Newest first inside each day (matches history ordering).
  for (const list of map.values()) {
    list.sort((a, b) =>
      a.startedAt !== b.startedAt
        ? b.startedAt.localeCompare(a.startedAt)
        : b.createdAt.localeCompare(a.createdAt),
    );
  }
  return map;
}

/**
 * Monday-first month grid covering the month with full weeks.
 * Returns 28–42 cells (4–6 weeks), each with its local day key.
 */
export function buildMonthGrid(year: number, monthIndex: number): MonthCell[] {
  const first = new Date(year, monthIndex, 1);
  const offset = (first.getDay() + 6) % 7; // Mon=0 … Sun=6
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const total = Math.ceil((offset + daysInMonth) / 7) * 7;
  const cells: MonthCell[] = [];
  for (let n = 0; n < total; n++) {
    const date = new Date(year, monthIndex, 1 - offset + n);
    cells.push({
      date,
      key: localDayKeyFromDate(date),
      inMonth: date.getMonth() === monthIndex,
    });
  }
  return cells;
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function todayKey(): string {
  return localDayKeyFromDate(new Date());
}
