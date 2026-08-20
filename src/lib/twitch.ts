/// <reference types="vitest/importMeta" />
// Shared Twitch Player JS API loader. Used by both the home StreamCell and the
// viewer cell so the embed script is fetched once and the Player API is reused.
// Twitch.Player lets us call setMuted()/setQuality() without rebuilding the
// iframe src (which would reload and pause the stream).

export interface TwitchPlayerInstance {
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  setQuality(quality: string): void;
  play(): void;
  // WARNING: isPaused() LIES for policy-stopped players (verified live
  // 2026-08-04 in real Chrome): a player whose start was vetoed — or that
  // Twitch stopped for hiding/occlusion — shows the big play button frozen at
  // t=0 while isPaused() returns false. Never use it to decide whether a
  // player is actually healthy; measure getCurrentTime() progress instead.
  isPaused(): boolean;
  /** Seconds into playback. The one honest health signal: a live player's
      clock advances, a dead player's does not. Optional — older embed builds
      may lack it. */
  getCurrentTime?(): number;
  /** 0..1. WARNING: player.twitch.tv PERSISTS volume in its own localStorage,
      shared by every Twitch embed in the browser — one slider dragged to 0
      (or a stray click) silences ALL embeds everywhere, and setMuted(false)
      does nothing about it. Check getVolume on unmute. Optional — older
      embed builds may lack them. */
  getVolume?(): number;
  setVolume?(volume: number): void;
  /** Renditions this stream offers. `group` is the id setQuality() accepts —
      "chunked" is the broadcaster's source/passthrough, "auto" is adaptive,
      the rest look like "720p60". Optional — older embed builds may lack it. */
  getQualities?(): TwitchQuality[];
  /** Currently selected quality group. Optional — older embed builds. */
  getQuality?(): string;
  addEventListener(event: string, cb: () => void): void;
}

export type TwitchQuality = { name: string; group: string };

/** Pixel height encoded in a quality group id ("720p60" → 720), or null for
    non-numeric groups ("chunked", "auto"). */
function qualityHeight(group: string): number | null {
  const m = /^(\d+)p/.exec(group);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * The id to request for SOURCE quality: "chunked" (Twitch's passthrough
 * rendition) when the stream offers it, else the highest numbered rendition.
 * Null when the list gives nothing usable (leave the player on its default).
 */
export function pickSourceQuality(qualities: TwitchQuality[]): string | null {
  if (qualities.some((q) => q.group === "chunked")) return "chunked";
  let best: string | null = null;
  let bestH = -1;
  for (const q of qualities) {
    const h = qualityHeight(q.group);
    if (h !== null && h > bestH) {
      bestH = h;
      best = q.group;
    }
  }
  return best;
}

/**
 * The id for the LIGHTEST real rendition — for 9-up, where nine source-quality
 * decodes would bury the machine. Chosen from what this stream actually
 * offers; never a hardcoded id, which may not exist on a given stream.
 */
export function pickLowestQuality(qualities: TwitchQuality[]): string | null {
  let worst: string | null = null;
  let worstH = Infinity;
  for (const q of qualities) {
    const h = qualityHeight(q.group);
    if (h !== null && h < worstH) {
      worstH = h;
      worst = q.group;
    }
  }
  return worst;
}

/**
 * Nag a freshly created player into starting. The embed advertises autoplay
 * but can come up paused, and play() calls during its spin-up are silently
 * dropped. Don't consult isPaused() here — it returns undefined until the
 * player is initialized. Just keep calling play(); the caller's PLAYING
 * listener invokes the returned stop function once playback really starts.
 */
export function insistOnPlay(player: TwitchPlayerInstance): () => void {
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    try {
      player.play();
    } catch {
      /* player torn down mid-tick */
    }
    if (tries >= 20) clearInterval(timer); // stop nagging after ~15s
  }, 750);
  return () => clearInterval(timer);
}

export type TwitchPlayerCtor = (new (
  id: string,
  opts: Record<string, unknown>
) => TwitchPlayerInstance) & {
  PLAYING: string;
  READY: string;
  /** Autoplay / programmatic play was REJECTED (typically an unmuted attempt
      without user activation). This is the authoritative policy-block signal —
      infer nothing from pauses or clocks when this event is available. */
  PLAYBACK_BLOCKED: string;
};

interface TwitchWindow extends Window {
  Twitch?: { Player: TwitchPlayerCtor };
}

let twitchScriptPromise: Promise<void> | null = null;

export function loadTwitchScript(): Promise<void> {
  if (!twitchScriptPromise) {
    twitchScriptPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject();
        return;
      }
      if ((window as TwitchWindow).Twitch?.Player) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://player.twitch.tv/js/embed/v1.js";
      s.onload = () => resolve();
      s.onerror = () => {
        twitchScriptPromise = null;
        reject();
      };
      document.head.appendChild(s);
    });
  }
  return twitchScriptPromise;
}

/** The Twitch.Player constructor once the script has loaded, else null. */
export function getTwitchPlayer(): TwitchPlayerCtor | null {
  if (typeof window === "undefined") return null;
  return (window as TwitchWindow).Twitch?.Player ?? null;
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const q = (group: string): TwitchQuality => ({ name: group, group });

  describe("pickSourceQuality", () => {
    it("prefers chunked (the broadcaster passthrough)", () => {
      expect(
        pickSourceQuality([q("auto"), q("chunked"), q("720p60"), q("160p")])
      ).toBe("chunked");
    });
    it("falls back to the highest numbered rendition", () => {
      expect(
        pickSourceQuality([q("auto"), q("480p"), q("720p60"), q("160p")])
      ).toBe("720p60");
    });
    it("returns null when nothing usable is offered", () => {
      expect(pickSourceQuality([q("auto")])).toBe(null);
      expect(pickSourceQuality([])).toBe(null);
    });
  });

  describe("pickLowestQuality", () => {
    it("picks the lightest real rendition, never auto or chunked", () => {
      expect(
        pickLowestQuality([q("auto"), q("chunked"), q("720p60"), q("160p")])
      ).toBe("160p");
    });
    it("returns null when only non-numeric groups exist", () => {
      expect(pickLowestQuality([q("auto"), q("chunked")])).toBe(null);
    });
  });
}
