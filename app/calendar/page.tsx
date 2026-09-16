"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildMonthGrid, groupWorkoutsByDay, monthLabel, todayKey } from "@/lib/calendar";
import { iconForTitle } from "@/lib/exercises";
import { formatWorkoutDate } from "@/lib/format";
import { getWorkoutRepository, isCloudConfigured } from "@/lib/get-repository";
import { subscribeToAuthEvents } from "@/lib/supabase/auth";
import type { Workout } from "@/lib/types";

// Calendar: one month grid, dots per day for Legs / Push / Pull.
// Minimal by design — no heatmap scale, no streaks. Tap a day to see its
// workouts below; tapping a workout opens its detail (with Repeat + Edit
// via the Log tab when it's today).

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

export default function CalendarPage() {
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selected, setSelected] = useState<string>(todayKey());
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");
  const [error, setError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

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
    const unsubscribe = subscribeToAuthEvents((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setReloadToken((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const byDay = useMemo(() => groupWorkoutsByDay(workouts), [workouts]);
  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);
  const selectedWorkouts = byDay.get(selected) ?? [];

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  return (
    <div>
      <div className="page-head">
        <h1>Calendar</h1>
        <div className="actions" style={{ marginTop: 0 }}>
          <button type="button" className="button-secondary small" onClick={() => shift(-1)} aria-label="Previous month">
            ←
          </button>
          <button type="button" className="button-secondary small" onClick={() => shift(1)} aria-label="Next month">
            →
          </button>
        </div>
      </div>
      <p className="muted">{monthLabel(year, month)}</p>

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

      {status === "ready" && (
        <>
          <div className="cal-grid" role="group" aria-label="Workout calendar">
            {WEEKDAYS.map((d, i) => (
              <span key={i} className="cal-weekday">
                {d}
              </span>
            ))}
            {cells.map((c) => {
              const day = byDay.get(c.key) ?? [];
              const isSel = c.key === selected;
              const isToday = c.key === todayKey();
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-label={`${c.date.toLocaleDateString()}${day.length > 0 ? `, ${day.map((w) => w.title).join(", ")}` : ""}`}
                  aria-pressed={isSel}
                  className={[
                    "cal-day",
                    c.inMonth ? "" : "cal-day-other",
                    isToday ? "cal-today" : "",
                    isSel ? "cal-selected" : "",
                  ].join(" ")}
                  onClick={() => setSelected(c.key)}
                >
                  <span className="cal-num">{c.date.getDate()}</span>
                  <span className="cal-dots" aria-hidden="true">
                    {day.slice(0, 3).map((w) => (
                      <span key={w.id}>{iconForTitle(w.title) || "•"}</span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>

          <section className="card">
            <div className="card-head">
              <h2>{formatWorkoutDate(`${selected}T12:00:00`)}</h2>
              {selectedWorkouts.length > 0 && (
                <span className="muted small">
                  {selectedWorkouts.map((w) => w.title).join(" · ")}
                </span>
              )}
            </div>
            {selectedWorkouts.length === 0 ? (
              <p className="muted">Rest day — no log.</p>
            ) : (
              <ul className="list" style={{ marginTop: "0.5rem" }}>
                {selectedWorkouts.map((w) => (
                  <li key={w.id}>
                    <Link className="row" href={`/workouts/${w.id}`}>
                      <span className="row-top">
                        <span className="row-title">
                          {iconForTitle(w.title) ? `${iconForTitle(w.title)} ` : ""}
                          {w.title}
                        </span>
                        <span className="muted">{formatWorkoutDate(w.startedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
