"use client";

import { useEffect, useState } from "react";
import { getLocalRepository, getWorkoutRepository } from "@/lib/get-repository";
import { migrateLocalToCloud } from "@/lib/migrate";

// Explicit local -> cloud move, shown on the history page when a signed-in
// user still has local workouts. One button, three outcomes: success
// (counts + backup note), failure (message, local data untouched), working.
// After success the parent refreshes its list; this banner then hides
// because the local store is empty.

type State =
  | { kind: "loading" }
  | { kind: "ready"; count: number }
  | { kind: "working"; done: number; total: number }
  | { kind: "success"; migrated: number; skipped: number }
  | { kind: "error"; message: string; migrated: number; total: number };

export default function MigrateBanner({ onMigrated }: { onMigrated: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    getLocalRepository()
      .listWorkouts()
      .then((rows) => {
        if (active) setState({ kind: "ready", count: rows.length });
      })
      .catch(() => {
        // Local store unreadable: hide the banner rather than nag.
        if (active) setState({ kind: "ready", count: 0 });
      });
    return () => {
      active = false;
    };
  }, []);

  async function onMigrate() {
    const current =
      state.kind === "ready"
        ? state.count
        : state.kind === "error"
          ? state.total
          : 0;
    setState({ kind: "working", done: 0, total: current });
    try {
      const target = await getWorkoutRepository();
      const result = await migrateLocalToCloud(getLocalRepository(), target);
      if (!result.ok) {
        setState({
          kind: "error",
          message: result.message,
          migrated: result.migrated,
          total: result.total,
        });
        return;
      }
      setState({ kind: "success", migrated: result.migrated, skipped: result.skipped });
      onMigrated();
    } catch (e: unknown) {
      setState({
        kind: "error",
        message: e instanceof Error ? e.message : "Migration failed.",
        migrated: 0,
        total: current,
      });
    }
  }

  if (state.kind === "loading") return null;
  if (state.kind === "ready" && state.count === 0) return null;

  return (
    <section className="card migrate" aria-live="polite">
      {state.kind === "ready" && (
        <>
          <p>
            You have <strong>{state.count} local workout{state.count === 1 ? "" : "s"}</strong>{" "}
            on this device. Move {state.count === 1 ? "it" : "them"} into your account?
          </p>
          <button type="button" className="button" onClick={onMigrate}>
            Upload to my account
          </button>
        </>
      )}
      {state.kind === "working" && (
        <p className="muted">Uploading… your local data stays put until every workout verifies.</p>
      )}
      {state.kind === "success" && (
        <div className="success-box" role="status">
          <p>
            Moved {state.migrated} workout{state.migrated === 1 ? "" : "s"} to your account
            {state.skipped > 0 && ` (${state.skipped} already there, skipped)`}. A backup of
            the originals stays on this device.
          </p>
        </div>
      )}
      {state.kind === "error" && (
        <div className="error-box" role="alert">
          <p>{state.message}</p>
          {state.migrated > 0 && (
            <p className="muted">
              {state.migrated} of {state.total} already moved — retrying skips those.
            </p>
          )}
          <button type="button" className="button-secondary" onClick={onMigrate}>
            Retry
          </button>
        </div>
      )}
    </section>
  );
}
