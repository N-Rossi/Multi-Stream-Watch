/// <reference types="vitest/importMeta" />

// Credential logic for the site-wide Basic Auth gate (src/proxy.ts). Pure and
// framework-free so it can be unit-tested; the proxy just wires it to the
// request.
//
// Accounts come from the SITE_USERS env var: "user:password" pairs, comma-
// separated to add more people later without touching code:
//
//   SITE_USERS="client:hunter2"
//   SITE_USERS="client:hunter2,nick:othersecret"
//
// Usernames and passwords are case-sensitive. A password may contain colons
// (everything after the pair's first colon is the password) but not commas.

export type SiteUsers = Map<string, string>;

/** Parse SITE_USERS into a username → password map. Malformed pairs are skipped. */
export function parseSiteUsers(raw: string | undefined): SiteUsers {
  const users: SiteUsers = new Map();
  for (const pair of (raw ?? "").split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const i = trimmed.indexOf(":");
    if (i <= 0) continue; // no colon, or empty username
    users.set(trimmed.slice(0, i), trimmed.slice(i + 1));
  }
  return users;
}

/**
 * Does an Authorization header carry valid credentials?
 * - `users` non-empty → the username must exist and its password must match.
 * - `users` empty but `anyUserPassword` set (legacy SITE_PASSWORD mode) → any
 *   username is accepted, only the password is checked.
 */
export function checkBasicAuth(
  header: string | null,
  users: SiteUsers,
  anyUserPassword?: string
): boolean {
  if (!header?.startsWith("Basic ")) return false;
  let decoded: string;
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false; // malformed base64
  }
  const i = decoded.indexOf(":");
  if (i < 0) return false;
  const username = decoded.slice(0, i);
  const password = decoded.slice(i + 1);

  if (users.size > 0) return users.get(username) === password;
  if (anyUserPassword) return password === anyUserPassword;
  return false;
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const basic = (user: string, pass: string) =>
    "Basic " + btoa(`${user}:${pass}`);

  describe("parseSiteUsers", () => {
    it("parses single and multiple pairs, skipping malformed ones", () => {
      expect(parseSiteUsers("client:hunter2")).toEqual(
        new Map([["client", "hunter2"]])
      );
      expect(
        parseSiteUsers(" client:hunter2 , nick:pw ,, :nouser , nopass ")
      ).toEqual(
        new Map([
          ["client", "hunter2"],
          ["nick", "pw"],
        ])
      );
      expect(parseSiteUsers(undefined).size).toBe(0);
    });

    it("keeps colons inside passwords", () => {
      expect(parseSiteUsers("client:pw:with:colons")).toEqual(
        new Map([["client", "pw:with:colons"]])
      );
    });
  });

  describe("checkBasicAuth", () => {
    const users = parseSiteUsers("client:hunter2,nick:pw");

    it("accepts a known user with the right password", () => {
      expect(checkBasicAuth(basic("client", "hunter2"), users)).toBe(true);
      expect(checkBasicAuth(basic("nick", "pw"), users)).toBe(true);
    });

    it("rejects wrong password, unknown user, or another user's password", () => {
      expect(checkBasicAuth(basic("client", "wrong"), users)).toBe(false);
      expect(checkBasicAuth(basic("stranger", "hunter2"), users)).toBe(false);
      expect(checkBasicAuth(basic("client", "pw"), users)).toBe(false);
    });

    it("rejects missing or malformed headers", () => {
      expect(checkBasicAuth(null, users)).toBe(false);
      expect(checkBasicAuth("Bearer abc", users)).toBe(false);
      expect(checkBasicAuth("Basic %%%not-base64%%%", users)).toBe(false);
    });

    it("legacy password-only mode ignores the username", () => {
      const none = parseSiteUsers(undefined);
      expect(checkBasicAuth(basic("anyone", "sesame"), none, "sesame")).toBe(true);
      expect(checkBasicAuth(basic("anyone", "wrong"), none, "sesame")).toBe(false);
    });

    it("SITE_USERS takes precedence over the legacy password", () => {
      expect(checkBasicAuth(basic("stranger", "sesame"), users, "sesame")).toBe(
        false
      );
    });
  });
}
