"use client";
import { useState, type ReactNode } from "react";
import type { Layout } from "@/lib/types";

// Panel-button styling: idle controls sit dark like unlit switches; the
// engaged one lights amber, the way hardware buttons illuminate.
const BTN =
  "flex items-center justify-center rounded-[3px] border font-display font-semibold uppercase tracking-[0.08em] transition-colors";
const BTN_IDLE = "border-line bg-panel2 text-dim hover:text-text hover:border-dim";
const BTN_LIT =
  "border-amber/70 bg-amber/15 text-amber shadow-[inset_0_0_8px_rgba(255,178,36,0.18)]";

const frame = (children: ReactNode) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 14 14"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
  >
    {children}
  </svg>
);

const LAYOUT_ICONS: Record<Layout, ReactNode> = {
  single: frame(<rect x="1" y="1" width="12" height="12" rx="1" />),
  "side-by-side": frame(
    <>
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="7" y1="1" x2="7" y2="13" />
    </>
  ),
  duo: frame(
    <>
      <rect x="1" y="4" width="5" height="6" rx="1" />
      <rect x="8" y="4" width="5" height="6" rx="1" />
    </>
  ),
  featured: frame(
    <>
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="7" y1="1" x2="7" y2="7" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </>
  ),
  quad: frame(
    <>
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="7" y1="1" x2="7" y2="13" />
      <line x1="1" y1="7" x2="13" y2="7" />
    </>
  ),
  grid9: frame(
    <>
      <rect x="1" y="1" width="12" height="12" rx="1" />
      <line x1="5.33" y1="1" x2="5.33" y2="13" />
      <line x1="8.67" y1="1" x2="8.67" y2="13" />
      <line x1="1" y1="5.33" x2="13" y2="5.33" />
      <line x1="1" y1="8.67" x2="13" y2="8.67" />
    </>
  ),
};

const FullscreenIcon = frame(
  <path d="M1 5V1h4 M9 1h4v4 M13 9v4H9 M5 13H1V9" />
);

const LAYOUTS: { id: Layout; title: string }[] = [
  { id: "single", title: "Single" },
  { id: "side-by-side", title: "Two — full height" },
  { id: "duo", title: "Two — equal size" },
  { id: "featured", title: "3-way" },
  { id: "quad", title: "Quad" },
  { id: "grid9", title: "3×3" },
];

type Props = {
  layout: Layout;
  showLabels: boolean;
  onAir: boolean;
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
  onAir,
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
      {/* Brand — the lamp is a real tally: lit red while any feed has audio */}
      <a href="/" title="Home" className="flex items-center gap-2 shrink-0">
        <span
          className={[
            "w-2 h-2 rounded-[1px]",
            onAir
              ? "bg-tally shadow-[0_0_6px_#FF453A]"
              : "bg-panel2 border border-line",
          ].join(" ")}
          title={onAir ? "On air — a feed has audio" : "All feeds muted"}
        />
        <span className="font-display italic font-bold text-sm tracking-wide text-text uppercase">
          Multiviewer
        </span>
      </a>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Control room — the operator surface that pushes to /viewer */}
      <a
        href="/control"
        title="Open the control room — build a board and push it to a viewer"
        className={[BTN, "px-2.5 h-7 gap-1.5 text-[11px]", BTN_IDLE, "shrink-0"].join(" ")}
      >
        {frame(
          <>
            <rect x="1" y="1" width="12" height="12" rx="1" />
            <line x1="1" y1="9" x2="13" y2="9" />
            <circle cx="4" cy="11" r="0.5" fill="currentColor" />
            <circle cx="7" cy="11" r="0.5" fill="currentColor" />
            <circle cx="10" cy="11" r="0.5" fill="currentColor" />
          </>
        )}
        Control
      </a>

      <div className="w-px h-4 bg-line mx-1" />

      {/* URL input — mono because it holds data, not UI text */}
      <form onSubmit={handleSubmit} className="flex gap-1.5 flex-1 min-w-0">
        <input
          className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
          placeholder="Paste YouTube / Twitch / Kick / Bilibili / .m3u8 URL…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          className={[BTN, "px-3 h-7 text-[11px]", BTN_IDLE, "text-text/80"].join(" ")}
        >
          Add
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
            className={[BTN, "w-7 h-7", layout === l.id ? BTN_LIT : BTN_IDLE].join(" ")}
          >
            {LAYOUT_ICONS[l.id]}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Labels toggle — lit while labels are shown */}
      <button
        onClick={onToggleLabels}
        title={showLabels ? "Hide labels (L)" : "Show labels (L)"}
        className={[BTN, "px-2.5 h-7 text-[11px]", showLabels ? BTN_LIT : BTN_IDLE].join(" ")}
      >
        Labels
      </button>

      <div className="w-px h-4 bg-line mx-1" />

      {/* Twitch auth */}
      {twitchUsername ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-[1px] bg-[#9146FF] shrink-0" />
          <span
            className="text-[11px] text-dim truncate max-w-[80px]"
            title={twitchUsername}
          >
            {twitchUsername}
          </span>
          <button
            onClick={onTwitchLogout}
            className={[BTN, "px-1.5 h-5 text-[9px]", BTN_IDLE, "hover:text-tally hover:border-tally"].join(" ")}
          >
            Log out
          </button>
        </div>
      ) : (
        <button
          onClick={onTwitchLogin}
          title="Log in with Twitch for ad-free viewing"
          className={[BTN, "px-2.5 h-7 gap-1.5 text-[11px]", BTN_IDLE, "shrink-0"].join(" ")}
        >
          <span className="w-1.5 h-1.5 rounded-[1px] bg-[#9146FF]" /> Twitch
        </button>
      )}

      <div className="w-px h-4 bg-line mx-1" />

      {/* Fullscreen */}
      <button
        onClick={onToggleFullscreen}
        title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen (F)"}
        className={[BTN, "w-7 h-7", BTN_IDLE].join(" ")}
      >
        {FullscreenIcon}
      </button>
    </header>
  );
}
