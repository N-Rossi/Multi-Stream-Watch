"use client";
import { useState, type ReactNode } from "react";
import type { Layout } from "@/lib/types";

const ThreeWayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="12" height="12" rx="1" />
    <line x1="7" y1="1" x2="7" y2="7" />
    <line x1="1" y1="7" x2="13" y2="7" />
  </svg>
);

const Grid9Icon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="1" y="1" width="12" height="12" rx="1" />
    <line x1="5.33" y1="1" x2="5.33" y2="13" />
    <line x1="8.67" y1="1" x2="8.67" y2="13" />
    <line x1="1" y1="5.33" x2="13" y2="5.33" />
    <line x1="1" y1="8.67" x2="13" y2="8.67" />
  </svg>
);

const LAYOUTS: { id: Layout; label: ReactNode; title: string }[] = [
  { id: "single", label: "◻", title: "Single" },
  { id: "side-by-side", label: "◫", title: "Side by side" },
  { id: "featured", label: <ThreeWayIcon />, title: "3-Way" },
  { id: "quad", label: "⊞", title: "Quad" },
  { id: "grid9", label: <Grid9Icon />, title: "9 (3×3)" },
];

type Props = {
  layout: Layout;
  showLabels: boolean;
  onLayoutChange: (l: Layout) => void;
  onAddUrl: (url: string) => void;
  onToggleFullscreen: () => void;
  onToggleLabels: () => void;
  isFullscreen: boolean;
  twitchUsername: string | null;
  onTwitchLogin: () => void;
  onTwitchLogout: () => void;
};

export default function ControlBar({
  layout,
  showLabels,
  onLayoutChange,
  onAddUrl,
  onToggleFullscreen,
  onToggleLabels,
  isFullscreen,
  twitchUsername,
  onTwitchLogin,
  onTwitchLogout,
}: Props) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAddUrl(url.trim());
      setUrl("");
    }
  };

  return (
    <header className="flex items-center gap-3 px-3 py-2 bg-panel border-b border-line shrink-0">
      {/* Brand */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-tally animate-pulse" />
        <span className="font-display text-sm font-semibold tracking-widest text-text uppercase">
          Multiviewer
        </span>
      </div>

      <div className="w-px h-4 bg-line mx-1" />

      {/* URL input */}
      <form onSubmit={handleSubmit} className="flex gap-1.5 flex-1 min-w-0">
        <input
          className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
          placeholder="Paste YouTube / Twitch / Kick / Bilibili / .m3u8 URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          className="px-3 py-1 text-xs font-mono font-semibold bg-signal text-bg rounded hover:brightness-110 transition shrink-0"
        >
          ADD
        </button>
      </form>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Layout selector */}
      <div className="flex items-center gap-0.5 shrink-0">
        {LAYOUTS.map((l) => (
          <button
            key={l.id}
            title={l.title}
            onClick={() => onLayoutChange(l.id)}
            className={[
              "w-7 h-7 flex items-center justify-center text-base rounded border transition-colors",
              layout === l.id
                ? "bg-signal/20 border-signal text-signal"
                : "border-line text-dim hover:text-text hover:border-line",
            ].join(" ")}
          >
            {l.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Labels toggle */}
      <button
        onClick={onToggleLabels}
        title={showLabels ? "Hide labels (L)" : "Show labels (L)"}
        className={[
          "px-2 h-7 flex items-center text-[10px] font-mono rounded border transition-colors shrink-0",
          showLabels
            ? "bg-signal/15 border-signal text-signal"
            : "border-line text-dim hover:text-text hover:border-signal",
        ].join(" ")}
      >
        {showLabels ? "LABELS ON" : "LABELS OFF"}
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Twitch auth */}
      {twitchUsername ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-[#9146FF]">⬤</span>
          <span className="text-[10px] font-mono text-dim truncate max-w-[80px]" title={twitchUsername}>
            {twitchUsername}
          </span>
          <button
            onClick={onTwitchLogout}
            className="px-1.5 h-5 text-[9px] font-mono rounded border border-line text-dim hover:text-tally hover:border-tally transition-colors"
          >
            OUT
          </button>
        </div>
      ) : (
        <button
          onClick={onTwitchLogin}
          title="Log in with Twitch for ad-free viewing"
          className="px-2 h-7 flex items-center gap-1.5 text-[10px] font-mono rounded border border-[#9146FF]/40 text-[#9146FF]/70 hover:text-[#9146FF] hover:border-[#9146FF] transition-colors shrink-0"
        >
          <span className="text-[8px]">⬤</span> TWITCH
        </button>
      )}

      <div className="w-px h-4 bg-line mx-1" />

      {/* Fullscreen */}
      <button
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
        className="w-7 h-7 flex items-center justify-center text-xs font-mono rounded border border-line text-dim hover:text-text hover:border-signal transition-colors shrink-0"
      >
        {isFullscreen ? "⊠" : "⛶"}
      </button>
    </header>
  );
}
