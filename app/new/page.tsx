"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { cleanDraftExercises, takeDraft } from "@/lib/draft";
import {
  isWorkoutTypeId,
  suggestionsForType,
  templateExercisesForType,
  WORKOUT_TYPES,
} from "@/lib/exercises";
import { formatWorkoutDate, isTodayIso } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
import type { WeightMode } from "@/lib/types";
import { normalizeWeightMode, weightModeMultiplier } from "@/lib/types";
import { isValidationError } from "@/lib/validation";

// Log tab — Hevy/Strong-standard compact logger.
// Pattern (industry standard, distilled from Hevy + Strong 2026):
//   Exercise title on its own header row (never inline with a set),
//   then a tight SET | KG | REPS table with hairline rows, big centered
//   tabular numerals, one quiet "+ Add set" row, and a ⋮⋮ handle + ↑↓
//   fallback for reorder. Previous best ghosts under the header (tap to
//   fill); Total-vs-Per-side pill lives in the meta row (barbell vs
//   dumbbell); ✓ locks the card against fat-finger edits.

interface SetDraft {
  weight: string;
  reps: string;
}

interface ExerciseDraft {
  key: string;
  name: string;
  weightMode: WeightMode;
  sets: SetDraft[];
  locked: boolean;
}

const BLANK_SET: SetDraft = { weight: "", reps: "" };

function newKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
  }
}

/** Dumbbell-style moves default to per-side; everything else totals. */
function defaultWeightModeForName(name: string): WeightMode {
  const n = name.toLowerCase();
  if (
    n.includes("dumbbell") ||
    n.includes("lateral raise") ||
    n.includes("hammer curl") ||
    n.includes("chest fly") ||
    n === "chest fly"
  ) {
    return "per_side";
  }
  return "total";
}

function blankExercise(): ExerciseDraft {
  return { key: newKey(), name: "", weightMode: "total", sets: [{ ...BLANK_SET }], locked: false };
}

function templateFor(dayId: string): ExerciseDraft[] {
  const names = templateExercisesForType(dayId);
  if (names.length === 0) return [blankExercise()];
  return names.map((name) => ({
    key: newKey(),
    name,
    weightMode: defaultWeightModeForName(name),
    sets: [{ ...BLANK_SET }],
    locked: false,
  }));
}

/** Previous-best ghost: "Last: 60 kg". Tap fills empty kg fields. Debounced
 *  so typing a name doesn't fire a query per keystroke. Decoration only —
 *  failures stay silent. */
function PrevHint({
  name,
  onFill,
  disabled,
}: {
  name: string;
  onFill: (kg: number) => void;
  disabled: boolean;
}) {
  const [best, setBest] = useState<number | null>(null);
  useEffect(() => {
    let active = true;
    const trimmed = name.trim();
    const t = setTimeout(() => {
      if (!active) return;
      if (trimmed.length < 2) {
        setBest(null);
        return;
      }
      getWorkoutRepository()
        .then((repo) => repo.getExerciseHistory(trimmed))
        .then((h) => {
          if (!active) return;
          const bests = h
            .map((p) => p.bestTopSetKg)
            .filter((v): v is number => v !== null);
          setBest(bests.length > 0 ? Math.max(...bests) : null);
        })
        .catch(() => {
          if (active) setBest(null);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [name]);

  if (best === null) return null;
  return (
    <button
      type="button"
      className="hv-prev"
      disabled={disabled}
      title="Tap to fill empty sets with your last best"
      onClick={() => onFill(best)}
    >
      Last: {best} kg
    </button>
  );
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Edit-today: set when today's latest workout is loaded.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStartedAt, setEditingStartedAt] = useState<string | null>(null);
  const [todayState, setTodayState] = useState<"checking" | "ready">("checking");
  const [todayCount, setTodayCount] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  // Mount once: Repeat draft wins; otherwise load today's latest (if any)
  // into edit mode. Loaded rows start LOCKED so old inputs can't be
  // fat-fingered mid-session — tap ✓/✏️ to toggle. Client-only, so SSR
  // never sees window state.
  useEffect(() => {
    let active = true;
    (async () => {
      const draft = takeDraft();
      if (!active) return;
      if (draft) {
        setTitle(draft.title);
        if (draft.exercises.length > 0) {
          setExercises(
            draft.exercises.map((e) => ({
              key: newKey(),
              name: e.name,
              weightMode: normalizeWeightMode(e.weightMode),
              sets: e.sets.length > 0 ? e.sets.map((s) => ({ ...s })) : [{ ...BLANK_SET }],
              locked: false,
            })),
          );
        }
        setTodayState("ready");
        try {
          const repo = await getWorkoutRepository();
          if (!active) return;
          const rows = await repo.listWorkouts();
          if (!active) return;
          setTodayCount(rows.filter((w) => isTodayIso(w.startedAt)).length);
        } catch {
          // Count is decoration — blank is fine.
        }
        return;
      }
      try {
        const repo = await getWorkoutRepository();
        if (!active) return;
        const rows = await repo.listWorkouts();
        if (!active) return;
        const todays = rows.filter((w) => isTodayIso(w.startedAt));
        setTodayCount(todays.length);
        const today = todays[0] ?? rows.find((w) => isTodayIso(w.startedAt));
        if (!today) return;
        const detail = await repo.getWorkout(today.id);
        if (!active || !detail) return;
        setTitle(detail.workout.title);
        setEditingId(detail.workout.id);
        setEditingStartedAt(detail.workout.startedAt);
        const sorted = [...detail.exercises].sort(
          (a, b) => a.exercise.position - b.exercise.position,
        );
        if (sorted.length > 0) {
          setExercises(
            sorted.map((e) => ({
              key: newKey(),
              name: e.exercise.exerciseName,
              weightMode: normalizeWeightMode(e.exercise.weightMode),
              sets: [...e.sets]
                .sort((a, b) => a.setNumber - b.setNumber)
                .map((s) => ({ weight: String(s.weightKg), reps: String(s.reps) })),
              locked: true,
            })),
          );
        }
      } catch {
        // Log tab never bricks: fall back to a blank create form.
      } finally {
        if (active) setTodayState("ready");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  function pickDay(id: string) {
    setTitle(id);
    // Template only when creating — renaming today's log must not wipe it.
    if (!editingId) setExercises(templateFor(id));
  }

  function updateExercise(i: number, patch: Partial<ExerciseDraft>) {
    setExercises((prev) => prev.map((ex, idx) => (idx === i ? { ...ex, ...patch } : ex)));
  }

  function updateSet(ei: number, si: number, patch: Partial<SetDraft>) {
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === ei
          ? { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) }
          : ex,
      ),
    );
  }

  function fillEmptyKg(i: number, kg: number) {
    setExercises((prev) =>
      prev.map((ex, idx) =>
        idx === i
          ? {
              ...ex,
              sets: ex.sets.map((s) => (s.weight.trim() === "" ? { ...s, weight: String(kg) } : s)),
            }
          : ex,
      ),
    );
  }

  function moveExerciseTo(from: number, to: number) {
    if (from === to) return;
    setExercises((prev) => {
      if (from < 0 || from >= prev.length || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    // Indices shifted — stale per-field errors would highlight the wrong row.
    setFieldErrors({});
  }

  function onDragStart(i: number) {
    setDragIndex(i);
  }

  function onDropExercise(i: number) {
    if (dragIndex !== null) moveExerciseTo(dragIndex, i);
    setDragIndex(null);
    setDropTarget(null);
  }

  async function onDeleteToday() {
    if (!editingId) return;
    if (!window.confirm("Delete today's log? This cannot be undone.")) return;
    setDeleting(true);
    setFormError("");
    try {
      const repo = await getWorkoutRepository();
      await repo.deleteWorkout(editingId);
      setEditingId(null);
      setEditingStartedAt(null);
      setTodayCount(0);
      setTitle("");
      setExercises([blankExercise()]);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Could not delete today's log.");
    } finally {
      setDeleting(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError("");
    if (!isWorkoutTypeId(title.trim())) {
      setFieldErrors({ title: "Pick a workout day: Legs, Push, Pull." });
      setSaving(false);
      return;
    }
    const { cleaned, fieldErrors: cleanErrors } = cleanDraftExercises(
      exercises.map((ex) => ({
        name: ex.name,
        weightMode: ex.weightMode,
        sets: ex.sets.map((s) => ({ ...s })),
      })),
    );
    if (Object.keys(cleanErrors).length > 0) {
      setFieldErrors(cleanErrors);
      setSaving(false);
      return;
    }
    if (cleaned.length === 0) {
      setFormError("Log at least 1 set — empty rows don't count.");
      setSaving(false);
      return;
    }
    try {
      const repo = await getWorkoutRepository();
      if (editingId && editingStartedAt) {
        await repo.updateWorkout(editingId, {
          title: title.trim(),
          startedAt: editingStartedAt,
          exercises: cleaned,
        });
      } else {
        // Create-path safety net: if a same-day log with the SAME day title
        // appeared since mount, APPEND to it instead of forking a duplicate.
        const rows = await repo.listWorkouts();
        const sameDay = rows
          .filter((w) => isTodayIso(w.startedAt))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        const match = sameDay.find((w) => w.title === title.trim());
        if (match) {
          const detail = await repo.getWorkout(match.id);
          if (detail) {
            const existing = [...detail.exercises]
              .sort((a, b) => a.exercise.position - b.exercise.position)
              .map((ex) => ({
                exerciseName: ex.exercise.exerciseName,
                weightMode: normalizeWeightMode(ex.exercise.weightMode),
                sets: [...ex.sets]
                  .sort((a, b) => a.setNumber - b.setNumber)
                  .map((s) => ({ weightKg: s.weightKg, reps: s.reps })),
              }));
            await repo.updateWorkout(match.id, {
              title: detail.workout.title,
              startedAt: detail.workout.startedAt,
              exercises: [...existing, ...cleaned],
            });
            router.push("/");
            return;
          }
        }
        await repo.createWorkout({
          title: title.trim(),
          startedAt: new Date().toISOString(),
          exercises: cleaned,
        });
      }
      router.push("/");
    } catch (err: unknown) {
      if (isValidationError(err)) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!(issue.path in mapped)) mapped[issue.path] = issue.message;
        }
        setFieldErrors(mapped);
      } else {
        // Storage failure (quota, blocked cookies, …): keep the draft intact.
        setFormError(
          err instanceof Error ? err.message : "Could not save. Your entries are kept below.",
        );
      }
      setSaving(false);
    }
  }

  const remainingSuggestions = title
    ? suggestionsForType(title).filter(
        (s) => !exercises.some((e) => e.name.trim().toLowerCase() === s.toLowerCase()),
      )
    : [];

  // Live session stats from filled rows only (Hevy-style header).
  let liveSets = 0;
  let liveVolume = 0;
  for (const ex of exercises) {
    const mult = weightModeMultiplier(ex.weightMode);
    for (const s of ex.sets) {
      const w = Number(s.weight);
      const r = Number(s.reps);
      if (s.weight.trim() !== "" && s.reps.trim() !== "" && Number.isFinite(w) && Number.isFinite(r)) {
        liveSets += 1;
        liveVolume += w * r * mult;
      }
    }
  }

  if (todayState === "checking") {
    return (
      <div>
        <Link className="back" href="/">
          ← History
        </Link>
        <p className="muted">Loading today&apos;s workout…</p>
      </div>
    );
  }

  return (
    <div className="log-page">
      <Link className="back" href="/">
        ← History
      </Link>
      <div className="log-head">
        <div>
          <h1>{editingId ? "Today's workout" : "New workout"}</h1>
          <p className="muted small">
            {formatWorkoutDate(new Date().toISOString())} · today automatically
          </p>
        </div>
        <div className="log-stats" aria-live="polite">
          <span>
            <strong>{exercises.length}</strong> ex
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{liveSets}</strong> sets
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <strong>{Math.round(liveVolume).toLocaleString()}</strong> kg
          </span>
        </div>
      </div>

      {todayCount > 1 && (
        <div className="error-box" role="note">
          <p>
            You have {todayCount} logs today — editing the latest here. Open History to edit or
            delete the others.
          </p>
        </div>
      )}

      {formError && (
        <div className="error-box" role="alert">
          <p>{formError}</p>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <fieldset className="field">
          <legend>Day</legend>
          <div className="segment" role="radiogroup" aria-invalid={!!fieldErrors["title"]}>
            {WORKOUT_TYPES.map((t) => (
              <label key={t.id} className={title === t.id ? "segment-on" : ""}>
                <input
                  type="radio"
                  name="day"
                  value={t.id}
                  checked={title === t.id}
                  onChange={() => pickDay(t.id)}
                />
                <span className="segment-icon" aria-hidden="true">
                  {t.icon}
                </span>
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          {fieldErrors["title"] && <p className="field-error">{fieldErrors["title"]}</p>}
        </fieldset>

        {fieldErrors["exercises"] && (
          <p className="field-error">{fieldErrors["exercises"]}</p>
        )}

        {exercises.map((ex, i) => (
          <section
            key={ex.key}
            data-ex-index={i}
            className={`card hv-card${ex.locked ? " is-locked" : ""}${dragIndex === i ? " is-dragging" : ""}${dropTarget === i && dragIndex !== null && dropTarget !== dragIndex ? " is-drop-target" : ""}`}
            aria-label={`Exercise ${i + 1}${ex.name ? `: ${ex.name}` : ""}`}
            onDragOver={(e) => {
              if (dragIndex !== null) e.preventDefault();
            }}
            onDrop={() => onDropExercise(i)}
          >
            {/* Title row: hamburger grip + heading name + lock + dustbin.
                Single drag path (hold the grip to slide); no arrow buttons. */}
            <div className="hv-title">
              <span
                className="hv-grip"
                title="Hold and drag to reorder"
                aria-label={`Hold and drag to reorder exercise ${i + 1}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropTarget(null);
                }}
                onTouchStart={() => onDragStart(i)}
                onTouchMove={(e) => {
                  const t = e.touches[0];
                  if (!t) return;
                  const el = document
                    .elementFromPoint(t.clientX, t.clientY)
                    ?.closest?.("[data-ex-index]");
                  if (el) {
                    const idx = Number((el as HTMLElement).dataset.exIndex);
                    if (Number.isFinite(idx)) setDropTarget(idx);
                  }
                }}
                onTouchEnd={() => {
                  if (dragIndex !== null && dropTarget !== null) {
                    moveExerciseTo(dragIndex, dropTarget);
                  }
                  setDragIndex(null);
                  setDropTarget(null);
                }}
              >
                ☰
              </span>
              <input
                className="hv-name"
                type="text"
                value={ex.name}
                onChange={(e) => updateExercise(i, { name: e.target.value })}
                placeholder={suggestionsForType(title)[i] ?? suggestionsForType(title)[0] ?? "Exercise name"}
                maxLength={61}
                list={`ex-suggest-${i}`}
                autoComplete="off"
                disabled={ex.locked}
                aria-label={`Exercise ${i + 1} name`}
                aria-invalid={!!fieldErrors[`exercises[${i}].exerciseName`]}
              />
              <datalist id={`ex-suggest-${i}`}>
                {suggestionsForType(title).map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <button
                type="button"
                className={`hv-lock${ex.locked ? " on" : ""}`}
                aria-label={ex.locked ? `Unlock exercise ${i + 1}` : `Lock exercise ${i + 1}`}
                title={ex.locked ? "Unlock to edit" : "✓ Lock — protect from accidental edits"}
                aria-pressed={ex.locked}
                onClick={() => updateExercise(i, { locked: !ex.locked })}
              >
                {ex.locked ? "🔒" : "✓"}
              </button>
              <button
                type="button"
                className="hv-del-ex"
                aria-label={`Delete exercise ${i + 1}`}
                title="Delete exercise"
                onClick={() => {
                  setExercises((prev) =>
                    prev.length === 1 ? [blankExercise()] : prev.filter((_, idx) => idx !== i),
                  );
                  setFieldErrors({});
                }}
              >
                🗑️
              </button>
            </div>
            {fieldErrors[`exercises[${i}].exerciseName`] && (
              <p className="field-error hv-err">{fieldErrors[`exercises[${i}].exerciseName`]}</p>
            )}

            {/* Meta row: weight type + previous best. Reorder is grip-only. */}
            <div className="hv-meta">
              <div className="hv-pill" role="group" aria-label={`Weight type for exercise ${i + 1}`}>
                <button
                  type="button"
                  className={ex.weightMode === "total" ? "on" : ""}
                  aria-pressed={ex.weightMode === "total"}
                  disabled={ex.locked}
                  title="Barbell / machine — both hands share one load"
                  onClick={() => updateExercise(i, { weightMode: "total" })}
                >
                  Total
                </button>
                <button
                  type="button"
                  className={ex.weightMode === "per_side" ? "on" : ""}
                  aria-pressed={ex.weightMode === "per_side"}
                  disabled={ex.locked}
                  title="Dumbbell — kg is one hand"
                  onClick={() => updateExercise(i, { weightMode: "per_side" })}
                >
                  Per side
                </button>
              </div>
              <span className="muted small hv-mode-hint">
                {ex.weightMode === "per_side" ? "DB · each hand" : "BB · combined"}
              </span>
              <PrevHint name={ex.name} disabled={ex.locked} onFill={(kg) => fillEmptyKg(i, kg)} />
            </div>

            {/* Set table: the compact standard. Columns align down the card. */}
            <div className="hv-cols" aria-hidden="true">
              <span>Set</span>
              <span>kg{ex.weightMode === "per_side" ? " /side" : ""}</span>
              <span>Reps</span>
              <span />
            </div>

            <ol className="hv-sets">
              {ex.sets.map((s, j) => {
                const wPath = `exercises[${i}].sets[${j}].weightKg`;
                const rPath = `exercises[${i}].sets[${j}].reps`;
                const invalid = fieldErrors[wPath] ?? fieldErrors[rPath];
                return (
                  <li key={j} className="hv-row">
                    <span className="hv-setnum">{j + 1}</span>
                    <input
                      className="hv-num"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={s.weight}
                      onChange={(e) => updateSet(i, j, { weight: e.target.value })}
                      aria-label={`Exercise ${i + 1} set ${j + 1} weight`}
                      aria-invalid={!!fieldErrors[wPath]}
                      disabled={ex.locked}
                      placeholder="–"
                    />
                    <input
                      className="hv-num"
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={s.reps}
                      onChange={(e) => updateSet(i, j, { reps: e.target.value })}
                      aria-label={`Exercise ${i + 1} set ${j + 1} reps`}
                      aria-invalid={!!fieldErrors[rPath]}
                      disabled={ex.locked}
                      placeholder="–"
                    />
                    <button
                      type="button"
                      className="hv-del-set"
                      aria-label={`Delete set ${j + 1} from exercise ${i + 1}`}
                      title="Delete set"
                      disabled={ex.locked || ex.sets.length === 1}
                      onClick={() =>
                        setExercises((prev) =>
                          prev.map((ex2, idx) =>
                            idx === i
                              ? { ...ex2, sets: ex2.sets.filter((_, k) => k !== j) }
                              : ex2,
                          ),
                        )
                      }
                    >
                      🗑️
                    </button>
                    {(fieldErrors[wPath] || fieldErrors[rPath]) && (
                      <span className="hv-row-err" role="alert">
                        {invalid}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <button
              type="button"
              className="hv-add"
              disabled={ex.locked}
              onClick={() => updateExercise(i, { sets: [...ex.sets, { ...BLANK_SET }] })}
            >
              + Add set
            </button>
          </section>
        ))}

        {remainingSuggestions.length > 0 && (
          <div className="card">
            <h2>Quick add</h2>
            <p className="muted small">From the {title} catalog — empty sets, skipped unless filled.</p>
            <div className="actions">
              {remainingSuggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="button-secondary small"
                  onClick={() =>
                    setExercises((prev) => [
                      ...prev,
                      {
                        key: newKey(),
                        name: s,
                        weightMode: defaultWeightModeForName(s),
                        sets: [{ ...BLANK_SET }],
                        locked: false,
                      },
                    ])
                  }
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="actions actions-sticky">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setExercises((prev) => [...prev, blankExercise()])}
          >
            Add exercise
          </button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Update today's workout" : "Save workout"}
          </button>
          {editingId && (
            <button
              type="button"
              className="button-danger"
              disabled={deleting || saving}
              onClick={onDeleteToday}
            >
              {deleting ? "Deleting…" : "Delete today"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
