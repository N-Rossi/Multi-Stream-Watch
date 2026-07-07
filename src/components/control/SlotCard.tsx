"use client";
import { useState } from "react";
import type { BoardSlot, Platform } from "@/lib/types";
import { PLATFORM_COLORS } from "@/lib/platform";

// Lightweight, NON-playing card. Control never decodes video — that would mean
// every feed runs twice on one machine (brutal at 9-up). Just metadata + edits.

function sourceName(slot: BoardSlot): string {
  const s = slot.source;
  if (!s) return "";
  if (s.type === "invalid" || s.type === "unsupported") return s.message;
  return s.name;
}

function platformOf(slot: BoardSlot): Platform | null {
  const s = slot.source;
  if (!s || s.type === "invalid" || s.type === "unsupported") return null;
  return s.platform;
}

type Props = {
  slot: BoardSlot;
  position: number; // 1-based, for the corner number
  isFocused: boolean;
  isAudio: boolean;
  onAddUrl: (url: string) => void;
  onLabel: (label: string) => void;
  onFocus: () => void;
  onAudio: () => void;
  onRemove: () => void;
};

export default function SlotCard({
  slot,
  position,
  isFocused,
  isAudio,
  onAddUrl,
  onLabel,
  onFocus,
  onAudio,
  onRemove,
}: Props) {
  const [url, setUrl] = useState("");
  const platform = platformOf(slot);
  const name = sourceName(slot);
  const bad =
    slot.source?.type === "invalid" || slot.source?.type === "unsupported";

  const submitUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onAddUrl(url.trim());
      setUrl("");
    }
  };

  return (
    <div
      className={[
        "flex flex-col gap-2 rounded-[4px] border p-3 bg-panel transition-colors",
        isFocused
          ? "border-amber/70 shadow-[0_0_0_1px_rgba(255,178,36,0.4)]"
          : "border-line",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="font-display font-semibold text-[11px] text-dim w-4">
          {position}
        </span>
        {platform && (
          <span
            className="w-2 h-2 rounded-[1px] shrink-0"
            style={{ backgroundColor: PLATFORM_COLORS[platform] }}
          />
        )}
        <span
          className={[
            "flex-1 truncate text-xs",
            bad ? "text-amber" : slot.source ? "text-text" : "text-dim",
          ].join(" ")}
          title={name}
        >
          {slot.source ? name : "Empty"}
        </span>
        {slot.source && (
          <button
            onClick={onRemove}
            title="Remove"
            className="px-1.5 py-0.5 text-[10px] font-display font-semibold rounded-[2px] border border-line bg-panel2 text-dim hover:text-tally hover:border-tally/70 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {slot.source && !bad ? (
        <>
          <input
            className="w-full bg-panel2 border border-line text-xs text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
            placeholder="Label (racer / team)…"
            value={slot.label}
            onChange={(e) => onLabel(e.target.value)}
          />
          <div className="flex gap-1.5">
            <button
              onClick={onFocus}
              title="Show this feed 1-up on the viewer"
              className={[
                "flex-1 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border transition-colors",
                isFocused
                  ? "border-amber/70 bg-amber/15 text-amber shadow-[inset_0_0_8px_rgba(255,178,36,0.18)]"
                  : "border-line bg-panel2 text-dim hover:text-text hover:border-dim",
              ].join(" ")}
            >
              {isFocused ? "Focused" : "Focus"}
            </button>
            <button
              onClick={onAudio}
              title="Give this feed the audio"
              className={[
                "flex-1 px-2 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border transition-colors",
                isAudio
                  ? "border-tally/70 bg-tally/15 text-tally shadow-[inset_0_0_8px_rgba(255,69,58,0.18)]"
                  : "border-line bg-panel2 text-dim hover:text-text hover:border-dim",
              ].join(" ")}
            >
              {isAudio ? "On air" : "Audio"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submitUrl} className="flex gap-1.5">
          <input
            className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
            placeholder="Paste URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-[11px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-dim hover:text-text hover:border-dim transition-colors shrink-0"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
