// Supabase environment configuration.
//
// Two vars enable cloud mode (V2+). Either key format works — the newer
// publishable key (sb_publishable_...) is preferred, the legacy anon JWT
// is accepted as a fallback so older dashboards keep working:
//
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY   (preferred)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY          (legacy fallback)
//
// When any required var is missing the app stays in V1 local mode instead
// of crashing: isCloudConfigured() gates the Supabase repository, the
// proxy skips session refresh, and the sign-in button hides itself.
// requireSupabaseEnv() throws a message that points at .env.example —
// code fails fast with directions, never with "undefined is not an object".

export function getSupabaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url && url.length > 0 ? url : undefined;
}

export function getSupabaseKey(): string | undefined {
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (publishable && publishable.length > 0) return publishable;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return anon && anon.length > 0 ? anon : undefined;
}

export function isCloudConfigured(): boolean {
  return getSupabaseUrl() !== undefined && getSupabaseKey() !== undefined;
}

export function requireSupabaseEnv(): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
        "(or NEXT_PUBLIC_SUPABASE_ANON_KEY).",
    );
  }
  return { url, key };
}
