"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthButton from "@/components/auth-button";
import { isCloudConfigured } from "@/lib/get-repository";

// Account screen: who am I, sign in/out, privacy. Deliberately a page, not
// a modal sheet — same patterns as every other screen, no new interaction
// model to learn or test.

export default function AccountPage() {
  const [cloud] = useState(isCloudConfigured);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div>
      <h1>You</h1>
      {!ready ? (
        <p className="muted">Loading…</p>
      ) : !cloud ? (
        <div className="card">
          <p>Cloud is not configured on this build.</p>
          <p className="muted small">
            Workouts stay in this browser. Add Supabase env vars to enable sign-in.
          </p>
        </div>
      ) : (
        <div className="card">
          <AuthButton />
        </div>
      )}
      <div className="card">
        <Link className="link-accent" href="/privacy">
          Privacy →
        </Link>
      </div>
    </div>
  );
}
