"use client";
import { useRef, useEffect, useState, useCallback } from "react";
import type { Slot, Source, Platform } from "@/lib/types";
import { buildEmbed } from "@/lib/buildEmbed";

const PLATFORM_COLORS: Record<Platform, string> = {
  yt: "#FF0033",
  tw: "#9146FF",
  kick: "#53FC18",
  bili: "#00AEEC",
  file: "#FFB224",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  yt: "YT",
  tw: "TW",
  kick: "KICK",
  bili: "BILI",
  file: "FILE",
};

function getLiveBadge(source: Source): { text: string; live: boolean } | null {
  if (source.type === "invalid" || source.type === "unsupported") return null;
  return source.live ? { text: "LIVE", live: true } : { text: source.type === "hls" ? "HLS" : "VOD", live: false };
}

type Props = {
  index: number;
  slot: Slot | null;
  isAudioSlot: boolean;
  onAddUrl: (index: number, url: string) => void;
  onRemove: (index: number) => void;
  onRename: (index: number, name: string) => void;
  onSoloAudio: (index: number) => void;
};

export default function StreamCell({
  index,
  slot,
  isAudioSlot,
  onAddUrl,
  onRemove,
  onRename,
  onSoloAudio,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const muted = !isAudioSlot;
  const source = slot?.source;

  // Get runtime values for embed building
  const getEmbedOpts = useCallback(() => ({
    muted,
    origin: typeof window !== "undefined" ? window.location.origin : "",
    hostname: typeof window !== "undefined" ? window.location.hostname : "localhost",
  }), [muted]);

  // Build embed config
  const embedConfig = source ? buildEmbed(source, getEmbedOpts()) : null;

  // Handle HLS setup
  useEffect(() => {
    if (embedConfig?.kind !== "hls" || !videoRef.current) return;
    const video = videoRef.current;
    video.muted = muted;

    import("hls.js").then(({ default: Hls }) => {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(embedConfig.url);
        hls.attachMedia(video);
        return () => hls.destroy();
      } else {
        video.src = embedConfig.url;
      }
    });
  }, [embedConfig?.kind === "hls" ? embedConfig.url : null]);

  // Sync video mute state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  // YouTube seamless mute via postMessage
  useEffect(() => {
    if (!iframeRef.current || !source) return;
    const isYT = source.type === "yt-video" || source.type === "yt-channel";
    if (!isYT) return;
    const func = muted ? "mute" : "unMute";
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "*"
    );
  }, [muted, source?.type]);

  // Rebuild iframe src for Twitch/Kick on mute change
  const [iframeSrc, setIframeSrc] = useState<string>("");
  useEffect(() => {
    if (!source) return;
    const isYT = source.type === "yt-video" || source.type === "yt-channel";
    if (isYT) return; // YT uses postMessage

    const config = buildEmbed(source, getEmbedOpts());
    if (config.kind === "iframe") {
      setIframeSrc(config.src);
    }
  }, [muted, source, getEmbedOpts]);

  // Set initial iframe src
  useEffect(() => {
    if (!source || !embedConfig || embedConfig.kind !== "iframe") return;
    setIframeSrc(embedConfig.src);
  }, [source?.type, (source as { videoId?: string })?.videoId]);

  const handleAddUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onAddUrl(index, urlInput.trim());
      setUrlInput("");
    }
  };

  const startRename = () => {
    setNameInput(slot?.label || "");
    setEditingName(true);
  };

  const commitRename = () => {
    if (nameInput.trim()) onRename(index, nameInput.trim());
    setEditingName(false);
  };

  const ch = `CH ${index + 1}`;
  const isBili = source?.type === "bili-live" || source?.type === "bili-video";
  const badge = source ? getLiveBadge(source) : null;
  const platform = source && source.type !== "invalid" && source.type !== "unsupported"
    ? source.platform
    : null;

  return (
    <div
      className={[
        "relative flex flex-col bg-panel overflow-hidden group",
        "border",
        isAudioSlot && slot ? "border-tally shadow-[0_0_0_2px_#FF453A]" : "border-line",
      ].join(" ")}
      style={{ minHeight: 0 }}
    >
      {/* Label strip */}
      <div className="flex items-center gap-2 px-2 py-1 bg-panel2 border-b border-line shrink-0 z-10">
        {platform && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: PLATFORM_COLORS[platform] }}
            title={PLATFORM_LABELS[platform]}
          />
        )}
        <span className="font-mono text-xs text-dim shrink-0">{ch}</span>

        {editingName ? (
          <input
            autoFocus
            className="flex-1 bg-transparent text-xs font-mono text-text border-b border-signal outline-none px-0.5"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <span
            className="flex-1 text-xs font-mono text-text truncate cursor-pointer select-none"
            onDoubleClick={startRename}
            title="Double-click to rename"
          >
            {slot?.label || <span className="text-dim italic">unnamed</span>}
          </span>
        )}

        {badge && (
          <span
            className={[
              "font-mono text-[10px] px-1 py-0 rounded shrink-0",
              badge.live ? "bg-tally text-white" : "bg-panel2 text-dim border border-line",
            ].join(" ")}
          >
            {badge.text}
          </span>
        )}

        {/* Hover controls */}
        {slot && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={() => onSoloAudio(index)}
              title={isAudioSlot ? "Mute" : "Solo audio"}
              className={[
                "px-1.5 py-0.5 text-[10px] font-mono rounded border transition-colors",
                isAudioSlot
                  ? "bg-tally/20 border-tally text-tally"
                  : "border-line text-dim hover:text-text hover:border-signal",
              ].join(" ")}
            >
              {isAudioSlot ? "MUTE" : "SOLO"}
            </button>
            <button
              onClick={startRename}
              title="Rename"
              className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-line text-dim hover:text-text hover:border-signal transition-colors"
            >
              REN
            </button>
            <button
              onClick={() => onRemove(index)}
              title="Remove"
              className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-line text-dim hover:text-tally hover:border-tally transition-colors"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
        {!slot ? (
          /* Empty cell */
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 select-none">
            <span className="font-mono text-5xl font-bold text-line">{index + 1}</span>
            <span className="font-mono text-xs tracking-widest text-dim">NO SIGNAL</span>
            <form onSubmit={handleAddUrl} className="flex gap-1 mt-2 px-4 w-full max-w-xs">
              <input
                className="flex-1 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
                placeholder="Paste URL..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
              />
              <button
                type="submit"
                className="px-2 py-1 text-xs font-mono bg-signal text-bg rounded hover:brightness-110 transition"
              >
                ADD
              </button>
            </form>
          </div>
        ) : embedConfig?.kind === "iframe" ? (
          <>
            <iframe
              ref={iframeRef}
              src={iframeSrc}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
            />
            {isBili && (
              <div className="absolute bottom-0 left-0 right-0 bg-amber/10 border-t border-amber/40 px-2 py-1 pointer-events-none">
                <span className="font-mono text-[10px] text-amber">
                  Bilibili may be blocked depending on region/referrer
                </span>
              </div>
            )}
          </>
        ) : embedConfig?.kind === "hls" || embedConfig?.kind === "video" ? (
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain"
            autoPlay
            muted={muted}
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
    </div>
  );
}
