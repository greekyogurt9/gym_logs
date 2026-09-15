import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseEnv } from "./env";

// Browser-side Supabase client for Client Components (auth button,
// repository factory). Lightweight to construct — call sites create one
// per use, never a module-global (a global would go stale across users
// and, with Fluid compute, leak sessions between requests).

export function createClient() {
  const { url, key } = requireSupabaseEnv();
  return createBrowserClient(url, key);
}
