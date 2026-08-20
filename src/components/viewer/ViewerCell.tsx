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
import { buildEmbed, rebuildEmbedSrc } from "@/lib/buildEmbed";
import { PLATFORM_COLORS } from "@/lib/platform";
import { useClipMp4 } from "@/hooks/useClipMp4";
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
// Reuses buildEmbed and the shared Twitch loader. Twitch cells break from the
// home StreamCell in two autoplay-critical ways (see comments below): the
// label renders in a strip BELOW the video box (never overlapping the iframe)
// and the cover-scale transform is never applied to Twitch.

type Props = {
  source: Source;
  muted: boolean;
  label: string;
  /** Race leader — yellow crown left of the name in the label strip. */
  lead: boolean;
  /** At the 9-up layout, ask platforms for lower quality where possible. */
  lowQuality?: boolean;
  /** Stable DOM id for the Twitch.Player container (per slot). */
  twId: string;
};

function ViewerCellImpl({ source, muted, label, lead, lowQuality, twId }: Props) {
  const cellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const twitchPlayerRef = useRef<TwitchPlayerInstance | null>(null);

  const [coverScale, setCoverScale] = useState(1);

  // Clips are NOT part of isTwitch: Twitch.Player's JS API doesn't support
  // clips, so they skip the whole Player init / revive machinery. Preferred
  // path is the clip's raw MP4 in a native <video> — the clips-embed iframe
  // paints a "Click to unmute" pill over every muted autoplay that we cannot
  // remove cross-origin. The embed is kept as fallback if resolution fails.
  const isTwitch = source.type === "tw-channel" || source.type === "tw-vod";
  const isTwClip = source.type === "tw-clip";
  const clip = useClipMp4(source.type === "tw-clip" ? source.clipId : null);

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

  const reviveTimersRef = useRef<number[]>([]);

  // Bumping this tears down and recreates the Twitch player (the init effect
  // depends on it). A fresh player in a visible, unoccluded cell is the ONE
  // start path proven to work everywhere adding a stream works — it is the
  // revive of last resort.
  const [twRebuild, setTwRebuild] = useState(0);

  // Rebuild budget per source: a rebuild is a full stream reload, and a
  // channel that is offline (or geo-blocked, or otherwise unplayable) will
  // never reach PLAYING no matter how many times it is rebuilt — without a
  // cap, the never-started watchdog would reload it forever. Two attempts,
  // reset when the source changes or a player genuinely reaches PLAYING.
  const rebuildBudgetRef = useRef(0);
  // How many times PLAYING may auto-clear a latched mute-block (see the
  // PLAYING listener). Budgeted so an activation-less tab can't loop
  // unmute → policy-pause → revive forever; reset on source change and on
  // every explicit audio toggle.
  const unblockRetriesRef = useRef(0);
  useEffect(() => {
    rebuildBudgetRef.current = 0;
    unblockRetriesRef.current = 0;
  }, [srcKey]);
  const requestRebuild = useCallback(() => {
    if (rebuildBudgetRef.current >= 2) return;
    rebuildBudgetRef.current += 1;
    // The rebuilt player must come back MUTED even if it holds the audio
    // slot: unmuting a fresh player in a tab without activation is exactly
    // the trap that killed its predecessor. The next audio toggle re-arms.
    unmuteBlockedRef.current = true;
    setTwRebuild((n) => n + 1);
  }, []);
  const requestRebuildRef = useRef(requestRebuild);
  requestRebuildRef.current = requestRebuild;

  // Cover-scale: zoom the player to fill the cell (eliminates black bars).
  //
  // The observer ALSO drives revive-on-reveal (2026-08-04, the focus bug):
  // Twitch pauses a started stream whenever its iframe stops being plainly
  // visible — display:none (focus mode hides the other cells), occlusion, and
  // the focus-resize itself can trip it — and a started-then-paused stream
  // NEVER restarts on its own. Prevention is impossible: every way to make a
  // cell invisible is something Twitch polices. So whenever this cell's
  // geometry changes while visible (unfocus revealing it, focus resizing it,
  // a layout switch), revive in two escalating steps:
  //   1. +600ms  — applyMute(muted): its isPaused() → play() acts like a user
  //      play-click and restores the right mute state. Cheap, seamless when it
  //      works — but documented UNRELIABLE for these pauses.
  //   2. +2600ms — if the player is STILL paused, rebuild it. Reloads the
  //      stream (~2-3s of black) which beats a permanently frozen cell.
  // Checks are event-driven (not a watchdog), so a deliberate pause via the
  // player's own controls is only fought when the board changes shape.
  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return; // hidden (focus mode) → skip, recompute on show
      const ca = width / height;
      const va = 16 / 9;
      setCoverScale(ca > va ? ca / va : va / ca);

      reviveTimersRef.current.forEach(clearTimeout);
      // Escalation health check. isPaused() LIES for policy-stopped players
      // (verified live 2026-08-04: big play button, frozen clock, and
      // isPaused() === false — which is why every isPaused-gated revive
      // silently did nothing). The player's CLOCK is the honest signal.
      //
      // TIMING MATTERS: a policy pause lands a few hundred ms AFTER the
      // geometry change, so a baseline taken AT the change still records
      // progress and reads as alive. Both samples are therefore taken after
      // the death window and compared to each other.
      let ta: number | undefined;
      reviveTimersRef.current = [
        window.setTimeout(() => {
          const cell = cellRef.current;
          if (!cell || cell.clientWidth === 0) return; // hidden again
          applyMuteRef.current(mutedRef.current); // cheap attempt + reassert mute
        }, 600),
        window.setTimeout(() => {
          try {
            ta = twitchPlayerRef.current?.getCurrentTime?.();
          } catch {
            /* not ready */
          }
        }, 1500),
        window.setTimeout(() => {
          const cell = cellRef.current;
          if (!cell || cell.clientWidth === 0) return; // hidden again — next reveal handles it
          const p = twitchPlayerRef.current;
          if (!p) return; // rebuild escalation is Twitch-only
          let alive = false;
          try {
            const tb = p.getCurrentTime?.();
            if (typeof ta === "number" && typeof tb === "number") {
              alive = tb > ta + 0.05; // clock advanced across the sample window
            } else {
              // Embed build without getCurrentTime — trust isPaused, the best
              // signal available there.
              alive = p.isPaused() !== true;
            }
          } catch {
            /* player torn down since */
          }
          if (!alive) requestRebuildRef.current();
        }, 3800),
      ];
    });
    obs.observe(el);
    return () => {
      obs.disconnect();
      reviveTimersRef.current.forEach(clearTimeout);
      reviveTimersRef.current = [];
    };
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
          // play() UNCONDITIONALLY — not gated on isPaused(), which LIES for
          // policy-stopped players (verified live 2026-08-04: frozen on the
          // big play button with isPaused() === false, which is why the old
          // `if (p.isPaused()) p.play()` revive never fired). play() on an
          // already-playing player is a no-op, on a spun-up-but-stopped one
          // it acts like a user play-click, and the correct mute state is
          // applied immediately after so it cannot sneak sound in.
          p.play();
          if (!isMuted && unmuteBlockedRef.current) return; // stay muted-but-alive
          p.setMuted(isMuted);
          if (!isMuted) {
            // Unmuted but volume 0 is still silence — and the embed PERSISTS
            // volume in player.twitch.tv localStorage, shared by every Twitch
            // embed in this browser. One zeroed slider would otherwise mute
            // every cell forever, immune to every toggle.
            try {
              if (p.getVolume?.() === 0) p.setVolume?.(1);
            } catch {
              /* older embed build */
            }
            // The unmute trap: unmuting in a tab without user activation
            // makes the browser pause the stream almost instantly (seen live:
            // PLAYING → PAUSE 170ms after setMuted(false)). isPaused() lies
            // here too, so judge by the CLOCK: if playback time hasn't
            // advanced by the check, the unmute killed it — fall back to
            // muted-but-alive. (A stream that happens to be buffering gets
            // the same fallback; the next audio toggle retries.)
            // TIMING MATTERS: the policy pause lands ~200ms AFTER the unmute,
            // so a baseline taken now still sees ~0.2s of progress and reads
            // as alive. Both samples must come from after the death window.
            let ta: number | undefined;
            setTimeout(() => {
              try {
                ta = p.getCurrentTime?.();
              } catch {
                /* torn down */
              }
            }, 1200);
            setTimeout(() => {
              try {
                const tb = p.getCurrentTime?.();
                const blocked =
                  typeof ta === "number" && typeof tb === "number"
                    ? tb <= ta + 0.05 // clock frozen across the sample window
                    : p.isPaused() === true; // old embeds: best signal left
                if (blocked) {
                  unmuteBlockedRef.current = true;
                  p.setMuted(true);
                  p.play();
                }
              } catch {
                /* player torn down since */
              }
            }, 2600);
          }
        } catch {
          /* player torn down mid-call */
        }
        return;
      }
      if (source.type === "tw-clip" && iframeRef.current) {
        // Embed-iframe FALLBACK only (MP4 resolution failed — the preferred
        // path renders a native <video>, no iframe, and falls through to the
        // video branch below). The embed has no runtime API at all — the only
        // mute control is the src's muted param, so a toggle reloads the
        // iframe (the clip restarts from the top; clips are short, so this
        // beats no audio control). Identical src → no-op, so mount/onLoad
        // re-applies and the revive timers never cause a spurious reload.
        const src = rebuildEmbedSrc(source, {
          muted: isMuted,
          hostname: window.location.hostname,
        });
        const el = iframeRef.current;
        if (el && src && el.src !== src) el.src = src;
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
    // srcKey, not source: value-stable across cosmetic pushes (which deliver a
    // fresh object), but changes when the source really changes — the clip
    // branch closes over `source`, so swapping one clip for another must
    // recreate this callback.
    [isTwitch, srcKey] // eslint-disable-line react-hooks/exhaustive-deps
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
    unblockRetriesRef.current = 0;
    applyMute(muted);
  }, [muted, applyMute]);

  // Twitch: initialize Twitch.Player (re-runs when the source changes, or
  // when revive-on-reveal escalates to a rebuild via twRebuild).
  useEffect(() => {
    if (!isTwitch) {
      twitchPlayerRef.current = null;
      return;
    }
    let cancelled = false;
    let stopInsisting: (() => void) | undefined;
    let watchdog: number | undefined;
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
        // Live-debug handle: audio is invisible to screenshots and logs, so
        // when someone reports "no sound" the ONLY way to see the truth is to
        // ask the players directly. From the viewer tab's console:
        //   Object.entries(__mswPlayers).map(([id, p]) =>
        //     `${id} muted=${p.getMuted()} vol=${p.getVolume?.()} t=${p.getCurrentTime?.()}`)
        const dbg = window as unknown as {
          __mswPlayers?: Record<string, TwitchPlayerInstance>;
        };
        (dbg.__mswPlayers ??= {})[twId] = player;
        stopInsisting = insistOnPlay(player);
        let started = false;

        // Never-started watchdog. A start that was vetoed at creation leaves
        // a player that never fires PLAYING and never fires "pause" — no
        // event-driven recovery can see it (verified live 2026-08-04:
        // roster-drop into a Full-layout board, player loaded its poster and
        // sat there). If PLAYING hasn't arrived after insistOnPlay's whole
        // nag window and the cell is visible, rebuild (budgeted).
        watchdog = window.setTimeout(() => {
          if (cancelled || started) return;
          const el = document.getElementById(twId);
          if (!el || el.clientWidth === 0) return; // hidden — reveal handles it
          requestRebuildRef.current();
        }, 12000);

        // Policy pauses (occlusion, unmute-without-activation) arrive as plain
        // "pause" events, on THEIR schedule — observed anywhere from 170ms to
        // 6s after the trigger, which is why timer-based detection kept
        // missing them. Respond to the event itself: nothing in the viewer UI
        // pauses a player deliberately, so any pause while this cell is
        // visible is unwanted → fall back to muted playback, then VERIFY the
        // revival actually took (the play() can itself be swallowed) and
        // escalate to a budgeted rebuild if the clock stays frozen.
        player.addEventListener("pause", () => {
          if (cancelled) return;
          const el = document.getElementById(twId);
          if (!el || el.clientWidth === 0) return; // hidden cell — expected, leave it
          // Safety first: revive muted so the picture never freezes...
          setTimeout(() => {
            try {
              player.setMuted(true);
              player.play();
            } catch {
              /* torn down since */
            }
          }, 250);
          // ...but do NOT latch unmuteBlocked here. Twitch fires "pause" at
          // every AD BOUNDARY, so latching turned each ad break into
          // permanently dead audio (reported live 2026-08-08: after enough
          // watch time no toggle could restore sound on any Twitch stream —
          // the next boundary, or the retry's clock check sampling mid-ad,
          // kept re-latching). Instead, restore the TRUE mute state once the
          // interruption settles. If that unmute genuinely trips the
          // activation policy, applyMute's own clock check latches — the
          // latch is reserved for real policy blocks.
          setTimeout(() => {
            if (cancelled) return;
            const cell = document.getElementById(twId);
            if (!cell || cell.clientWidth === 0) return;
            try {
              applyMuteRef.current(mutedRef.current);
            } catch {
              /* torn down since */
            }
          }, 2800);
          let ta: number | undefined;
          setTimeout(() => {
            try {
              ta = player.getCurrentTime?.();
            } catch {
              /* torn down */
            }
          }, 1800);
          setTimeout(() => {
            if (cancelled) return;
            const cell = document.getElementById(twId);
            if (!cell || cell.clientWidth === 0) return;
            try {
              const tb = player.getCurrentTime?.();
              const revived =
                typeof ta === "number" && typeof tb === "number"
                  ? tb > ta + 0.05
                  : true; // no clock API — assume the play() took
              if (!revived) requestRebuildRef.current();
            } catch {
              /* torn down since */
            }
          }, 3400);
        });
        player.addEventListener(Player.PLAYING, () => {
          if (cancelled) return;
          started = true;
          rebuildBudgetRef.current = 0; // genuine playback: fresh budget
          stopInsisting?.();
          applyMuteRef.current(mutedRef.current);
          // A rebuilt player comes back latched-muted for safety. Don't leave
          // the audio slot silent until someone notices and toggles: once
          // playback is confirmed, retry the true state (budgeted — a genuine
          // policy block re-latches via applyMute's clock check, and after
          // two failures we stop and wait for a manual toggle).
          if (
            unmuteBlockedRef.current &&
            !mutedRef.current &&
            unblockRetriesRef.current < 2
          ) {
            unblockRetriesRef.current += 1;
            setTimeout(() => {
              if (cancelled) return;
              unmuteBlockedRef.current = false;
              applyMuteRef.current(mutedRef.current);
            }, 3000);
          }
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
      if (watchdog !== undefined) clearTimeout(watchdog);
      twitchPlayerRef.current = null;
      const dbg = window as unknown as {
        __mswPlayers?: Record<string, TwitchPlayerInstance>;
      };
      delete dbg.__mswPlayers?.[twId];
      const el = document.getElementById(twId);
      if (el) el.innerHTML = "";
    };
  }, [embedConfig, twRebuild]); // eslint-disable-line react-hooks/exhaustive-deps

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
          /* NO cover-scale on Twitch — ever. Twitch continuously polices
             occlusion on autoplay-started streams: the instant a scale
             transform inflates the iframe's geometry beyond its clip box
             (under the label strip / adjacent cells) the stream is paused,
             and a paused stream never auto-recovers. Proven live July 18 2026
             — disabling this transform is what made autoplay stick. Twitch
             letterboxes internally on a black cell, so the bars are subtle. */
          <div className="absolute inset-0 w-full h-full">
            <div id={twId} style={{ width: "100%", height: "100%" }} />
          </div>
        ) : isTwClip && !clip.failed ? (
          /* Preferred clip path: raw MP4 in a native <video> — full mute
             control, zero Twitch chrome (no "Click to unmute" pill). Black
             while the URL resolves; on failure `clip.failed` flips and the
             embed-iframe branch below takes over. */
          clip.url ? (
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              autoPlay
              muted
              playsInline
              onPlaying={() => applyMute(muted)}
              src={clip.url}
            />
          ) : null
        ) : embedConfig.kind === "iframe" ? (
          <iframe
            ref={iframeRef}
            src={embedConfig.src}
            className="absolute inset-0 w-full h-full origin-center"
            /* Clips get NO cover-scale, same caution as the live player: it's
               still a Twitch iframe, and inflating its geometry past the clip
               box risks the same occlusion policing. It letterboxes on black. */
            style={{ transform: isTwClip ? undefined : `scale(${coverScale})` }}
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
          tally dot, the race leader a crown (both shown even with no label).
          ALWAYS rendered, even empty: the strip appearing/disappearing resizes
          the video box, and Twitch pauses a playing stream on ANY iframe
          resize (same policing as the focus-resize, see the ResizeObserver
          comment above). Reserving the row permanently makes label / audio /
          crown pushes pure paint changes the player never notices. */}
      <div
        className="h-6 shrink-0 flex items-center gap-2 bg-black border-l-[3px] pl-2 pr-2.5 text-xs font-display font-semibold uppercase tracking-wide text-white"
        style={{
          borderLeftColor:
            source.type !== "invalid" && source.type !== "unsupported"
              ? PLATFORM_COLORS[source.platform]
              : "#8F8C83",
        }}
      >
          {/* Crown — ALWAYS mounted, toggled via `visibility` only, and NO
              glow filter. Two hard-won constraints:
              1. drop-shadow/box-shadow paint beyond the element's box; from
                 this strip a 4px glow reaches into the Twitch iframe above,
                 and Twitch treats painted-over pixels as occlusion → it
                 vetoes play() PERSISTENTLY while the glow exists (streams
                 froze the moment the crown appeared, and stayed frozen).
              2. Toggling via visibility instead of mount/unmount means a
                 crown push mutates one style attribute — no node insertion,
                 no layout shift — the same paint class as a label text edit,
                 which pushes have always done safely. */}
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5 shrink-0 text-[#FFD60A]"
            style={{ visibility: lead ? "visible" : "hidden" }}
            fill="currentColor"
            aria-label={lead ? "Race leader" : undefined}
            aria-hidden={lead ? undefined : true}
          >
            <title>Race leader</title>
            <path d="M2 4.5 5 7l3-4 3 4 3-2.5L12.6 11H3.4L2 4.5Z" />
            <rect x="3.4" y="12" width="9.2" height="1.6" rx="0.4" />
          </svg>
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
    a.lead === b.lead &&
    a.lowQuality === b.lowQuality &&
    a.twId === b.twId &&
    JSON.stringify(a.source) === JSON.stringify(b.source)
);
export default ViewerCell;
