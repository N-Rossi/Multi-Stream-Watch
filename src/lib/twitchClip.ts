/// <reference types="vitest/importMeta" />

// Twitch clips are plain MP4s behind a short-lived access token. Resolving the
// MP4 lets the cells play clips in a native <video> instead of the clips-embed
// iframe — which paints its own "Click to unmute" pill over every muted
// autoplay and offers no runtime API to avoid it. This is the same GraphQL
// call (and the same public client ID) Twitch's own web player makes for every
// clip page; it is not a documented API, so callers must treat null as "fall
// back to the embed iframe".

const GQL_URL = "https://gql.twitch.tv/gql";
// Twitch's public web-player client ID — shipped in their site JS, not a secret.
const WEB_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";
// Persisted-query hash for VideoAccessToken_Clip (stable for years; if Twitch
// rotates it the call fails and clips fall back to the embed).
const CLIP_QUERY_HASH =
  "36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11";

type ClipTokenResponse = {
  data?: {
    clip?: {
      playbackAccessToken?: { signature: string; value: string } | null;
      videoQualities?: { quality: string; sourceURL: string }[] | null;
    } | null;
  };
}[];

/** Highest-quality MP4 URL for a clip slug, or null if resolution fails. */
export async function resolveClipMp4(slug: string): Promise<string | null> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: {
      "Client-ID": WEB_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      {
        operationName: "VideoAccessToken_Clip",
        variables: { slug },
        extensions: {
          persistedQuery: { version: 1, sha256Hash: CLIP_QUERY_HASH },
        },
      },
    ]),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as ClipTokenResponse;
  const clip = json?.[0]?.data?.clip;
  const token = clip?.playbackAccessToken;
  const qualities = clip?.videoQualities?.filter((q) => q?.sourceURL);
  if (!token || !qualities?.length) return null;
  // Best quality first — don't rely on Twitch's response order.
  const best = [...qualities].sort(
    (a, b) => Number(b.quality) - Number(a.quality)
  )[0];
  return `${best.sourceURL}?sig=${token.signature}&token=${encodeURIComponent(token.value)}`;
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect, vi, afterEach } = import.meta.vitest;

  const gqlResponse = (clip: unknown) =>
    new Response(JSON.stringify([{ data: { clip } }]), { status: 200 });

  afterEach(() => vi.unstubAllGlobals());

  describe("resolveClipMp4", () => {
    it("assembles the signed URL from the best quality", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          gqlResponse({
            playbackAccessToken: { signature: "SIG", value: '{"a":1}' },
            videoQualities: [
              { quality: "480", sourceURL: "https://cdn.example/480.mp4" },
              { quality: "1080", sourceURL: "https://cdn.example/1080.mp4" },
            ],
          })
        )
      );
      const url = await resolveClipMp4("SomeClip");
      expect(url).toBe(
        `https://cdn.example/1080.mp4?sig=SIG&token=${encodeURIComponent('{"a":1}')}`
      );
    });

    it("returns null when the clip or token is missing", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => gqlResponse(null)));
      expect(await resolveClipMp4("Gone")).toBeNull();
    });

    it("returns null on an HTTP error", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("nope", { status: 400 }))
      );
      expect(await resolveClipMp4("Bad")).toBeNull();
    });
  });
}
