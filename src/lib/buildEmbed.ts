import type { Source } from "./types";

export type EmbedConfig =
  | { kind: "iframe"; src: string; allowFullscreen: boolean }
  | { kind: "hls"; url: string }
  | { kind: "video"; url: string }
  | { kind: "unsupported"; message: string };

export function buildEmbed(
  source: Source,
  opts: { muted: boolean; origin?: string; hostname?: string }
): EmbedConfig {
  const { muted, origin = "", hostname = "localhost" } = opts;

  switch (source.type) {
    case "yt-video": {
      const params = new URLSearchParams({
        enablejsapi: "1",
        autoplay: "1",
        mute: muted ? "1" : "0",
        playsinline: "1",
        origin,
      });
      return {
        kind: "iframe",
        src: `https://www.youtube.com/embed/${source.videoId}?${params}`,
        allowFullscreen: true,
      };
    }

    case "yt-channel": {
      const params = new URLSearchParams({
        channel: source.channelId,
        enablejsapi: "1",
        autoplay: "1",
        mute: muted ? "1" : "0",
      });
      return {
        kind: "iframe",
        src: `https://www.youtube.com/embed/live_stream?${params}`,
        allowFullscreen: true,
      };
    }

    case "tw-channel": {
      const params = new URLSearchParams({
        channel: source.channel,
        parent: hostname,
        autoplay: "true",
        muted: String(muted),
      });
      return {
        kind: "iframe",
        src: `https://player.twitch.tv/?${params}`,
        allowFullscreen: true,
      };
    }

    case "tw-vod": {
      const params = new URLSearchParams({
        video: source.videoId,
        parent: hostname,
        autoplay: "true",
        muted: String(muted),
      });
      return {
        kind: "iframe",
        src: `https://player.twitch.tv/?${params}`,
        allowFullscreen: true,
      };
    }

    case "kick-channel": {
      const params = new URLSearchParams({
        autoplay: "true",
        muted: String(muted),
      });
      return {
        kind: "iframe",
        src: `https://player.kick.com/${source.channel}?${params}`,
        allowFullscreen: true,
      };
    }

    case "bili-live": {
      return {
        kind: "iframe",
        src: `https://www.bilibili.com/blackboard/live/live-activity-player.html?cid=${source.roomId}&quality=4`,
        allowFullscreen: true,
      };
    }

    case "bili-video": {
      return {
        kind: "iframe",
        src: `https://player.bilibili.com/player.html?bvid=${source.bvid}&autoplay=1&danmaku=0`,
        allowFullscreen: true,
      };
    }

    case "hls": {
      return { kind: "hls", url: source.url };
    }

    case "video-file": {
      return { kind: "video", url: source.url };
    }

    case "unsupported":
    case "invalid": {
      return { kind: "unsupported", message: source.message };
    }
  }
}

/** Rebuild the iframe src with updated muted state for platforms that require a reload */
export function rebuildEmbedSrc(
  source: Source,
  opts: { muted: boolean; origin?: string; hostname?: string }
): string | null {
  const config = buildEmbed(source, opts);
  return config.kind === "iframe" ? config.src : null;
}
