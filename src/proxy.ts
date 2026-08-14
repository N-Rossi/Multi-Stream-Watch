import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSiteUsers, checkBasicAuth } from "@/lib/siteAuth";

// Site-wide login gate (HTTP Basic Auth), enforced at the edge before any
// page renders.
//
// What this does and does not protect: the board itself CANNOT be tampered
// with remotely — control and viewer sync over BroadcastChannel plus
// localStorage, which never leave one browser on one machine, so a stranger
// opening /control only ever edits their own private copy. What an open
// deployment DOES give strangers is free use of the app on this project's
// Vercel bandwidth, plus noise in its analytics. This gate closes that.
//
// Accounts (see lib/siteAuth.ts for the format):
// - SITE_USERS="client:password" — named accounts; add more people later by
//   appending comma-separated pairs, no code change needed.
// - SITE_PASSWORD=... — legacy fallback used only when SITE_USERS is unset:
//   any username, one shared password.
// - Neither set (local dev by default) → the site is open.
//
// The browser asks for credentials once and caches them for the session, so
// the prompt appears at most once per visit — and the Twitch OAuth round-trip
// re-enters with the cached credentials without prompting again.
//
// Both env vars are server-side (no NEXT_PUBLIC_ prefix), so credentials are
// never baked into the client bundle.

export function proxy(request: NextRequest) {
  const users = parseSiteUsers(process.env.SITE_USERS);
  const legacyPassword = process.env.SITE_PASSWORD;
  if (users.size === 0 && !legacyPassword) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (checkBasicAuth(header, users, legacyPassword)) {
    return NextResponse.next();
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
