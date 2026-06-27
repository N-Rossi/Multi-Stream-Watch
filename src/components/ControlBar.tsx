"use client";
import { useState } from "react";
import type { Layout } from "@/lib/types";

const LAYOUTS: { id: Layout; label: string; title: string }[] = [
  { id: "single", label: "◻", title: "Single" },
  { id: "side-by-side", label: "◫", title: "Side by side" },
  { id: "featured", label: "⊡", title: "Featured + 2" },
  { id: "quad", label: "⊞", title: "Quad" },
];

type Props = {
  layout: Layout;
  onLayoutChange: (l: Layout) => void;
  onAddUrl: (url: string) => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
};

export default function ControlBar({
  layout,
  onLayoutChange,
  onAddUrl,
  onToggleFullscreen,
  isFullscreen,
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
