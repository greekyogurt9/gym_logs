import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseKey, getSupabaseUrl } from "./env";

// Session refresh for the Next.js proxy (proxy.ts at the project root).
// Every request gets a fresh access token: the proxy reads the session
// cookie, refreshes it when expired, and writes the new cookies back to
// BOTH the request (so Server Components see the fresh session and don't
// trigger their own refresh) and the response (so the browser stores it).
// The `headers` argument carries cache headers that must land on the
// response — otherwise a CDN could cache a response carrying one user's
// session and leak it to others.
//
// Skips entirely when cloud env vars are absent, so V1 local mode runs
// with zero configuration.

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = getSupabaseUrl();
  const key = getSupabaseKey();
  if (!url || !key) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) =>
          supabaseResponse.headers.set(name, value),
        );
      },
    },
  });

  // getUser() revalidates with the Auth server (unlike getSession(), whose
  // payload must not be trusted in server code) and triggers the refresh.
  await supabase.auth.getUser();

  return supabaseResponse;
}
