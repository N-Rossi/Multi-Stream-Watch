"use client";
import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import type { Slot, Platform } from "@/lib/types";
import { buildEmbed } from "@/lib/buildEmbed";

// ── Twitch Player JS API ───────────────────────────────────────────────────
// Loaded once, shared across all cells. Lets us call player.setMuted()
// without rebuilding the iframe src (which would pause the stream).

interface TwitchPlayerInstance {
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  addEventListener(event: string, cb: () => void): void;
}

type TwitchPlayerCtor = (new (id: string, opts: Record<string, unknown>) => TwitchPlayerInstance) & {
  PLAYING: string;
};

interface TwitchWindow extends Window {
  Twitch?: { Player: TwitchPlayerCtor };
}

let twitchScriptPromise: Promise<void> | null = null;
function loadTwitchScript(): Promise<void> {
  if (!twitchScriptPromise) {
    twitchScriptPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined") { reject(); return; }
      if ((window as TwitchWindow).Twitch?.Player) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://player.twitch.tv/js/embed/v1.js";
      s.onload = () => resolve();
      s.onerror = () => { twitchScriptPromise = null; reject(); };
      document.head.appendChild(s);
    });
  }
  return twitchScriptPromise;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const PLATFORM_COLORS: Record<Platform, string> = {
  yt: "#FF0033",
  tw: "#9146FF",
  kick: "#53FC18",
  bili: "#00AEEC",
  file: "#FFB224",
};

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

    loadTwitchScript()
      .then(() => {
        if (cancelled) return;
        const tw = (window as TwitchWindow).Twitch;
        if (!tw || !document.getElementById(twContainerId)) return;

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

        const player = new tw.Player(twContainerId, opts);
        if (!cancelled) twitchPlayerRef.current = player;
        // Apply the real mute state once playback has started.
        player.addEventListener(tw.Player.PLAYING, () => {
          if (!cancelled) player.setMuted(muted);
        });
      })
      .catch(() => {/* script blocked — cell stays black */});

    return () => {
      cancelled = true;
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
      ref={cellRef}
      className={[
        "relative bg-panel overflow-hidden group border",
        isAudioSlot && slot ? "border-tally shadow-[0_0_0_2px_#FF453A]" : "border-line",
        className ?? "",
      ].join(" ")}
    >
      {/* Full-bleed content */}
      <div className="absolute inset-0">
        {!slot ? (
          /* Empty cell */
          <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
            <span className="font-mono text-5xl font-bold text-line">{index + 1}</span>
            <span className="font-mono text-xs tracking-widest text-dim">NO SIGNAL</span>
            <form onSubmit={handleAddUrl} className="flex gap-1 mt-2 px-4 w-full max-w-xs">
              <input
                className="flex-1 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
                placeholder="Paste URL…"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button type="submit" className="px-2 py-1 text-xs font-mono bg-signal text-bg rounded hover:brightness-110 transition">
                ADD
              </button>
            </form>
          </div>
        ) : isTwitch ? (
          /* Outer div is React-owned; Twitch.Player replaces the inner div with
             its iframe — keeping them separate prevents a removeChild mismatch. */
          <div
            className="absolute inset-0 w-full h-full origin-center"
            style={{ transform: `scale(${coverScale})` }}
          >
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
                <span className="font-mono text-[10px] text-amber">
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
            <span className="font-mono text-amber text-xs">UNSUPPORTED</span>
            <span className="font-mono text-dim text-[11px]">{embedConfig.message}</span>
          </div>
        ) : null}
      </div>

      {/* Label / controls overlay */}
      {slot && (
        <div
          className={[
            "absolute top-0 inset-x-0 z-20 flex items-start justify-between gap-2 px-2 py-2",
            "bg-gradient-to-b from-black/70 via-black/25 to-transparent",
            "transition-opacity duration-150",
            showLabels ? "opacity-100" : "opacity-0 group-hover:opacity-100",
          ].join(" ")}
        >
          {/* Name chip — broadcast lower-third style */}
          {editingName ? (
            <input
              autoFocus
              className="flex-1 min-w-0 bg-black/60 backdrop-blur-md rounded-md pl-2.5 pr-2 py-1 text-sm font-display font-semibold tracking-wide text-white border-l-[3px] border-signal outline-none"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingName(false); }}
            />
          ) : (
            <div
              className="flex items-center gap-2 min-w-0 rounded-md bg-black/55 backdrop-blur-md pl-2.5 pr-2 py-1 border-l-[3px] shadow-sm shadow-black/40"
              style={{ borderLeftColor: platform ? PLATFORM_COLORS[platform] : "#79828D" }}
            >
              <span
                className="text-sm font-display font-semibold tracking-wide text-white truncate cursor-pointer select-none leading-tight"
                onDoubleClick={startRename}
                title="Double-click to rename"
              >
                {slot.label}
              </span>
            </div>
          )}

          {/* Hover controls */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onSoloAudio(index)}
              title={isAudioSlot ? "Mute" : "Solo audio"}
              className={[
                "px-1.5 py-1 text-[10px] font-mono rounded border backdrop-blur-md bg-black/40 transition-colors",
                isAudioSlot ? "bg-tally/30 border-tally text-tally" : "border-white/25 text-white/60 hover:text-white hover:border-signal",
              ].join(" ")}
            >
              {isAudioSlot ? "MUTE" : "SOLO"}
            </button>
            <button onClick={startRename} title="Rename" className="px-1.5 py-1 text-[10px] font-mono rounded border border-white/25 backdrop-blur-md bg-black/40 text-white/60 hover:text-white hover:border-signal transition-colors">
              REN
            </button>
            <button onClick={() => onRemove(index)} title="Remove" className="px-1.5 py-1 text-[10px] font-mono rounded border border-white/25 backdrop-blur-md bg-black/40 text-white/60 hover:text-tally hover:border-tally transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
