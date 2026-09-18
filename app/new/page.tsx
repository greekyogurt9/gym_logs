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
import { normalizeWeightMode } from "@/lib/types";
import { isValidationError } from "@/lib/validation";

// Log tab: always "today". Compact rows (first set inline with the name,
// later sets aligned kg-under-kg / reps-under-reps), per-exercise
// Total-vs-Per-side toggle (barbell vs dumbbell), per-exercise lock tick,
// and drag/up-down reorder. Saving in edit mode updates today's log in
// place (append-friendly); saving in create mode merges into today's log
// when the day matches instead of silently forking a second row.

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

  function moveExercise(i: number, dir: -1 | 1) {
    setExercises((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
    // Indices shifted — stale per-field errors would highlight the wrong row.
    setFieldErrors({});
  }

  function onDragStart(i: number) {
    setDragIndex(i);
  }

  function onDropExercise(i: number) {
    setExercises((prev) => {
      if (dragIndex === null || dragIndex === i) return prev;
      const next = [...prev];
      const [item] = next.splice(dragIndex, 1);
      next.splice(i, 0, item);
      return next;
    });
    setDragIndex(null);
    setFieldErrors({});
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
        // Create-path safety net (the reported "earlier log disappeared"
        // case): if a same-day log with the SAME day title appeared since
        // mount (second tab, slow load, Repeat draft), APPEND to it instead
        // of forking a second today-row. Different-day titles still create
        // their own row (Push morning + Legs evening stays two logs).
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
    <div>
      <Link className="back" href="/">
        ← History
      </Link>
      <h1>{editingId ? "Today's workout" : "New workout"}</h1>
      <p className="muted small">
        {formatWorkoutDate(new Date().toISOString())} · logged for today automatically
        {editingId ? " · saving updates today's log (adds, edits, deletes kept)" : ""}
      </p>

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
            className={`card ex-card${ex.locked ? " ex-locked" : ""}`}
            aria-label={`Exercise ${i + 1}${ex.name ? `: ${ex.name}` : ""}`}
            onDragOver={(e) => {
              if (dragIndex !== null) e.preventDefault();
            }}
            onDrop={() => onDropExercise(i)}
          >
            <div className="ex-toolbar">
              <span
                className="drag-handle"
                title="Drag to reorder (or use ↑ ↓)"
                aria-label={`Reorder exercise ${i + 1}`}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragEnd={() => setDragIndex(null)}
              >
                ⋮⋮
              </span>
              <span className="ex-pos">
                {i + 1}
              </span>
              <div className="ex-tools">
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move exercise ${i + 1} up`}
                  title="Move up"
                  disabled={i === 0}
                  onClick={() => moveExercise(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Move exercise ${i + 1} down`}
                  title="Move down"
                  disabled={i === exercises.length - 1}
                  onClick={() => moveExercise(i, 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={`icon-btn lock-btn${ex.locked ? " is-locked" : ""}`}
                  aria-label={
                    ex.locked
                      ? `Unlock exercise ${i + 1} to edit`
                      : `Lock exercise ${i + 1} (tick to protect from edits)`
                  }
                  title={ex.locked ? "Unlock to edit" : "✓ Lock — protect from accidental edits"}
                  aria-pressed={ex.locked}
                  onClick={() => updateExercise(i, { locked: !ex.locked })}
                >
                  {ex.locked ? "✏️" : "✓"}
                </button>
                <button
                  type="button"
                  className="link-danger"
                  aria-label={`Remove exercise ${i + 1}`}
                  onClick={() => {
                    setExercises((prev) =>
                      prev.length === 1 ? [blankExercise()] : prev.filter((_, idx) => idx !== i),
                    );
                    setFieldErrors({});
                  }}
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Compact grid: first set sits inline with the name; later sets
                align kg-under-kg / reps-under-reps. */}
            <div className="compact-head" aria-hidden="true">
              <span>Exercise</span>
              <span>kg</span>
              <span>reps</span>
              <span />
            </div>

            {ex.sets.map((s, j) => {
              const wPath = `exercises[${i}].sets[${j}].weightKg`;
              const rPath = `exercises[${i}].sets[${j}].reps`;
              const isFirst = j === 0;
              return (
                <div key={j} className="compact-row">
                  <div className="compact-name">
                    {isFirst ? (
                      <>
                        <input
                          id={`ex-${i}`}
                          type="text"
                          value={ex.name}
                          onChange={(e) => updateExercise(i, { name: e.target.value })}
                          placeholder={suggestionsForType(title)[0] ?? "Squat"}
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
                      </>
                    ) : (
                      <span className="set-num" aria-hidden="true">
                        {j + 1}
                      </span>
                    )}
                  </div>
                  <div className="compact-field">
                    <input
                      id={isFirst ? `w-${i}-${j}` : `w-${i}-${j}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={s.weight}
                      onChange={(e) => updateSet(i, j, { weight: e.target.value })}
                      aria-label={`Exercise ${i + 1} set ${j + 1} weight kg`}
                      aria-invalid={!!fieldErrors[wPath]}
                      disabled={ex.locked}
                    />
                  </div>
                  <div className="compact-field">
                    <input
                      id={`r-${i}-${j}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={s.reps}
                      onChange={(e) => updateSet(i, j, { reps: e.target.value })}
                      aria-label={`Exercise ${i + 1} set ${j + 1} reps`}
                      aria-invalid={!!fieldErrors[rPath]}
                      disabled={ex.locked}
                    />
                  </div>
                  <div className="compact-x">
                    {ex.sets.length > 1 ? (
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Remove set ${j + 1} from exercise ${i + 1}`}
                        disabled={ex.locked}
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
                        ✕
                      </button>
                    ) : (
                      <span className="set-num" aria-hidden="true">
                        1
                      </span>
                    )}
                  </div>
                  {(fieldErrors[wPath] ||
                    fieldErrors[rPath] ||
                    (isFirst && fieldErrors[`exercises[${i}].exerciseName`])) && (
                    <div className="compact-errors">
                      {isFirst && fieldErrors[`exercises[${i}].exerciseName`] && (
                        <p className="field-error">
                          {fieldErrors[`exercises[${i}].exerciseName`]}
                        </p>
                      )}
                      {fieldErrors[wPath] && <p className="field-error">{fieldErrors[wPath]}</p>}
                      {fieldErrors[rPath] && <p className="field-error">{fieldErrors[rPath]}</p>}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="ex-foot">
              <div
                className="mini-segment"
                role="group"
                aria-label={`Weight type for exercise ${i + 1}`}
              >
                <button
                  type="button"
                  className={ex.weightMode === "total" ? "mini-on" : ""}
                  aria-pressed={ex.weightMode === "total"}
                  disabled={ex.locked}
                  title="Barbell / machine — both hands share one load"
                  onClick={() => updateExercise(i, { weightMode: "total" })}
                >
                  Total
                </button>
                <button
                  type="button"
                  className={ex.weightMode === "per_side" ? "mini-on" : ""}
                  aria-pressed={ex.weightMode === "per_side"}
                  disabled={ex.locked}
                  title="Dumbbell / unilateral — kg is one side (one hand)"
                  onClick={() => updateExercise(i, { weightMode: "per_side" })}
                >
                  Per side
                </button>
              </div>
              <span className="muted small" title="How the kg is read">
                {ex.weightMode === "per_side"
                  ? "DB · kg per hand (volume ×2)"
                  : "BB · kg total"}
              </span>
              <button
                type="button"
                className="button-secondary small"
                disabled={ex.locked}
                onClick={() => updateExercise(i, { sets: [...ex.sets, { ...BLANK_SET }] })}
              >
                + Set
              </button>
            </div>
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

        <div className="actions">
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
