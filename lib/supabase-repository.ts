import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Workout, WorkoutDetail, WorkoutExerciseDetail } from "./types";
import type { WorkoutRepository } from "./repository";
import { validateNewWorkout } from "./validation";

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

      const { data: weData, error: weError } = await supabase
        .from("workout_exercises")
        .select("id, workout_id, exercise_id, position, exercises ( id, name )")
        .eq("workout_id", id)
        .order("position", { ascending: true });
      if (weError) throw weError;
      const weRows = (weData ?? []) as WorkoutExerciseRow[];

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
          const { data: weData, error: weError } = await supabase
            .from("workout_exercises")
            .insert({ workout_id: workout.id, exercise_id: exerciseId, position: i })
            .select("id")
            .single();
          if (weError) throw weError;
          const workoutExerciseId = (weData as { id: string }).id;
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

    async deleteWorkout(id: string): Promise<void> {
      await requireUser();
      // RLS scopes this to the caller's own rows; unknown ids and other
      // users' ids both delete zero rows — idempotent, like the interface
      // requires, with no existence check to leak.
      const { error } = await supabase.from("workouts").delete().eq("id", id);
      if (error) throw error;
    },
  };
}
