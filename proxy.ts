import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Next.js 16 "proxy" (formerly middleware): runs before every matched
// request to refresh the Supabase session cookie. Auth logic lives in
// lib/supabase/proxy.ts — this file is only the framework hook-up.

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match everything except static assets and image optimization,
     * so session refresh never pays for files that don't need it.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
