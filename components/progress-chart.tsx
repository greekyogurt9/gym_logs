import { CHART_H, CHART_W, type ChartLayout } from "@/lib/progress";
import type { ExerciseTarget } from "@/lib/repository";
import { formatWorkoutDate } from "@/lib/format";

// Pure-presentational SVG line chart. All math arrives via ChartLayout
// (computed + unit-tested in lib/progress.ts) — this file only draws.
// viewBox scales to any width; pre-scaled coordinates keep text legible.

const GRID = "#e6ddcb";
const LINE = "#1c1a17";
const DOT = "#1c1a17";
const LATEST = "#1c1a17";
const TARGET_LINE = "#1c1a17";
const LABEL = "#8a8172";
const PAPER = "#faf7f1";

export default function ProgressChart({
  layout,
  target,
}: {
  layout: ChartLayout;
  target?: ExerciseTarget | null;
}) {
  const { dots, gridlines, targetLineY, targetMarker } = layout;

  return (
    <svg
      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
      width="100%"
      role="img"
      aria-label={
        dots.length === 0
          ? "No qualifying sessions yet"
          : `Progress: ${dots.length} sessions, latest ${dots[dots.length - 1].valueKg} kg`
      }
    >
      {gridlines.map((g) => (
        <g key={g.value}>
          <line x1={46} x2={CHART_W - 16} y1={g.y} y2={g.y} stroke={GRID} strokeWidth={1} />
          <text x={40} y={g.y + 4} textAnchor="end" fontSize={11} fill={LABEL}>
            {g.value}
          </text>
        </g>
      ))}
      {targetLineY !== null && target && (
        <g>
          <line
            x1={46}
            x2={CHART_W - 16}
            y1={targetLineY}
            y2={targetLineY}
            stroke={TARGET_LINE}
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
          <text
            x={CHART_W - 16}
            y={targetLineY - 6}
            textAnchor="end"
            fontSize={12}
            fill={TARGET_LINE}
          >
            {target.targetWeightKg} kg
          </text>
        </g>
      )}
      {dots.length >= 2 && (
        <polyline
          points={dots.map((d) => `${d.x},${d.y}`).join(" ")}
          fill="none"
          stroke={LINE}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {dots.map((d, i) => (
        <g key={`${d.date}-${i}`}>
          <circle
            cx={d.x}
            cy={d.y}
            r={i === dots.length - 1 ? 6 : 4.5}
            fill={i === dots.length - 1 ? LATEST : DOT}
            stroke={PAPER}
            strokeWidth={2}
          >
            <title>{`${formatWorkoutDate(d.date)} — ${d.valueKg} kg`}</title>
          </circle>
          <text x={d.x} y={CHART_H - 10} textAnchor="middle" fontSize={11} fill={LABEL}>
            {d.label}
          </text>
        </g>
      ))}
      {targetMarker && (
        <circle
          cx={targetMarker.x}
          cy={targetMarker.y}
          r={6}
          fill="none"
          stroke={TARGET_LINE}
          strokeWidth={2}
          strokeDasharray="3 2"
        >
          <title>{`Target ${target?.targetWeightKg} kg by ${target?.targetDate}`}</title>
        </circle>
      )}
    </svg>
  );
}
