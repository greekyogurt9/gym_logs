// Tiny presentational helpers. No business logic here — that lives in lib/.

export function formatWorkoutDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Local YYYY-MM-DD for <input type="date"> (UTC slicing can shift the day). */
export function todayLocalDate(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Date-input value -> ISO timestamp (local noon avoids timezone day-shifts).
 * Passes garbage through untouched so the validator — not this helper —
 * produces the error message.
 */
export function dateInputToIso(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toISOString();
}
