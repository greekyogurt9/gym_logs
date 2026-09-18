import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Workout, WorkoutDetail, WorkoutExerciseDetail, WeightMode } from "./types";
import { normalizeWeightMode, weightModeMultiplier } from "./types";
import type {
  ExerciseHistoryPoint,
  ExerciseTarget,
  WorkoutRepository,
} from "./repository";
import { QUALIFYING_REPS_MIN } from "./repository";
import { validateNewWorkout, validateTarget } from "./validation";

// Cloud storage: Postgres via Supabase, behind the same WorkoutRepository
// interface as the local version. Two things to understand here:
//
// 1. The client is INJECTED, not imported. Tests pass a signed-in client
//    pointed at the local stack; the app passes the browser client. Either
//    way every query carries the user's JWT, and RLS decides the rows —
//    the repository never filters by user itself (the database is the
//    authorization layer, not this file).
//
// 2. PostgREST has no multi-table transactions, so createWorkout writes
//    parent -> children in sequence. If a later write fails, the workout
//    row is deleted as compensation (cascades clean up the children), so
//    a failed save never leaves half a workout behind.

export class NotSignedInError extends Error {
  constructor() {
    super("Sign in to use cloud storage.");
    this.name = "NotSignedInError";
  }
}

interface WorkoutRow {
  id: string;
  title: string;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

interface NestedExercise {
  id: string;
  name: string;
}

interface WorkoutExerciseRow {
  id: string;
  workout_id: string;
  exercise_id: string;
  position: number;
  weight_mode?: string | null;
  exercises: NestedExercise | NestedExercise[] | null;
}

interface SetRow {
  id: string;
  workout_exercise_id: string;
  set_number: number;
  weight_kg: number;
  reps: number;
}

function toSummary(row: WorkoutRow): Workout {
  return {
    id: row.id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    createdAt: row.created_at,
  };
}

export function createSupabaseRepository(supabase: SupabaseClient): WorkoutRepository {
  async function requireUser(): Promise<User> {
    // getUser() revalidates with the Auth server — safe to trust server-side
    // decisions on, unlike the locally-cached session payload.
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new NotSignedInError();
    return data.user;
  }

  async function findOrCreateExercise(userId: string, name: string): Promise<string> {
    const { data, error } = await supabase
      .from("exercises")
      .select("id")
      .eq("user_id", userId)
      .eq("name", name)
      .maybeSingle();
    if (error) throw error;
    if (data) return (data as { id: string }).id;
    const { data: created, error: insertError } = await supabase
      .from("exercises")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (insertError) throw insertError;
    return (created as { id: string }).id;
  }

  // workout_exercises.weight_mode is new. Try it first; when the remote DB
  // predates the migration, retry without the column so old backends keep
  // working (rows read back as "total").
  async function insertWorkoutExercise(
    workoutId: string,
    exerciseId: string,
    position: number,
    weightMode: WeightMode,
  ): Promise<string> {
    const withMode = await supabase
      .from("workout_exercises")
      .insert({
        workout_id: workoutId,
        exercise_id: exerciseId,
        position,
        weight_mode: normalizeWeightMode(weightMode),
      })
      .select("id")
      .single();
    if (!withMode.error) return (withMode.data as { id: string }).id;
    if (!/weight_mode/i.test(withMode.error.message)) throw withMode.error;
    const legacy = await supabase
      .from("workout_exercises")
      .insert({ workout_id: workoutId, exercise_id: exerciseId, position })
      .select("id")
      .single();
    if (legacy.error) throw legacy.error;
    return (legacy.data as { id: string }).id;
  }

  return {
    async listWorkouts(): Promise<Workout[]> {
      await requireUser();
      const { data, error } = await supabase
        .from("workouts")
        .select("id, title, started_at, ended_at, created_at")
        .order("started_at", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as WorkoutRow[]).map(toSummary);
    },

    async getWorkout(id: string): Promise<WorkoutDetail | null> {
      await requireUser();
      const { data: workoutData, error: workoutError } = await supabase
        .from("workouts")
        .select("id, title, started_at, ended_at, created_at")
        .eq("id", id)
        .maybeSingle();
      if (workoutError) throw workoutError;
      // maybeSingle returns null (not an error) for missing/invisible rows —
      // invisible includes other users' workouts, which RLS filters out.
      if (!workoutData) return null;
      const workout = workoutData as WorkoutRow;

      // weight_mode is new (per-side toggle migration). Old DBs without the
      // column error here — fall back to the pre-toggle select so reads keep
      // working until `supabase db push` lands the migration.
      let weData: unknown = null;
      {
        const withMode = await supabase
          .from("workout_exercises")
          .select("id, workout_id, exercise_id, position, weight_mode, exercises ( id, name )")
          .eq("workout_id", id)
          .order("position", { ascending: true });
        if (withMode.error && /weight_mode/i.test(withMode.error.message)) {
          const legacy = await supabase
            .from("workout_exercises")
            .select("id, workout_id, exercise_id, position, exercises ( id, name )")
            .eq("workout_id", id)
            .order("position", { ascending: true });
          if (legacy.error) throw legacy.error;
          weData = legacy.data;
        } else {
          if (withMode.error) throw withMode.error;
          weData = withMode.data;
        }
      }
      const weRows = ((weData ?? []) as WorkoutExerciseRow[]);

      let setRows: SetRow[] = [];
      if (weRows.length > 0) {
        const { data: setData, error: setError } = await supabase
          .from("sets")
          .select("id, workout_exercise_id, set_number, weight_kg, reps")
          .in(
            "workout_exercise_id",
            weRows.map((r) => r.id),
          )
          .order("set_number", { ascending: true });
        if (setError) throw setError;
        setRows = (setData ?? []) as SetRow[];
      }

      const exercises: WorkoutExerciseDetail[] = weRows.map((we) => {
        const nested = Array.isArray(we.exercises) ? we.exercises[0] : we.exercises;
        return {
          exercise: {
            id: we.id,
            workoutId: we.workout_id,
            exerciseName: nested?.name ?? "(deleted exercise)",
            position: we.position,
            weightMode: normalizeWeightMode(we.weight_mode),
          },
          sets: setRows
            .filter((s) => s.workout_exercise_id === we.id)
            .map((s) => ({
              id: s.id,
              workoutExerciseId: s.workout_exercise_id,
              setNumber: s.set_number,
              weightKg: s.weight_kg,
              reps: s.reps,
            })),
        };
      });

      return { workout: toSummary(workout), exercises };
    },

    async createWorkout(input: unknown): Promise<Workout> {
      const valid = validateNewWorkout(input);
      const user = await requireUser();

      const { data: workoutData, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          title: valid.title,
          started_at: valid.startedAt,
          ended_at: valid.endedAt ?? null,
        })
        .select("id, title, started_at, ended_at, created_at")
        .single();
      if (workoutError) throw workoutError;
      const workout = workoutData as WorkoutRow;

      try {
        for (let i = 0; i < valid.exercises.length; i++) {
          const ex = valid.exercises[i];
          const exerciseId = await findOrCreateExercise(user.id, ex.exerciseName);
          const workoutExerciseId = await insertWorkoutExercise(
            workout.id,
            exerciseId,
            i,
            normalizeWeightMode(ex.weightMode),
          );
          const { error: setsError } = await supabase.from("sets").insert(
            ex.sets.map((s, j) => ({
              workout_exercise_id: workoutExerciseId,
              set_number: j + 1,
              weight_kg: s.weightKg,
              reps: s.reps,
            })),
          );
          if (setsError) throw setsError;
        }
      } catch (e) {
        // Compensation for no cross-table transaction: remove the parent,
        // cascades clean up exercises-links and sets. Best-effort — the
        // original error is what the caller must see.
        try {
          await supabase.from("workouts").delete().eq("id", workout.id);
        } catch {
          // Ignored: surfacing this would hide the real failure.
        }
        throw e;
      }

      return toSummary(workout);
    },

    async updateWorkout(id: string, input: unknown): Promise<Workout> {
      const valid = validateNewWorkout(input);
      const user = await requireUser();
      // Existence check doubles as ownership check: other users' rows are
      // invisible under RLS, so they correctly report "not found".
      const existing = await supabase
        .from("workouts")
        .select("id, title, started_at, ended_at, created_at")
        .eq("id", id)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) throw new Error("Workout not found.");

      const { error: parentError } = await supabase
        .from("workouts")
        .update({
          title: valid.title,
          started_at: valid.startedAt,
          ended_at: valid.endedAt ?? null,
        })
        .eq("id", id);
      if (parentError) throw parentError;

      // Replace children: delete links (sets cascade), then re-insert.
      // The parent row survives a child failure, so the user can retry the
      // edit — unlike a delete+recreate swap, no duplicate-today risk.
      const { error: clearError } = await supabase
        .from("workout_exercises")
        .delete()
        .eq("workout_id", id);
      if (clearError) throw clearError;

      try {
        for (let i = 0; i < valid.exercises.length; i++) {
          const ex = valid.exercises[i];
          const exerciseId = await findOrCreateExercise(user.id, ex.exerciseName);
          const workoutExerciseId = await insertWorkoutExercise(
            id,
            exerciseId,
            i,
            normalizeWeightMode(ex.weightMode),
          );
          const { error: setsError } = await supabase.from("sets").insert(
            ex.sets.map((s, j) => ({
              workout_exercise_id: workoutExerciseId,
              set_number: j + 1,
              weight_kg: s.weightKg,
              reps: s.reps,
            })),
          );
          if (setsError) throw setsError;
        }
      } catch (e) {
        throw e;
      }

      const { data: fresh, error: freshError } = await supabase
        .from("workouts")
        .select("id, title, started_at, ended_at, created_at")
        .eq("id", id)
        .single();
      if (freshError) throw freshError;
      return toSummary(fresh as WorkoutRow);
    },

    async deleteWorkout(id: string): Promise<void> {
      await requireUser();
      // RLS scopes this to the caller's own rows; unknown ids and other
      // users' ids both delete zero rows — idempotent, like the interface
      // requires, with no existence check to leak.
      const { error } = await supabase.from("workouts").delete().eq("id", id);
      if (error) throw error;
    },

    async getExerciseHistory(exerciseName: string): Promise<ExerciseHistoryPoint[]> {
      const user = await requireUser();
      const name = exerciseName.trim();
      // Exercise id first (RLS-scoped by user_id); unknown names yield [].
      const { data: exData, error: exError } = await supabase
        .from("exercises")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      if (exError) throw exError;
      if (!exData) return [];
      const exerciseId = (exData as { id: string }).id;

      const withModeHistory = await supabase
        .from("workout_exercises")
        .select("id, workout_id, weight_mode, workouts!inner ( started_at )")
        .eq("exercise_id", exerciseId);
      let historyLinks: {
        id: string;
        workout_id: string;
        weight_mode?: string | null;
        workouts: { started_at: string } | { started_at: string }[] | null;
      }[];
      if (withModeHistory.error && /weight_mode/i.test(withModeHistory.error.message)) {
        const legacy = await supabase
          .from("workout_exercises")
          .select("id, workout_id, workouts!inner ( started_at )")
          .eq("exercise_id", exerciseId);
        if (legacy.error) throw legacy.error;
        historyLinks = (legacy.data ?? []) as {
          id: string;
          workout_id: string;
          workouts: { started_at: string } | { started_at: string }[] | null;
        }[];
      } else {
        if (withModeHistory.error) throw withModeHistory.error;
        historyLinks = (withModeHistory.data ?? []) as {
          id: string;
          workout_id: string;
          weight_mode?: string | null;
          workouts: { started_at: string } | { started_at: string }[] | null;
        }[];
      }
      const links = historyLinks;
      if (links.length === 0) return [];

      const { data: setData, error: setError } = await supabase
        .from("sets")
        .select("workout_exercise_id, weight_kg, reps")
        .in(
          "workout_exercise_id",
          links.map((l) => l.id),
        );
      if (setError) throw setError;
      const rows = (setData ?? []) as {
        workout_exercise_id: string;
        weight_kg: number;
        reps: number;
      }[];

      const byWorkout = new Map<
        string,
        { date: string; mult: number; sets: { weightKg: number; reps: number }[] }
      >();
      for (const link of links) {
        const nested = Array.isArray(link.workouts) ? link.workouts[0] : link.workouts;
        if (!nested) continue;
        byWorkout.set(link.id, {
          date: nested.started_at,
          mult: weightModeMultiplier(normalizeWeightMode(link.weight_mode)),
          sets: [],
        });
      }
      for (const s of rows) {
        byWorkout
          .get(s.workout_exercise_id)
          ?.sets.push({ weightKg: s.weight_kg, reps: s.reps });
      }
      return [...byWorkout.values()]
        .map(({ date, mult, sets }) => {
          const qualifying = sets.filter((s) => s.reps >= QUALIFYING_REPS_MIN);
          return {
            date,
            bestTopSetKg:
              qualifying.length > 0 ? Math.max(...qualifying.map((s) => s.weightKg)) : null,
            totalVolumeKg: sets.reduce((n, s) => n + s.weightKg * s.reps * mult, 0),
          };
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    },

    async getTarget(exerciseName: string): Promise<ExerciseTarget | null> {
      const user = await requireUser();
      const name = exerciseName.trim();
      const { data: exData, error: exError } = await supabase
        .from("exercises")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      if (exError) throw exError;
      if (!exData) return null;
      const { data, error } = await supabase
        .from("targets")
        .select("target_weight_kg, target_date")
        .eq("user_id", user.id)
        .eq("exercise_id", (exData as { id: string }).id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as { target_weight_kg: number; target_date: string };
      return { exerciseName: name, targetWeightKg: row.target_weight_kg, targetDate: row.target_date };
    },

    async setTarget(input: unknown): Promise<ExerciseTarget> {
      const valid = validateTarget(input);
      const user = await requireUser();
      const exerciseId = await findOrCreateExercise(user.id, valid.exerciseName);
      // Upsert on (user_id, exercise_id): one active target per exercise.
      const { error } = await supabase.from("targets").upsert(
        {
          user_id: user.id,
          exercise_id: exerciseId,
          target_weight_kg: valid.targetWeightKg,
          target_date: valid.targetDate,
        },
        { onConflict: "user_id,exercise_id" },
      );
      if (error) throw error;
      return { ...valid };
    },

    async deleteTarget(exerciseName: string): Promise<void> {
      const user = await requireUser();
      const name = exerciseName.trim();
      const { data: exData, error: exError } = await supabase
        .from("exercises")
        .select("id")
        .eq("user_id", user.id)
        .eq("name", name)
        .maybeSingle();
      if (exError) throw exError;
      if (!exData) return; // Idempotent: nothing to delete.
      const { error } = await supabase
        .from("targets")
        .delete()
        .eq("user_id", user.id)
        .eq("exercise_id", (exData as { id: string }).id);
      if (error) throw error;
    },
  };
}
