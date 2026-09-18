"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { draftFromDetail, saveDraft } from "@/lib/draft";
import { iconForTitle } from "@/lib/exercises";
import { formatWorkoutDate } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
import { browserStorage } from "@/lib/local-storage-repository";
import { workoutVolume } from "@/lib/progress";
import { normalizeWeightMode } from "@/lib/types";
import type { WorkoutDetail } from "@/lib/types";

// Workout detail + delete. Three states beyond loading: storage error,
// unknown id ("not found"), and the workout itself.

export default function WorkoutDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : (params.id as string);
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "error" | "not-found" | "ready">(
    "loading",
  );
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    getWorkoutRepository()
      .then((repo) => repo.getWorkout(id))
      .then((row) => {
        if (!row) {
          setStatus("not-found");
        } else {
          setDetail(row);
          setStatus("ready");
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load this workout.");
        setStatus("error");
      });
  }, [id]);

  async function onDelete() {
    if (!window.confirm("Delete this workout? This cannot be undone.")) return;
    setDeleting(true);
    setError("");
    try {
      const repo = await getWorkoutRepository();
      await repo.deleteWorkout(id);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete this workout.");
      setDeleting(false);
    }
  }

  function onRepeat() {
    if (!detail) return;
    // Clone into the /new form via a one-shot draft (today's date, last
    // session's numbers as the starting point). Draft errors are impossible
    // from our own data — but never let a clone failure brick the page.
    try {
      saveDraft(browserStorage(), draftFromDetail(detail));
    } catch {
      setError("Could not prepare the repeat. Your data is safe — try again.");
      return;
    }
    router.push("/new");
  }

  if (status === "loading") return <p className="muted">Loading…</p>;

  if (status === "error") {
    return (
      <div className="error-box" role="alert">
        <p>{error}</p>
        <Link className="button-secondary" href="/">
          Back to history
        </Link>
      </div>
    );
  }

  if (status === "not-found" || !detail) {
    return (
      <div className="empty">
        <p>Workout not found.</p>
        <p className="muted">It may have been deleted on another tab.</p>
        <Link className="button" href="/">
          Back to history
        </Link>
      </div>
    );
  }

  const { workout, exercises } = detail;

  return (
    <div>
      <Link className="back" href="/">
        ← History
      </Link>
      <div className="page-head">
        <div>
          <h1>
            {iconForTitle(workout.title) ? `${iconForTitle(workout.title)} ` : ""}
            {workout.title}
          </h1>
          <p className="muted">
            {formatWorkoutDate(workout.startedAt)} ·{" "}
            {Math.round(workoutVolume(detail)).toLocaleString()} kg total
          </p>
        </div>
        <button
          type="button"
          className="button-danger"
          onClick={onDelete}
          disabled={deleting}
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      <button type="button" className="button-secondary" onClick={onRepeat}>
        Repeat this workout
      </button>

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}

      {exercises.map(({ exercise, sets }) => {
        const mode = normalizeWeightMode(exercise.weightMode);
        return (
          <section key={exercise.id} className="card">
            <h2>
              <Link
                className="link-accent"
                href={`/exercises/${encodeURIComponent(exercise.exerciseName)}`}
              >
                {exercise.exerciseName}
              </Link>{" "}
              <span className="muted small" title={mode === "per_side" ? "Dumbbell — kg is one side (one hand)" : "Barbell/machine — kg is the total load"}>
                {mode === "per_side" ? "· per side" : ""}
              </span>
            </h2>
            <ol className="sets">
              {sets.map((s) => (
                <li key={s.id} className="set-line">
                  Set {s.setNumber} — {s.weightKg} kg{mode === "per_side" ? " /side" : ""} ×{" "}
                  {s.reps} reps
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
