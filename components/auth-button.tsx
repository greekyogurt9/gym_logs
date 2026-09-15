"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { signInWithGoogle, signOutUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/client";
import { isCloudConfigured } from "@/lib/supabase/env";

// Header auth control. Renders nothing until cloud env vars exist, so V1
// local mode has no login UI at all. Subscribes to auth changes so sign-in
// and sign-out update every open page without a reload.

export default function AuthButton() {
  const [enabled] = useState(isCloudConfigured);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, [enabled]);

  if (!enabled) return null;

  async function onSignIn() {
    setBusy(true);
    setError("");
    try {
      await signInWithGoogle();
      // Google takes over navigation from here on success.
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    setBusy(true);
    setError("");
    try {
      await signOutUser();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-out failed.");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <span className="auth-area">
        <span className="muted small">{user.email}</span>
        <button type="button" className="button-secondary small" onClick={onSignOut} disabled={busy}>
          Sign out
        </button>
        {error && <span className="field-error">{error}</span>}
      </span>
    );
  }

  return (
    <span className="auth-area">
      <button type="button" className="button-secondary small" onClick={onSignIn} disabled={busy}>
        {busy ? "…" : "Sign in with Google"}
      </button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
