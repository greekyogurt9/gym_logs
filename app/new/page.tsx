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
import { isValidationError } from "@/lib/validation";

// Log tab: always "today". No date picker — startedAt is stamped at save
// (create) or preserved (edit-today). Picking a day in create mode drops in
// the 5-exercise template with empty kg/reps; empty rows save as "not
// performed" (skipped), half-filled rows block with a message. After a save,
// returning here loads today's latest workout for editing.

interface SetDraft {
  weight: string;
  reps: string;
}

interface ExerciseDraft {
  name: string;
  sets: SetDraft[];
}

const BLANK_SET: SetDraft = { weight: "", reps: "" };

function blankExercise(): ExerciseDraft {
  return { name: "", sets: [{ ...BLANK_SET }] };
}

function templateFor(dayId: string): ExerciseDraft[] {
  const names = templateExercisesForType(dayId);
  if (names.length === 0) return [blankExercise()];
  return names.map((name) => ({ name, sets: [{ ...BLANK_SET }] }));
}

export default function NewWorkoutPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  // Edit-today: set when today's latest workout is loaded.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingStartedAt, setEditingStartedAt] = useState<string | null>(null);
  const [todayState, setTodayState] = useState<"checking" | "ready">("checking");

  // Mount once: Repeat draft wins; otherwise load today's latest (if any)
  // into edit mode. Client-only, so SSR never sees window state.
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
              name: e.name,
              sets: e.sets.length > 0 ? e.sets.map((s) => ({ ...s })) : [{ ...BLANK_SET }],
            })),
          );
        }
        setTodayState("ready");
        return;
      }
      try {
        const repo = await getWorkoutRepository();
        if (!active) return;
        const rows = await repo.listWorkouts();
        if (!active) return;
        const today = rows.find((w) => isTodayIso(w.startedAt));
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
              name: e.exercise.exerciseName,
              sets: [...e.sets]
                .sort((a, b) => a.setNumber - b.setNumber)
                .map((s) => ({ weight: String(s.weightKg), reps: String(s.reps) })),
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
      exercises.map((ex) => ({ name: ex.name, sets: ex.sets.map((s) => ({ ...s })) })),
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
        {editingId ? " · saving updates today's log" : ""}
      </p>

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
          <section key={i} className="card">
            <div className="card-head">
              <h2>Exercise {i + 1}</h2>
              <button
                type="button"
                className="link-danger"
                onClick={() => setExercises((prev) => prev.filter((_, idx) => idx !== i))}
              >
                Remove
              </button>
            </div>

            <div className="field">
              <label htmlFor={`ex-${i}`}>Name</label>
              <input
                id={`ex-${i}`}
                type="text"
                value={ex.name}
                onChange={(e) => updateExercise(i, { name: e.target.value })}
                placeholder={suggestionsForType(title)[0] ?? "Squat"}
                maxLength={61}
                list={`ex-suggest-${i}`}
                autoComplete="off"
                aria-invalid={!!fieldErrors[`exercises[${i}].exerciseName`]}
              />
              <datalist id={`ex-suggest-${i}`}>
                {suggestionsForType(title).map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {fieldErrors[`exercises[${i}].exerciseName`] && (
                <p className="field-error">{fieldErrors[`exercises[${i}].exerciseName`]}</p>
              )}
            </div>

            {ex.sets.map((s, j) => {
              const wPath = `exercises[${i}].sets[${j}].weightKg`;
              const rPath = `exercises[${i}].sets[${j}].reps`;
              return (
                <div key={j} className="set-row">
                  <span className="set-num">{j + 1}</span>
                  <div className="field">
                    <label htmlFor={`w-${i}-${j}`}>kg</label>
                    <input
                      id={`w-${i}-${j}`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.5"
                      value={s.weight}
                      onChange={(e) => updateSet(i, j, { weight: e.target.value })}
                      aria-invalid={!!fieldErrors[wPath]}
                    />
                    {fieldErrors[wPath] && (
                      <p className="field-error">{fieldErrors[wPath]}</p>
                    )}
                  </div>
                  <div className="field">
                    <label htmlFor={`r-${i}-${j}`}>reps</label>
                    <input
                      id={`r-${i}-${j}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={s.reps}
                      onChange={(e) => updateSet(i, j, { reps: e.target.value })}
                      aria-invalid={!!fieldErrors[rPath]}
                    />
                    {fieldErrors[rPath] && (
                      <p className="field-error">{fieldErrors[rPath]}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="link-danger"
                    aria-label={`Remove set ${j + 1} from exercise ${i + 1}`}
                    onClick={() =>
                      setExercises((prev) =>
                        prev.map((ex2, idx) =>
                          idx === i ? { ...ex2, sets: ex2.sets.filter((_, k) => k !== j) } : ex2,
                        ),
                      )
                    }
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            <button
              type="button"
              className="button-secondary"
              onClick={() =>
                updateExercise(i, { sets: [...ex.sets, { ...BLANK_SET }] })
              }
            >
              Add set
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
                    setExercises((prev) => [...prev, { name: s, sets: [{ ...BLANK_SET }] }])
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
        </div>
      </form>
    </div>
  );
}
