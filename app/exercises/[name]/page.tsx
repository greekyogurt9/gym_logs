"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ProgressChart from "@/components/progress-chart";
import { formatWorkoutDate, todayLocalDate } from "@/lib/format";
import { getWorkoutRepository } from "@/lib/get-repository";
import {
  QUALIFYING_REPS_MIN,
  type ExerciseHistoryPoint,
  type ExerciseTarget,
} from "@/lib/repository";
import {
  layoutChart,
  targetStatus,
  toChartModel,
} from "@/lib/progress";
import { isValidationError } from "@/lib/validation";

// Per-exercise progress: "am I lifting higher?" as a line of qualifying
// bests (8+ reps), plus an optional target with a visible gap. Entry point:
// tappable exercise names on the workout detail page.

type LoadState = "loading" | "error" | "ready";

export default function ExerciseProgressPage() {
  const params = useParams();
  const raw = Array.isArray(params.name) ? params.name[0] : (params.name as string);
  const name = decodeURIComponent(raw);

  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ExerciseHistoryPoint[]>([]);
  const [target, setTarget] = useState<ExerciseTarget | null>(null);

  const [editing, setEditing] = useState(false);
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [targetError, setTargetError] = useState("");
  const [savingTarget, setSavingTarget] = useState(false);

  // Mount + retry: like the history page, state updates happen only in async
  // callbacks (never synchronously in the effect body).
  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    let active = true;
    getWorkoutRepository()
      .then(async (repo) => {
        const [h, t] = await Promise.all([
          repo.getExerciseHistory(name),
          repo.getTarget(name),
        ]);
        return { h, t };
      })
      .then(({ h, t }) => {
        if (!active) return;
        setHistory(h);
        setTarget(t);
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Could not load progress.");
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [name, reloadToken]);

  function startEditing() {
    setWeight(target ? String(target.targetWeightKg) : "");
    setDate(target ? target.targetDate : "");
    setFieldErrors({});
    setTargetError("");
    setEditing(true);
  }

  async function onSaveTarget(e: React.FormEvent) {
    e.preventDefault();
    setSavingTarget(true);
    setFieldErrors({});
    setTargetError("");
    try {
      const repo = await getWorkoutRepository();
      const saved: ExerciseTarget = await repo.setTarget({
        exerciseName: name,
        targetWeightKg: Number(weight),
        targetDate: date,
      });
      setTarget({ ...saved });
      setEditing(false);
    } catch (err: unknown) {
      if (isValidationError(err)) {
        const mapped: Record<string, string> = {};
        for (const issue of err.issues) {
          if (!(issue.path in mapped)) mapped[issue.path] = issue.message;
        }
        setFieldErrors(mapped);
      } else {
        setTargetError(err instanceof Error ? err.message : "Could not save target.");
      }
    } finally {
      setSavingTarget(false);
    }
  }

  async function onDeleteTarget() {
    if (!window.confirm(`Remove the target for ${name}?`)) return;
    setTargetError("");
    try {
      const repo = await getWorkoutRepository();
      await repo.deleteTarget(name);
      setTarget(null);
    } catch (e: unknown) {
      setTargetError(e instanceof Error ? e.message : "Could not delete target.");
    }
  }

  if (status === "loading") return <p className="muted">Loading…</p>;
  if (status === "error") {
    return (
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
    );
  }

  const model = toChartModel(history, target);
  const statusInfo = targetStatus(history, target, todayLocalDate());
  const bests = history.map((p) => p.bestTopSetKg).filter((v): v is number => v !== null);
  const currentBest = bests.length > 0 ? Math.max(...bests) : null;
  const lastDate = history.length > 0 ? history[history.length - 1].date : null;

  return (
    <div>
      <Link className="back" href="/">
        ← History
      </Link>
      <h1>{name}</h1>
      <p className="muted">
        Best of {QUALIFYING_REPS_MIN}+ reps per session
        {history.length > 0 && ` · ${history.length} session${history.length === 1 ? "" : "s"}`}
      </p>

      {model.dots.length < 2 ? (
        <div className="empty">
          <p>Not enough data for a line yet.</p>
          <p className="muted">Log sets of {QUALIFYING_REPS_MIN}+ reps once more to draw it.</p>
        </div>
      ) : (
        <div className="card">
          <ProgressChart layout={layoutChart(model, target)} target={target} />
        </div>
      )}

      <div className="stats-row">
        <div className="stat">
          <span className="stat-value">{currentBest !== null ? `${currentBest} kg` : "—"}</span>
          <span className="muted small">current best</span>
        </div>
        <div className="stat">
          <span className="stat-value">{history.length}</span>
          <span className="muted small">sessions</span>
        </div>
        <div className="stat">
          <span className="stat-value">{lastDate ? formatWorkoutDate(lastDate) : "—"}</span>
          <span className="muted small">last trained</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Target</h2>
          {target && !editing && (
            <button type="button" className="link-danger" onClick={onDeleteTarget}>
              Remove
            </button>
          )}
        </div>

        {targetError && (
          <div className="error-box" role="alert">
            <p>{targetError}</p>
          </div>
        )}

        {!target && !editing && (
          <>
            <p className="muted">No target yet. Give yourself a number and a date.</p>
            <button type="button" className="button-secondary" onClick={startEditing}>
              Set target
            </button>
          </>
        )}

        {target && !editing && (
          <>
            <p>
              <strong>
                {target.targetWeightKg} kg by {formatWorkoutDate(target.targetDate + "T12:00:00")}
              </strong>
            </p>
            {statusInfo.kind === "hit" && <p className="success-text">Hit it 🎉 — set the next one.</p>}
            {statusInfo.kind === "ahead" && (
              <p className="muted">
                {statusInfo.gapKg} kg to go.
              </p>
            )}
            {statusInfo.kind === "overdue" && (
              <p className="field-error">
                {statusInfo.gapKg} kg short and past the date — adjust?
              </p>
            )}
            <button type="button" className="button-secondary" onClick={startEditing}>
              Edit
            </button>
          </>
        )}

        {editing && (
          <form onSubmit={onSaveTarget} noValidate>
            <div className="field">
              <label htmlFor="target-weight">Weight (kg)</label>
              <input
                id="target-weight"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                aria-invalid={!!fieldErrors["targetWeightKg"]}
              />
              {fieldErrors["targetWeightKg"] && (
                <p className="field-error">{fieldErrors["targetWeightKg"]}</p>
              )}
            </div>
            <div className="field">
              <label htmlFor="target-date">By date</label>
              <input
                id="target-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!fieldErrors["targetDate"]}
              />
              {fieldErrors["targetDate"] && (
                <p className="field-error">{fieldErrors["targetDate"]}</p>
              )}
            </div>
            <div className="actions">
              <button type="submit" className="button" disabled={savingTarget}>
                {savingTarget ? "Saving…" : "Save target"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {history.length > 0 && (
        <section className="card">
          <h2>Sessions</h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Best (8+)</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((p) => (
                <tr key={p.date}>
                  <td>{formatWorkoutDate(p.date)}</td>
                  <td>{p.bestTopSetKg !== null ? `${p.bestTopSetKg} kg` : "—"}</td>
                  <td>{Math.round(p.totalVolumeKg)} kg</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
