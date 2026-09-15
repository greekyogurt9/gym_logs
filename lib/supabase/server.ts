import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requireSupabaseEnv } from "./env";

// Server-side Supabase client for Route Handlers (auth callback).
// Reads the session from cookies; the proxy (proxy.ts) keeps those cookies
// fresh. setAll is best-effort here — Server Components cannot write
// cookies, so failures are swallowed and the proxy does the writing.

export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — ignored, proxy handles it.
        }
      },
    },
  });
}
