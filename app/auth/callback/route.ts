import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// OAuth landing pad: Google redirects here with a one-time code, we
// exchange it for a session (cookies set via the server client), then
// send the user home. Failures land back on / with a flag instead of
// a stack trace — auth errors must read like UI states, not crashes.

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/?auth=error`);
}
