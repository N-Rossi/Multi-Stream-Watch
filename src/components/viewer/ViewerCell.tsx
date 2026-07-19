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
  insistOnPlay,
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
  // Twitch refuses to autoplay while any CSS transform sits on its iframe
  // ("style visibility" check false-positives). Hold the cover-scale off
  // until PLAYING fires, then zoom.
  const [twPlaying, setTwPlaying] = useState(false);

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

  // A blocked unmute (no user gesture in this tab yet) pauses the player, and
  // neither Twitch nor <video> ever auto-restarts a started-then-paused
  // stream — one bad unmute used to leave the cell frozen with no way back.
  // When that happens we fall back to muted-but-alive playback and set this
  // flag so we don't retry in a loop; the next audio toggle clears it.
  const unmuteBlockedRef = useRef(false);

  // Apply a mute state through the running player's API — no reload — and
  // revive the player if it's paused (blocked unmute, occlusion pause, etc.).
  // Twitch's play() counts like a user play-click, so it both restarts and can
  // carry sound. Honest exceptions:
  //  - YouTube / Kick: postMessage mute command, seamless, no pause feedback
  //    available cross-origin.
  //  - Bilibili: no mute API and no muted URL param, so audio can't be toggled
  //    after load — it plays at the embed's default. We never reload it.
  const applyMute = useCallback(
    (isMuted: boolean) => {
      if (isTwitch) {
        const p = twitchPlayerRef.current;
        if (!p) return;
        try {
          // TEMP DIAG
          console.log("[MSW]", twId, "applyMute", { isMuted, paused: p.isPaused(), blocked: unmuteBlockedRef.current, t: performance.now().toFixed(0) });
          if (p.isPaused()) p.play();
          if (!isMuted && unmuteBlockedRef.current) return; // stay muted-but-alive
          p.setMuted(isMuted);
          if (!isMuted) {
            // If the unmute tripped the autoplay policy Twitch pauses the
            // stream (and won't restart it on its own). Muted playback beats
            // a frozen cell.
            setTimeout(() => {
              try {
                if (p.isPaused()) {
                  // TEMP DIAG
                  console.warn("[MSW]", twId, "unmute PAUSED the player — falling back to muted", { t: performance.now().toFixed(0) });
                  unmuteBlockedRef.current = true;
                  p.setMuted(true);
                  p.play();
                }
              } catch {
                /* player torn down since */
              }
            }, 800);
          }
        } catch {
          /* player torn down mid-call */
        }
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
      if (!video) return;
      if (isMuted) {
        video.muted = true;
        if (video.paused) video.play().catch(() => {});
        return;
      }
      if (unmuteBlockedRef.current) {
        if (video.paused) video.play().catch(() => {});
        return;
      }
      if (video.paused) {
        // Restart muted first; onPlaying re-enters applyMute to try the unmute.
        video.muted = true;
        video.play().catch(() => {});
        return;
      }
      video.muted = false;
      setTimeout(() => {
        // Autoplay policy rejected the unmute and paused the video — fall
        // back to muted playback (one retry only, see unmuteBlockedRef).
        if (video.paused) {
          unmuteBlockedRef.current = true;
          video.muted = true;
          video.play().catch(() => {});
        }
      }, 400);
    },
    [isTwitch, source.type]
  );

  // Refs so the Twitch PLAYING listener (bound once per player) always applies
  // the CURRENT mute state — the old direct `muted` read was a stale closure
  // from the render the player was created in.
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const applyMuteRef = useRef(applyMute);
  applyMuteRef.current = applyMute;

  useEffect(() => {
    unmuteBlockedRef.current = false; // each audio toggle earns a fresh attempt
    applyMute(muted);
  }, [muted, applyMute]);

  // Twitch: initialize Twitch.Player (re-runs only when the source changes).
  useEffect(() => {
    if (!isTwitch) {
      twitchPlayerRef.current = null;
      return;
    }
    let cancelled = false;
    let stopInsisting: (() => void) | undefined;
    setTwPlaying(false);
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
        stopInsisting = insistOnPlay(player);
        // TEMP DIAG — timestamp every lifecycle event so the pause moment can
        // be correlated with what we do at PLAYING (transform, unmute, quality).
        console.log("[MSW]", twId, "player created", { muted: mutedRef.current, t: performance.now().toFixed(0) });
        player.addEventListener("play", () =>
          console.log("[MSW]", twId, "event: play", { t: performance.now().toFixed(0) })
        );
        player.addEventListener("pause", () =>
          console.warn("[MSW]", twId, "event: PAUSE", { t: performance.now().toFixed(0) })
        );
        player.addEventListener(Player.PLAYING, () => {
          if (cancelled) return;
          console.log("[MSW]", twId, "event: PLAYING → transform on, applyMute", { muted: mutedRef.current, t: performance.now().toFixed(0) }); // TEMP DIAG
          stopInsisting?.();
          setTwPlaying(true);
          applyMuteRef.current(mutedRef.current);
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
      stopInsisting?.();
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
      className={[
        "relative w-full h-full bg-black overflow-hidden border flex flex-col",
        !muted ? "border-tally shadow-[inset_0_0_0_2px_#FF453A]" : "border-transparent",
      ].join(" ")}
    >
      {/* Video area. The label strip below is a SIBLING, not an overlay:
          Twitch vetoes autoplay while any element overlaps its iframe (even a
          pointer-events:none chip), so the label must never share this box.
          cellRef sits here so cover-scale measures the actual video area. */}
      <div ref={cellRef} className="relative flex-1 min-h-0 overflow-hidden">
        {isTwitch ? (
          <div
            className="absolute inset-0 w-full h-full origin-center"
            style={{
              // TEMP EXPERIMENT: cover-scale disabled for Twitch. All cells
              // paused at PLAYING — the instant this transform switches on and
              // inflates the iframe's geometry under the label strip/adjacent
              // cells (occlusion → Twitch pauses autoplay-started streams).
              // Letterbox bars expected while testing.
              // Restore: twPlaying ? `scale(${coverScale})` : undefined
              transform: undefined,
            }}
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

      {/* Label strip — UMD look, but rendered BELOW the video box, never over
          it (occlusion vetoes Twitch autoplay). The audio slot gets a glowing
          tally dot (shown even with no label). */}
      {(label || !muted) && (
        <div
          className="h-6 shrink-0 flex items-center gap-2 bg-black border-l-[3px] pl-2 pr-2.5 text-xs font-display font-semibold uppercase tracking-wide text-white"
          style={{
            borderLeftColor:
              source.type !== "invalid" && source.type !== "unsupported"
                ? PLATFORM_COLORS[source.platform]
                : "#8F8C83",
          }}
        >
          <span className="truncate">{label}</span>
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
