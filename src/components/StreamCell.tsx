"use client";
import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import type { Slot } from "@/lib/types";
import { buildEmbed } from "@/lib/buildEmbed";
import { loadTwitchScript, getTwitchPlayer, insistOnPlay, type TwitchPlayerInstance } from "@/lib/twitch";
import { PLATFORM_COLORS } from "@/lib/platform";

// ── Component ──────────────────────────────────────────────────────────────

type Props = {
  index: number;
  slot: Slot | null;
  isAudioSlot: boolean;
  showLabels: boolean;
  onAddUrl: (index: number, url: string) => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onSoloAudio: (index: number) => void;
  className?: string;
  twitchToken: string | null;
};

export default function StreamCell({
  index,
  slot,
  isAudioSlot,
  showLabels,
  onAddUrl,
  onRemove,
  onRename,
  onSoloAudio,
  className,
  twitchToken,
}: Props) {
  const cellRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const twitchPlayerRef = useRef<TwitchPlayerInstance | null>(null);
  // Stable per-cell ID for the Twitch.Player container div
  const twContainerId = `tw-player-${index}`;

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [iframeSrc, setIframeSrc] = useState("");
  const [coverScale, setCoverScale] = useState(1);

  const muted = !isAudioSlot;
  const source = slot?.source;
  const isTwitch = source?.type === "tw-channel" || source?.type === "tw-vod";

  // Cover-scale: zoom iframe/player to fill cell (eliminates black bars)
  useLayoutEffect(() => {
    const el = cellRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      const ca = width / height;
      const va = 16 / 9;
      setCoverScale(ca > va ? ca / va : va / ca);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const getEmbedOpts = useCallback(
    () => ({
      muted,
      origin: typeof window !== "undefined" ? window.location.origin : "",
      hostname: typeof window !== "undefined" ? window.location.hostname : "localhost",
    }),
    [muted]
  );

  // Set iframe src when a new (non-Twitch) slot is loaded. Never rebuild for mute.
  // Always built MUTED: browsers only allow autoplay without sound, so an
  // unmuted embed would load paused. The audio slot is unmuted via the player
  // API once it's actually playing (applyMute, called on load / "playing").
  useEffect(() => {
    if (isTwitch) return;
    if (!source) { setIframeSrc(""); return; }
    const config = buildEmbed(source, { ...getEmbedOpts(), muted: true });
    if (config.kind === "iframe") setIframeSrc(config.src);
  }, [slot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize Twitch.Player when a Twitch slot is loaded.
  useEffect(() => {
    if (!isTwitch || !source) {
      twitchPlayerRef.current = null;
      return;
    }

    let cancelled = false;
    let stopInsisting: (() => void) | undefined;

    loadTwitchScript()
      .then(() => {
        if (cancelled) return;
        const Player = getTwitchPlayer();
        if (!Player || !document.getElementById(twContainerId)) return;

        const opts: Record<string, unknown> = {
          width: "100%",
          height: "100%",
          autoplay: true,
          muted: true, // start muted so autoplay is allowed; unmute on PLAYING
          parent: [window.location.hostname],
          ...(twitchToken ? { oauth_token: twitchToken } : {}),
        };
        if (source.type === "tw-channel") opts.channel = source.channel;
        if (source.type === "tw-vod") opts.video = source.videoId;

        const player = new Player(twContainerId, opts);
        if (!cancelled) twitchPlayerRef.current = player;
        stopInsisting = insistOnPlay(player);
        // Apply the real mute state once playback has started.
        player.addEventListener(Player.PLAYING, () => {
          if (cancelled) return;
          stopInsisting?.();
          player.setMuted(muted);
        });
      })
      .catch(() => {/* script blocked — cell stays black */});

    return () => {
      cancelled = true;
      stopInsisting?.();
      twitchPlayerRef.current = null;
      const el = document.getElementById(twContainerId);
      if (el) el.innerHTML = "";
    };
  }, [slot?.id, twitchToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mute control — NEVER rebuilds src, so streams never pause ─────────
  // Applies a mute state to the already-running player via its runtime API.
  const applyMute = useCallback((isMuted: boolean) => {
    if (!source) return;

    // Twitch: native Player API (setMuted is instant, no reload)
    if (isTwitch) {
      twitchPlayerRef.current?.setMuted(isMuted);
      return;
    }

    // YouTube: postMessage to running iframe (no reload)
    if (source.type === "yt-video" || source.type === "yt-channel") {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: isMuted ? "mute" : "unMute", args: [] }),
        "*"
      );
      return;
    }

    // Kick: try postMessage — works on recent Kick embed builds; no reload either way
    if (source.type === "kick-channel") {
      const msg = JSON.stringify({ event: isMuted ? "mute" : "unmute" });
      iframeRef.current?.contentWindow?.postMessage(msg, "https://player.kick.com");
      iframeRef.current?.contentWindow?.postMessage(msg, "*");
      return;
    }

    // Native video (HLS / file): flip the property — but don't unmute before
    // playback has started, or the browser's autoplay policy pauses it. The
    // video's onPlaying handler re-applies the real state once it's running.
    const video = videoRef.current;
    if (video) {
      video.muted = !isMuted && video.paused ? true : isMuted;
    }
  }, [source, isTwitch]);

  useEffect(() => {
    applyMute(muted);
  }, [muted, applyMute]);

  // HLS setup on slot change
  useEffect(() => {
    const config = source ? buildEmbed(source, getEmbedOpts()) : null;
    if (config?.kind !== "hls" || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = true; // start muted so autoplay is allowed; onPlaying unmutes
    let cleanup: (() => void) | undefined;
    import("hls.js").then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(config.url);
        hls.attachMedia(video);
        cleanup = () => hls.destroy();
      } else {
        video.src = config.url;
      }
    });
    return () => cleanup?.();
  }, [slot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) { onAddUrl(index, urlInput.trim()); setUrlInput(""); }
  };
  const startRename = () => { setNameInput(slot?.label ?? ""); setEditingName(true); };
  const commitRename = () => { if (nameInput.trim()) onRename(index, nameInput.trim()); setEditingName(false); };

  const embedConfig = source && !isTwitch ? buildEmbed(source, getEmbedOpts()) : null;
  const platform = source && source.type !== "invalid" && source.type !== "unsupported" ? source.platform : null;
  const isBili = source?.type === "bili-live" || source?.type === "bili-video";

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      className={[
        "relative bg-panel overflow-hidden group border flex flex-col",
        // Inset tally shadow, NOT outward: an outward glow paints over the
        // neighboring cells' iframes, and Twitch pauses/vetoes autoplay on any
        // occlusion of its iframe.
        isAudioSlot && slot ? "border-tally shadow-[inset_0_0_0_2px_#FF453A]" : "border-transparent",
        className ?? "",
      ].join(" ")}
    >
      {/* Name/controls strip — ABOVE the video box, never overlapping it:
          any element over the Twitch iframe vetoes autoplay and pauses a
          playing stream. Same construction as ViewerCell's label strip. */}
      {slot && (
        <div
          className="h-8 shrink-0 flex items-center justify-between gap-2 pr-2 bg-black border-l-[3px]"
          style={{ borderLeftColor: platform ? PLATFORM_COLORS[platform] : "#8F8C83" }}
        >
          {editingName ? (
            <input
              autoFocus
              className="flex-1 min-w-0 bg-black pl-2 py-1 text-sm font-display font-semibold tracking-wide text-white border-l-2 border-amber outline-none"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(false); }}
            />
          ) : (
            <div
              className={[
                "flex items-center gap-2 min-w-0 pl-2 transition-opacity duration-150",
                showLabels ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              ].join(" ")}
            >
              <span
                className="text-[13px] font-display font-semibold tracking-wide uppercase text-white truncate cursor-pointer select-none leading-tight"
                onDoubleClick={startRename}
                title="Double-click to rename"
              >
                {slot.label}
              </span>
              {isAudioSlot && (
                <span
                  className="w-1.5 h-1.5 shrink-0 rounded-[1px] bg-tally shadow-[0_0_6px_#FF453A]"
                  title="On air"
                />
              )}
            </div>
          )}

          {/* Hover controls */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onSoloAudio(index)}
              title={isAudioSlot ? "Mute" : "Solo audio"}
              className={[
                "px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[2px] border bg-black/70 transition-colors",
                isAudioSlot ? "border-tally/70 text-tally" : "border-white/25 text-white/70 hover:text-white hover:border-white/60",
              ].join(" ")}
            >
              {isAudioSlot ? "Mute" : "Solo"}
            </button>
            <button onClick={startRename} title="Rename" className="px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[2px] border border-white/25 bg-black/70 text-white/70 hover:text-white hover:border-white/60 transition-colors">
              Rename
            </button>
            <button onClick={() => onRemove(index)} title="Remove" className="px-2 py-1 text-[10px] font-display font-semibold rounded-[2px] border border-white/25 bg-black/70 text-white/70 hover:text-tally hover:border-tally/70 transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Video area (cellRef here so cover-scale measures the actual box) */}
      <div ref={cellRef} className="relative flex-1 min-h-0 overflow-hidden">
        {!slot ? (
          /* Empty cell — switcher input waiting for a source */
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <span className="font-display font-bold text-6xl leading-none text-line">{index + 1}</span>
            <span className="font-display font-semibold text-[11px] tracking-[0.35em] text-dim">NO SIGNAL</span>
            <form onSubmit={handleAddUrl} className="flex gap-1 mt-2 px-4 w-full max-w-xs">
              <input
                className="flex-1 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
                placeholder="Paste URL…"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button type="submit" className="px-2.5 py-1 text-[11px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-dim hover:text-text hover:border-dim transition-colors">
                Add
              </button>
            </form>
          </div>
        ) : isTwitch ? (
          /* Outer div is React-owned; Twitch.Player replaces the inner div with
             its iframe — keeping them separate prevents a removeChild mismatch.
             NO cover-scale on Twitch — ever: scaling pushes the iframe's
             geometry beyond its clip box (under the strip / adjacent cells),
             which Twitch treats as occlusion and pauses autoplay-started
             streams, never to recover (proven live July 18 2026). */
          <div className="absolute inset-0 w-full h-full">
            <div id={twContainerId} style={{ width: "100%", height: "100%" }} />
          </div>
        ) : embedConfig?.kind === "iframe" ? (
          <>
            <iframe
              ref={iframeRef}
              src={iframeSrc || undefined}
              className="absolute inset-0 w-full h-full origin-center"
              style={{ transform: `scale(${coverScale})` }}
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              onLoad={() => {
                // Embed starts muted for autoplay; apply the real mute state
                // once it's loaded. Retry shortly after for players (YouTube)
                // whose JS API becomes ready a beat after the iframe load event.
                applyMute(muted);
                setTimeout(() => applyMute(muted), 600);
              }}
            />
            {isBili && (
              <div className="absolute bottom-0 inset-x-0 bg-amber/10 border-t border-amber/30 px-2 py-1 pointer-events-none z-10">
                <span className="text-[11px] text-amber">
                  Bilibili may be blocked depending on region/referrer
                </span>
              </div>
            )}
          </>
        ) : embedConfig?.kind === "hls" || embedConfig?.kind === "video" ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain bg-black"
            autoPlay
            muted
            onPlaying={() => applyMute(muted)}
            controls
            src={embedConfig.kind === "video" ? embedConfig.url : undefined}
          />
        ) : embedConfig?.kind === "unsupported" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
            <span className="font-display font-semibold text-[11px] tracking-[0.35em] text-amber">UNSUPPORTED</span>
            <span className="text-dim text-[11px]">{embedConfig.message}</span>
          </div>
        ) : null}
      </div>

    </div>
  );
}
