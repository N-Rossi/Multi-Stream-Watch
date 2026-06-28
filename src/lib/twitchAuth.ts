const TOKEN_KEY = "twitch_access_token";

function clientId(): string {
  return process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID ?? "";
}

export function buildLoginUrl(): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: window.location.origin,
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
