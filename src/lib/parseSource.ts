/// <reference types="vitest/importMeta" />
import type { Source } from "./types";

function normalizeUrl(raw: string): URL | null {
  let s = raw.trim();
  if (!s.startsWith("http://") && !s.startsWith("https://")) {
    s = "https://" + s;
  }
  try {
    const u = new URL(s);
    // strip www.
    if (u.hostname.startsWith("www.")) {
      u.hostname = u.hostname.slice(4);
    }
    return u;
  } catch {
    return null;
  }
}

export function parseSource(raw: string): Source {
  const url = normalizeUrl(raw);
  if (!url) {
    return { type: "invalid", message: `Cannot parse URL: "${raw}"` };
  }

  const host = url.hostname;
  const path = url.pathname;

  // Direct media files
  const lowerPath = path.toLowerCase();
  if (lowerPath.endsWith(".m3u8")) {
    return {
      type: "hls",
      platform: "file",
      url: url.toString(),
      name: path.split("/").pop() || "Stream",
      live: true,
    };
  }
  if (
    lowerPath.endsWith(".mp4") ||
    lowerPath.endsWith(".webm") ||
    lowerPath.endsWith(".ogg")
  ) {
    return {
      type: "video-file",
      platform: "file",
      url: url.toString(),
      name: path.split("/").pop() || "Video",
      live: false,
    };
  }

  // YouTube
  if (host === "youtube.com" || host === "youtu.be") {
    if (host === "youtu.be") {
      const id = path.slice(1);
      if (!id) return { type: "invalid", message: "Missing YouTube video ID" };
      return { type: "yt-video", platform: "yt", videoId: id, name: "YouTube", live: false };
    }

    // youtube.com/@handle — cannot embed without channel ID
    if (path.startsWith("/@")) {
      return {
        type: "unsupported",
        message: "YouTube @handle URLs cannot be embedded live. Use a channel ID URL (youtube.com/channel/UC...).",
      };
    }

    // /watch?v=
    const watchV = url.searchParams.get("v");
    if (watchV) {
      return { type: "yt-video", platform: "yt", videoId: watchV, name: "YouTube", live: false };
    }

    // /live/{id}
    const liveMatch = path.match(/^\/live\/([^/?#]+)/);
    if (liveMatch) {
      return { type: "yt-video", platform: "yt", videoId: liveMatch[1], name: "YouTube Live", live: true };
    }

    // /embed/{id}
    const embedMatch = path.match(/^\/embed\/([^/?#]+)/);
    if (embedMatch && embedMatch[1] !== "live_stream") {
      return { type: "yt-video", platform: "yt", videoId: embedMatch[1], name: "YouTube", live: false };
    }

    // /channel/{UC...}
    const channelMatch = path.match(/^\/channel\/(UC[^/?#]+)/);
    if (channelMatch) {
      return { type: "yt-channel", platform: "yt", channelId: channelMatch[1], name: "YouTube Channel", live: true };
    }

    return { type: "invalid", message: `Unrecognised YouTube URL: "${raw}"` };
  }

  // Twitch
  if (host === "twitch.tv") {
    const vodMatch = path.match(/^\/videos\/(\d+)/);
    if (vodMatch) {
      return { type: "tw-vod", platform: "tw", videoId: vodMatch[1], name: "Twitch VOD", live: false };
    }
    const channel = path.slice(1).split("/")[0];
    if (channel && channel !== "videos") {
      return { type: "tw-channel", platform: "tw", channel, name: channel, live: true };
    }
    return { type: "invalid", message: `Unrecognised Twitch URL: "${raw}"` };
  }

  // Kick
  if (host === "kick.com") {
    const channel = path.slice(1).split("/")[0];
    if (channel) {
      return { type: "kick-channel", platform: "kick", channel, name: channel, live: true };
    }
    return { type: "invalid", message: `Unrecognised Kick URL: "${raw}"` };
  }

  // Bilibili live
  if (host === "live.bilibili.com") {
    const roomId = path.slice(1).split("/")[0];
    if (roomId && /^\d+$/.test(roomId)) {
      return { type: "bili-live", platform: "bili", roomId, name: `Bili Live ${roomId}`, live: true };
    }
    return { type: "invalid", message: `Unrecognised Bilibili live URL: "${raw}"` };
  }

  // Bilibili video
  if (host === "bilibili.com") {
    const bvMatch = path.match(/^\/video\/(BV[^/?#]+)/i);
    if (bvMatch) {
      return { type: "bili-video", platform: "bili", bvid: bvMatch[1], name: `Bilibili ${bvMatch[1]}`, live: false };
    }
    return { type: "invalid", message: `Unrecognised Bilibili URL: "${raw}"` };
  }

  return { type: "invalid", message: `Unsupported domain: "${host}"` };
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe("parseSource", () => {
    it("parses youtube.com/watch?v=", () => {
      const s = parseSource("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
      expect(s.type).toBe("yt-video");
      if (s.type === "yt-video") expect(s.videoId).toBe("dQw4w9WgXcQ");
    });

    it("parses youtu.be short link", () => {
      const s = parseSource("https://youtu.be/dQw4w9WgXcQ");
      expect(s.type).toBe("yt-video");
    });

    it("parses youtube.com/live/{id}", () => {
      const s = parseSource("https://www.youtube.com/live/abc123XYZ");
      expect(s.type).toBe("yt-video");
      if (s.type === "yt-video") {
        expect(s.videoId).toBe("abc123XYZ");
        expect(s.live).toBe(true);
      }
    });

    it("parses youtube.com/channel/UC...", () => {
      const s = parseSource("https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxxxx");
      expect(s.type).toBe("yt-channel");
    });

    it("returns unsupported for @handle", () => {
      const s = parseSource("https://www.youtube.com/@MrBeast");
      expect(s.type).toBe("unsupported");
    });

    it("parses twitch channel", () => {
      const s = parseSource("https://www.twitch.tv/ninja");
      expect(s.type).toBe("tw-channel");
      if (s.type === "tw-channel") expect(s.channel).toBe("ninja");
    });

    it("parses twitch VOD", () => {
      const s = parseSource("https://www.twitch.tv/videos/123456789");
      expect(s.type).toBe("tw-vod");
      if (s.type === "tw-vod") expect(s.videoId).toBe("123456789");
    });

    it("parses kick channel", () => {
      const s = parseSource("https://kick.com/xqc");
      expect(s.type).toBe("kick-channel");
      if (s.type === "kick-channel") expect(s.channel).toBe("xqc");
    });

    it("parses bilibili live", () => {
      const s = parseSource("https://live.bilibili.com/123456");
      expect(s.type).toBe("bili-live");
      if (s.type === "bili-live") expect(s.roomId).toBe("123456");
    });

    it("parses bilibili video", () => {
      const s = parseSource("https://www.bilibili.com/video/BV1xx411c7mD");
      expect(s.type).toBe("bili-video");
      if (s.type === "bili-video") expect(s.bvid).toBe("BV1xx411c7mD");
    });

    it("parses .m3u8 URL", () => {
      const s = parseSource("https://example.com/stream/live.m3u8");
      expect(s.type).toBe("hls");
    });

    it("parses .mp4 URL", () => {
      const s = parseSource("https://example.com/video.mp4");
      expect(s.type).toBe("video-file");
    });

    it("returns invalid for unrecognised domain", () => {
      const s = parseSource("https://example.com/foo");
      expect(s.type).toBe("invalid");
    });

    it("returns invalid for garbage input", () => {
      const s = parseSource("not a url at all @@##");
      expect(s.type).toBe("invalid");
    });
  });
}
