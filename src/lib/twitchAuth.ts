const TOKEN_KEY = "twitch_access_token";
const RETURN_KEY = "twitch_auth_return";

// Twitch only redirects to the registered URI (the origin), so a login started
// on another page (e.g. /control) lands on the home page. Remember where the
// user came from so the callback can send them back.
export function storeReturnPath(path: string): void {
  localStorage.setItem(RETURN_KEY, path);
}

export function takeReturnPath(): string | null {
  const path = localStorage.getItem(RETURN_KEY);
  localStorage.removeItem(RETURN_KEY);
  return path;
}

function clientId(): string {
  return process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID ?? "";
}

export function buildLoginUrl(): string {
  // Redirect straight back to the page login started on. Every path used here
  // (the origin root, /control) must be registered as an OAuth Redirect URL in
  // the Twitch dev console — Twitch requires an exact match, no query string.
  const path = window.location.pathname;
  const redirect =
    path === "/" ? window.location.origin : window.location.origin + path;
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirect,
    response_type: "token",
    scope: "",
  });
  return `https://id.twitch.tv/oauth2/authorize?${params}`;
}

export function parseHashToken(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("access_token");
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function fetchTwitchUser(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${token}`,
        "Client-Id": clientId(),
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.data?.[0]?.display_name as string) ?? null;
  } catch {
    return null;
  }
}
