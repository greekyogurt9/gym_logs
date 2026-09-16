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

/** Local calendar key YYYY-MM-DD for a Date (calendar + edit-today). */
export function localDayKeyFromDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO timestamp -> local YYYY-MM-DD, or "" when unparseable. */
export function localDayKeyFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localDayKeyFromDate(d);
}

/** True when the ISO timestamp falls on today's local calendar day. */
export function isTodayIso(iso: string): boolean {
  const key = localDayKeyFromIso(iso);
  return key !== "" && key === localDayKeyFromDate(new Date());
}
