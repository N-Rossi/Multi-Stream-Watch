import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Site-wide password gate (HTTP Basic Auth), enforced at the edge before any
// page renders.
//
// What this does and does not protect: the board itself CANNOT be tampered
// with remotely — control and viewer sync over BroadcastChannel plus
// localStorage, which never leave one browser on one machine, so a stranger
// opening /control only ever edits their own private copy. What an open
// deployment DOES give strangers is free use of the app on this project's
// Vercel bandwidth, plus noise in its analytics. This gate closes that.
//
// Behaviour:
// - SITE_PASSWORD unset (local dev by default) → the site is open.
// - Set (production) → every page asks the browser for credentials once;
//   the username is ignored, only the password must match. Browsers cache
//   the credentials for the session, so the prompt appears once per visit
//   at most — and the Twitch OAuth round-trip re-enters with the cached
//   credentials without prompting again.
//
// SITE_PASSWORD is a server-side env var (no NEXT_PUBLIC_ prefix), so it is
// never baked into the client bundle.

export function proxy(request: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      // "user:pass" — everything after the first colon is the password, so
      // passwords containing colons survive.
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === password) return NextResponse.next();
    } catch {
      /* malformed base64 — fall through to the challenge */
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Multiviewer"' },
  });
}

export const config = {
  // Gate pages, not build assets: everything under /_next is content-free
  // without the pages that use it (the only "secret" in the bundle would be
  // the Twitch client id, which is public by design in an implicit-grant
  // flow).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
