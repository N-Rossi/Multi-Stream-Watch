"use client";
import { useState } from "react";
import type { BoardSlot, Platform } from "@/lib/types";

// Lightweight, NON-playing card. Control never decodes video — that would mean
// every feed runs twice on one machine (brutal at 9-up). Just metadata + edits.

const PLATFORM_COLORS: Record<Platform, string> = {
  yt: "#FF0033",
  tw: "#9146FF",
  kick: "#53FC18",
  bili: "#00AEEC",
  file: "#FFB224",
};

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
        "flex flex-col gap-2 rounded-lg border p-3 bg-panel transition-colors",
        isFocused ? "border-signal shadow-[0_0_0_1px_var(--color-signal)]" : "border-line",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-dim w-4">{position}</span>
        {platform && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: PLATFORM_COLORS[platform] }}
          />
        )}
        <span
          className={[
            "flex-1 truncate text-xs font-mono",
            bad ? "text-amber" : slot.source ? "text-text" : "text-dim",
          ].join(" ")}
          title={name}
        >
          {slot.source ? name : "empty"}
        </span>
        {slot.source && (
          <button
            onClick={onRemove}
            title="Remove"
            className="px-1.5 py-0.5 text-[10px] font-mono rounded border border-line text-dim hover:text-tally hover:border-tally transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      {slot.source && !bad ? (
        <>
          <input
            className="w-full bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
            placeholder="Label (racer / team)…"
            value={slot.label}
            onChange={(e) => onLabel(e.target.value)}
          />
          <div className="flex gap-1.5">
            <button
              onClick={onFocus}
              title="Show this feed 1-up on the viewer"
              className={[
                "flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors",
                isFocused
                  ? "bg-signal/20 border-signal text-signal"
                  : "border-line text-dim hover:text-text hover:border-signal",
              ].join(" ")}
            >
              {isFocused ? "● FOCUSED" : "FOCUS"}
            </button>
            <button
              onClick={onAudio}
              title="Give this feed the audio"
              className={[
                "flex-1 px-2 py-1 text-[10px] font-mono rounded border transition-colors",
                isAudio
                  ? "bg-tally/20 border-tally text-tally"
                  : "border-line text-dim hover:text-text hover:border-signal",
              ].join(" ")}
            >
              {isAudio ? "♪ AUDIO" : "MUTE"}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submitUrl} className="flex gap-1.5">
          <input
            className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded focus:outline-none focus:border-signal placeholder:text-dim"
            placeholder="Paste URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="submit"
            className="px-2 py-1 text-[10px] font-mono font-semibold bg-signal text-bg rounded hover:brightness-110 transition shrink-0"
          >
            ADD
          </button>
        </form>
      )}
    </div>
  );
}
