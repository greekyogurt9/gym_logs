"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MigrateBanner from "@/components/migrate-banner";
import { formatWorkoutDate } from "@/lib/format";
import { getWorkoutRepository, isCloudConfigured } from "@/lib/get-repository";
import { getSessionEmail, subscribeToAuthEvents } from "@/lib/supabase/auth";
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
  // Signed-in email (null when local mode). Drives the migrate banner and
  // refreshes this page's data on sign in/out — in place, so /new drafts
  // elsewhere are never disturbed.
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Fetch-on-mount (+ on retry). State updates happen only in async
  // callbacks with a cancellation guard — never synchronously in the
  // effect body — so no render cascades and no set-state-in-effect lint.
  useEffect(() => {
    let active = true;
    getWorkoutRepository()
      .then((repo) => repo.listWorkouts())
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

  useEffect(() => {
    if (!isCloudConfigured()) return;
    let active = true;
    getSessionEmail().then((email) => {
      if (active) setUserEmail(email);
    });
    const unsubscribe = subscribeToAuthEvents((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        setReloadToken((t) => t + 1);
        getSessionEmail().then((email) => {
          if (active) setUserEmail(email);
        });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <div>
      <div className="page-head">
        <h1>Workouts</h1>
        <Link className="button" href="/new">
          New workout
        </Link>
      </div>

      {userEmail && (
        <MigrateBanner key={userEmail} onMigrated={() => setReloadToken((t) => t + 1)} />
      )}

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
