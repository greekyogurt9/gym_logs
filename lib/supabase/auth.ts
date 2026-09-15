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
