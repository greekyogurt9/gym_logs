"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatWorkoutDate } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
import type { Workout } from "@/lib/types";

// History list. Client-rendered because V1 storage is localStorage, which
// only exists in the browser. Shows title + date only: per-workout counts
// would need one extra read per row (N+1), a habit we don't want to bake in
// before the Supabase implementation lands in Phase 8.

export default function HistoryPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [error, setError] = useState("");
  // Bumped by Retry to re-run the fetch effect below.
  const [reloadToken, setReloadToken] = useState(0);

  // Fetch-on-mount (+ on retry). State updates happen only in async
  // callbacks with a cancellation guard — never synchronously in the
  // effect body — so no render cascades and no set-state-in-effect lint.
  useEffect(() => {
    let active = true;
    getWorkoutRepository()
      .listWorkouts()
      .then((rows) => {
        if (!active) return;
        setWorkouts(rows);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Could not load workouts.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [reloadToken]);

  return (
    <div>
      <div className="page-head">
        <h1>Workouts</h1>
        <Link className="button" href="/new">
          New workout
        </Link>
      </div>

      {status === "loading" && <p className="muted">Loading…</p>}

      {status === "error" && (
        <div className="error-box" role="alert">
          <p>{error}</p>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setError("");
              setStatus("loading");
              setReloadToken((t) => t + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}

      {status === "ready" && workouts.length === 0 && (
        <div className="empty">
          <p>No workouts yet.</p>
          <p className="muted">Log your first session — it takes under a minute.</p>
          <Link className="button" href="/new">
            Start a workout
          </Link>
        </div>
      )}

      {status === "ready" && workouts.length > 0 && (
        <ul className="list">
          {workouts.map((w) => (
            <li key={w.id}>
              <Link className="row" href={`/workouts/${w.id}`}>
                <span className="row-title">{w.title}</span>
                <span className="muted">{formatWorkoutDate(w.startedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
