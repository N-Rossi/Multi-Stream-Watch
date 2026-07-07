"use client";
import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
  memo,
} from "react";
import type { Source } from "@/lib/types";
import { buildEmbed } from "@/lib/buildEmbed";
import { PLATFORM_COLORS } from "@/lib/platform";
import {
  loadTwitchScript,
  getTwitchPlayer,
  type TwitchPlayerInstance,
} from "@/lib/twitch";

// Clean viewer player. The iframe src / player is derived ONLY from `source`
// and memoized, so cosmetic pushes (label, layout, focus, audio) never rebuild
// it — the feed keeps playing. Only a changed `source` swaps the player.
//
// Reuses buildEmbed and the shared Twitch loader; mirrors the home StreamCell's
// proven techniques (cover-scale, autoplay-muted-then-unmute, Twitch.Player).

type Props = {
  source: Source;
  muted: boolean;
  label: string;
  /** At the 9-up layout, ask platforms for lower quality where possible. */
  lowQuality?: boolean;
  /** Stable DOM id for the Twitch.Player container (per slot). */
  twId: string;
};

function ViewerCellImpl({ source, muted, label, lowQuality, twId }: Props) {
  const cellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const twitchPlayerRef = useRef<TwitchPlayerInstance | null>(null);

  const [coverScale, setCoverScale] = useState(1);

  const isTwitch = source.type === "tw-channel" || source.type === "tw-vod";

  // CRITICAL: every push delivers a freshly deserialized config, so `source` is
  // a new object reference even when its value is identical. Memoize on the
  // source *value* (a stable string key) so embedConfig — and therefore the
  // iframe src and the player-init effects — stay stable across cosmetic pushes
  // and only change when the source actually changes.
  const srcKey = JSON.stringify(source);
  const embedConfig = useMemo(
    () =>
      buildEmbed(source, {
        muted: true, // always autoplay muted; unmute the audio slot once playing
        origin: typeof window !== "undefined" ? window.location.origin : "",
        hostname:
          typeof window !== "undefined" ? window.location.hostname : "localhost",
      }),
    [srcKey] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Cover-scale: zoom the player to fill the cell (eliminates black bars).
  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return; // hidden (focus mode) → skip, recompute on show
      const ca = width / height;
      const va = 16 / 9;
      setCoverScale(ca > va ? ca / va : va / ca);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Apply a mute state through the running player's API — no reload.
  // Honest exceptions:
  //  - YouTube / Kick: postMessage mute command, seamless.
  //  - Twitch: Twitch.Player.setMuted, seamless.
  //  - Bilibili: no mute API and no muted URL param, so audio can't be toggled
  //    after load — it plays at the embed's default. We never reload it.
  const applyMute = useCallback(
    (isMuted: boolean) => {
      if (isTwitch) {
        twitchPlayerRef.current?.setMuted(isMuted);
        return;
      }
      if (source.type === "yt-video" || source.type === "yt-channel") {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({
            event: "command",
            func: isMuted ? "mute" : "unMute",
            args: [],
          }),
          "*"
        );
        return;
      }
      if (source.type === "kick-channel") {
        const msg = JSON.stringify({ event: isMuted ? "mute" : "unmute" });
        iframeRef.current?.contentWindow?.postMessage(
          msg,
          "https://player.kick.com"
        );
        iframeRef.current?.contentWindow?.postMessage(msg, "*");
        return;
      }
      const video = videoRef.current;
      if (video) {
        // Don't unmute before playback starts or the autoplay policy pauses it.
        video.muted = !isMuted && video.paused ? true : isMuted;
      }
    },
    [isTwitch, source.type]
  );

  useEffect(() => {
    applyMute(muted);
  }, [muted, applyMute]);

  // Twitch: initialize Twitch.Player (re-runs only when the source changes).
  useEffect(() => {
    if (!isTwitch) {
      twitchPlayerRef.current = null;
      return;
    }
    let cancelled = false;
    loadTwitchScript()
      .then(() => {
        if (cancelled) return;
        const Player = getTwitchPlayer();
        if (!Player || !document.getElementById(twId)) return;
        const opts: Record<string, unknown> = {
          width: "100%",
          height: "100%",
          autoplay: true,
          muted: true,
          parent: [window.location.hostname],
        };
        if (source.type === "tw-channel") opts.channel = source.channel;
        if (source.type === "tw-vod") opts.video = source.videoId;
        const player = new Player(twId, opts);
        if (!cancelled) twitchPlayerRef.current = player;
        player.addEventListener(Player.PLAYING, () => {
          if (cancelled) return;
          player.setMuted(muted);
          // 9-up is heavy; request a low quality where the platform allows it.
          if (lowQuality) {
            try {
              player.setQuality("160p");
            } catch {
              /* quality id varies by stream — best effort */
            }
          }
        });
      })
      .catch(() => {
        /* script blocked — cell stays black */
      });
    return () => {
      cancelled = true;
      twitchPlayerRef.current = null;
      const el = document.getElementById(twId);
      if (el) el.innerHTML = "";
    };
  }, [embedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // HLS setup (re-runs only when the source changes).
  useEffect(() => {
    if (embedConfig.kind !== "hls" || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = true;
    let cleanup: (() => void) | undefined;
    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(embedConfig.url);
        hls.attachMedia(video);
        cleanup = () => hls.destroy();
      } else {
        video.src = embedConfig.url;
      }
    });
    return () => cleanup?.();
  }, [embedConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={cellRef}
      className={[
        "relative w-full h-full bg-black overflow-hidden border",
        !muted ? "border-tally shadow-[inset_0_0_0_2px_#FF453A]" : "border-transparent",
      ].join(" ")}
    >
      <div className="absolute inset-0">
        {isTwitch ? (
          <div
            className="absolute inset-0 w-full h-full origin-center"
            style={{ transform: `scale(${coverScale})` }}
          >
            <div id={twId} style={{ width: "100%", height: "100%" }} />
          </div>
        ) : embedConfig.kind === "iframe" ? (
          <iframe
            ref={iframeRef}
            src={embedConfig.src}
            className="absolute inset-0 w-full h-full origin-center"
            style={{ transform: `scale(${coverScale})` }}
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => {
              applyMute(muted);
              setTimeout(() => applyMute(muted), 600);
            }}
          />
        ) : embedConfig.kind === "hls" || embedConfig.kind === "video" ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            autoPlay
            muted
            playsInline
            onPlaying={() => applyMute(muted)}
            src={embedConfig.kind === "video" ? embedConfig.url : undefined}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-4 text-center">
            <span className="text-amber text-xs">{embedConfig.message}</span>
          </div>
        )}
      </div>

      {/* Label overlay — UMD strip: solid black, condensed caps, platform edge.
          The audio slot gets a glowing tally dot (shown even with no label). */}
      {(label || !muted) && (
        <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
          <span
            className="inline-flex items-center gap-2 rounded-[2px] bg-black/85 border-l-[3px] pl-2 pr-2.5 py-0.5 text-xs font-display font-semibold uppercase tracking-wide text-white"
            style={{
              borderLeftColor:
                source.type !== "invalid" && source.type !== "unsupported"
                  ? PLATFORM_COLORS[source.platform]
                  : "#8F8C83",
            }}
          >
            {label}
            {!muted && (
              <span className="flex items-center gap-1.5 shrink-0" title="Audio live">
                <svg
                  viewBox="0 0 16 16"
                  className="w-3.5 h-3.5 text-tally"
                  fill="currentColor"
                  aria-label="Audio live"
                >
                  <path d="M8 2.5 4.5 5.5H2a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 .5.5h2.5L8 13.5a.5.5 0 0 0 .8-.4V2.9a.5.5 0 0 0-.8-.4Z" />
                  <path
                    d="M10.8 5.2a4 4 0 0 1 0 5.6M12.8 3.2a6.8 6.8 0 0 1 0 9.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="w-1.5 h-1.5 rounded-[1px] bg-tally shadow-[0_0_6px_#FF453A]" />
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// Memoized by VALUE: a push that doesn't change this cell's source/mute/label
// skips the re-render entirely. Combined with a stable key per slot id in
// ViewerGrid, an unchanged feed is never touched on a push.
const ViewerCell = memo(
  ViewerCellImpl,
  (a, b) =>
    a.muted === b.muted &&
    a.label === b.label &&
    a.lowQuality === b.lowQuality &&
    a.twId === b.twId &&
    JSON.stringify(a.source) === JSON.stringify(b.source)
);
export default ViewerCell;
