import type { AuthChangeEvent } from "@supabase/supabase-js";
import { createClient } from "./client";

// Auth actions for the UI. Pages never touch supabase.auth directly —
// they call these, and the session itself flows through cookies managed
// by the proxy. Google OAuth needs no password storage: Supabase
// exchanges the provider code and mints our session.

export async function signInWithGoogle(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
  // No redirect here: Google takes over navigation on success.
}

export async function signOutUser(): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Signed-in email, or null. Used by pages to adapt (migration banner). */
export async function getSessionEmail(): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

/**
 * Auth transitions for pages that show per-user data (history list).
 * Subscribe to SIGNED_IN/SIGNED_OUT and reload that page's data — a full
 * page reload would also discard drafts on /new, so refresh in place.
 * Call only when cloud is configured (createClient throws otherwise).
 */
export function subscribeToAuthEvents(cb: (event: AuthChangeEvent) => void): () => void {
  const supabase = createClient();
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event) => cb(event));
  return () => subscription.unsubscribe();
}
