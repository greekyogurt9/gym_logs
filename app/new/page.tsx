"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { dateInputToIso, todayLocalDate } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
import { isValidationError } from "@/lib/validation";

// New-workout form. Draft state keeps every input as a string (what the
// user typed); numbers are converted only at submit time, so empty fields
// flow into the validator and come back as field messages instead of
// crashing conversion. Form state is never cleared on failure — a save
// error must not eat the workout you just typed in the gym.

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

export default function NewWorkoutPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayLocalDate());
  const [exercises, setExercises] = useState<ExerciseDraft[]>([blankExercise()]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      await getWorkoutRepository().createWorkout({
        title,
        startedAt: dateInputToIso(date),
        exercises: exercises.map((ex) => ({
          exerciseName: ex.name,
          sets: ex.sets.map((s) => ({ weightKg: Number(s.weight), reps: Number(s.reps) })),
        })),
      });
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

  return (
    <div>
      <Link className="back" href="/">
        ← History
      </Link>
      <h1>New workout</h1>

      {formError && (
        <div className="error-box" role="alert">
          <p>{formError}</p>
        </div>
      )}

      <form onSubmit={onSubmit} noValidate>
        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Legs"
            maxLength={81}
            aria-invalid={!!fieldErrors["title"]}
          />
          {fieldErrors["title"] && <p className="field-error">{fieldErrors["title"]}</p>}
        </div>

        <div className="field">
          <label htmlFor="date">Date</label>
          <input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-invalid={!!fieldErrors["startedAt"]}
          />
          {fieldErrors["startedAt"] && (
            <p className="field-error">{fieldErrors["startedAt"]}</p>
          )}
        </div>

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
                placeholder="Squat"
                maxLength={61}
                aria-invalid={!!fieldErrors[`exercises[${i}].exerciseName`]}
              />
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

        <div className="actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setExercises((prev) => [...prev, blankExercise()])}
          >
            Add exercise
          </button>
          <button type="submit" className="button" disabled={saving}>
            {saving ? "Saving…" : "Save workout"}
          </button>
        </div>
      </form>
    </div>
  );
}
