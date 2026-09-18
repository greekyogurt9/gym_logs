import type { ExerciseHistoryPoint, ExerciseTarget } from "./repository";
import type { WorkoutDetail } from "./types";
import { normalizeWeightMode, weightModeMultiplier } from "./types";

// Pure progress math for the "am I lifting higher?" chart. No storage, no
// dates parsing beyond ISO strings — every function here is trivially
// unit-testable, and the SVG component renders whatever this returns.

export interface ChartDot {
  /** Session label, e.g. "Sep 12". */
  label: string;
  /** ISO date of the session. */
  date: string;
  valueKg: number;
}

export interface ChartModel {
  dots: ChartDot[];
  yMin: number;
  yMax: number;
}

export type TargetStatus =
  | { kind: "none" }
  | { kind: "ahead"; gapKg: number }
  | { kind: "hit" }
  | { kind: "overdue"; gapKg: number };

/** Total kg lifted in one workout (Σ weight × reps). Shown on history cards. */
export function workoutVolume(detail: WorkoutDetail): number {
  return detail.exercises.reduce(
    (n, e) =>
      n +
      e.sets.reduce(
        (m, s) =>
          m +
          s.weightKg *
            s.reps *
            weightModeMultiplier(normalizeWeightMode(e.exercise.weightMode)),
        0,
      ),
    0,
  );
}

/** Short label like "Sep 12" — presentation only, never used for sorting. */
export function shortDate(iso: string): string {  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Sessions with a qualifying best become dots, oldest first. Sessions
 * without one (no 8+ set) are skipped — the line must never dip to zero
 * for a light day.
 */
export function toChartDots(history: ExerciseHistoryPoint[]): ChartDot[] {
  return history
    .filter((p) => p.bestTopSetKg !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ label: shortDate(p.date), date: p.date, valueKg: p.bestTopSetKg as number }));
}

/** Y-domain covering dots and (when set) the target line, with headroom. */
export function chartDomain(dots: ChartDot[], targetWeightKg?: number): { yMin: number; yMax: number } {
  const values = dots.map((d) => d.valueKg);
  if (targetWeightKg !== undefined) values.push(targetWeightKg);
  if (values.length === 0) return { yMin: 0, yMax: 100 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.2, 2.5);
  return { yMin: Math.max(0, Math.floor(min - pad)), yMax: Math.ceil(max + pad) };
}

export function toChartModel(
  history: ExerciseHistoryPoint[],
  target?: ExerciseTarget | null,
): ChartModel {
  const dots = toChartDots(history);
  const { yMin, yMax } = chartDomain(dots, target?.targetWeightKg);
  return { dots, yMin, yMax };
}

/**
 * Where the lifter stands vs the target, evaluated against the latest
 * qualifying best. `todayIso` is injectable (YYYY-MM-DD) so tests don't
 * depend on the calendar.
 */
export function targetStatus(
  history: ExerciseHistoryPoint[],
  target: ExerciseTarget | null,
  todayIso: string,
): TargetStatus {
  if (!target) return { kind: "none" };
  const bests = history
    .map((p) => p.bestTopSetKg)
    .filter((v): v is number => v !== null);
  const current = bests.length > 0 ? Math.max(...bests) : 0;
  const gapKg = Math.round((target.targetWeightKg - current) * 10) / 10;
  if (gapKg <= 0) return { kind: "hit" };
  if (target.targetDate < todayIso) return { kind: "overdue", gapKg };
  return { kind: "ahead", gapKg };
}

// --- ViewBox geometry (600x260). Pure math: fully unit-tested, the SVG
// component only draws what this returns. X is date-interpolated across
// [first session, max(last session, target date)] so a far-off target
// honestly stretches the axis instead of squeezing dots left.

export const CHART_W = 600;
export const CHART_H = 260;
const PAD_L = 46;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 30;

export interface PlacedDot extends ChartDot {
  x: number;
  y: number;
}

export interface ChartLayout {
  dots: PlacedDot[];
  yTicks: number[];
  /** Gridline rows with precomputed y positions (same linear map as dots). */
  gridlines: { value: number; y: number }[];
  targetLineY: number | null;
  targetMarker: { x: number; y: number } | null;
}

export function layoutChart(
  model: ChartModel,
  target?: ExerciseTarget | null,
): ChartLayout {
  const { dots, yMin, yMax } = model;
  const y = (v: number) =>
    PAD_T + (1 - (v - yMin) / Math.max(1e-9, yMax - yMin)) * (CHART_H - PAD_T - PAD_B);

  const yTicks =
    yMax <= yMin
      ? [yMin]
      : [0, 1, 2, 3].map((i) => Math.round(((yMin + ((yMax - yMin) * i) / 3) * 10) / 10));

  if (dots.length === 0) {
    return { dots: [], yTicks, gridlines: [], targetLineY: null, targetMarker: null };
  }

  const t = (iso: string) => Date.parse(iso);
  const first = t(dots[0].date);
  let last = t(dots[dots.length - 1].date);
  if (target && !Number.isNaN(Date.parse(target.targetDate + "T12:00:00"))) {
    last = Math.max(last, Date.parse(target.targetDate + "T12:00:00"));
  }
  // Minimum one-day domain so same-day sessions don't collapse to a point.
  const span = Math.max(86400000, last - first);
  const x = (iso: string) =>
    PAD_L + ((t(iso) - first) / span) * (CHART_W - PAD_L - PAD_R);

  const placed = dots.map((d) => ({
    ...d,
    // A lone dot with no target to stretch toward sits centered, not glued left.
    x: dots.length === 1 && !target ? (CHART_W - PAD_L - PAD_R) / 2 + PAD_L : x(d.date),
    y: y(d.valueKg),
  }));

  let targetLineY: number | null = null;
  let targetMarker: { x: number; y: number } | null = null;
  if (target) {
    targetLineY = y(target.targetWeightKg);
    targetMarker = {
      x: x(target.targetDate + "T12:00:00"),
      y: y(target.targetWeightKg),
    };
  }
  return {
    dots: placed,
    yTicks,
    gridlines: yTicks.map((value) => ({ value, y: y(value) })),
    targetLineY,
    targetMarker,
  };
}
