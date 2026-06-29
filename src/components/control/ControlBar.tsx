"use client";
import { useState } from "react";
import type { BoardLayout } from "@/lib/types";
import { LAYOUTS } from "@/lib/board";

// Top bar for the control surface: brand, add-by-URL, and the 1/2/3/4/9 layout
// selector. None of this reaches the viewer until Push.

type Props = {
  layout: BoardLayout;
  room: string;
  onLayout: (layout: BoardLayout) => void;
  onAddUrl: (url: string) => void;
};

export default function ControlBar({ layout, room, onLayout, onAddUrl }: Props) {
  const [url, setUrl] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAddUrl(url.trim());
      setUrl("");
    }
  };

  return (
    <header className="flex items-center gap-3 px-3 py-2 bg-panel border-b border-line shrink-0">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="w-2.5 h-2.5 rounded-full bg-signal" />
        <span className="font-display text-sm font-semibold tracking-widest text-text uppercase">
          Control
        </span>
        <span className="text-[10px] font-mono text-dim">/{room}</span>
      </div>

      <div className="w-px h-4 bg-line mx-1" />

      <form onSubmit={submit} className="flex gap-1.5 flex-1 min-w-0">
        <input
          className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
          placeholder="Paste YouTube / Twitch / Kick / Bilibili / .m3u8 URL → next empty slot…"
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

      <div className="flex items-center gap-0.5 shrink-0">
        {LAYOUTS.map((l) => (
          <button
            key={l}
            title={`${l}-up`}
            onClick={() => onLayout(l)}
            className={[
              "w-7 h-7 flex items-center justify-center text-xs font-mono rounded border transition-colors",
              layout === l
                ? "bg-signal/20 border-signal text-signal"
                : "border-line text-dim hover:text-text hover:border-signal",
            ].join(" ")}
          >
            {l}
          </button>
        ))}
      </div>
    </header>
  );
}
