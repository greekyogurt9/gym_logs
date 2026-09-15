"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatWorkoutDate } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
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
          <h1>{workout.title}</h1>
          <p className="muted">{formatWorkoutDate(workout.startedAt)}</p>
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

      {error && (
        <div className="error-box" role="alert">
          <p>{error}</p>
        </div>
      )}

      {exercises.map(({ exercise, sets }) => (
        <section key={exercise.id} className="card">
          <h2>{exercise.exerciseName}</h2>
          <ol className="sets">
            {sets.map((s) => (
              <li key={s.id}>
                Set {s.setNumber} — {s.weightKg} kg × {s.reps} reps
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
