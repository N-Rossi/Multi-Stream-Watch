"use client";
import { useState } from "react";
import type { RosterEntry, Platform, Source } from "@/lib/types";
import { PLATFORM_COLORS } from "@/lib/platform";
import { DRAG_SLOT, DRAG_ROSTER } from "@/lib/roster";

// Saved-streamer tray at the bottom of the control page. Streamers added here
// (or anywhere on the board — every add is captured) persist across sessions,
// so a race board can be staged before the event starts. Chips drag onto slot
// cards (or click to fill the next empty slot); slot cards drag down here to
// clear them off the board while keeping the bookmark.

function platformOf(source: Source): Platform | null {
  return source.type !== "invalid" && source.type !== "unsupported"
    ? source.platform
    : null;
}

type Props = {
  roster: RosterEntry[];
  boardKeys: Set<string>; // sourceKeys currently on the board (chips shown as placed)
  onAdd: (raw: string) => string | null; // returns an error message, or null on success
  onPick: (key: string) => void; // click / no empty-slot-target drop → next empty slot
  onRemoveEntry: (key: string) => void;
  onSlotDropped: (slotId: string) => void; // card dragged into the tray → off the board
};

export default function RosterTray({
  roster,
  boardKeys,
  onAdd,
  onPick,
  onRemoveEntry,
  onSlotDropped,
}: Props) {
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!raw.trim()) return;
    const err = onAdd(raw.trim());
    setError(err);
    if (!err) setRaw("");
  };

  return (
    <div
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_SLOT)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDragOver(false);
        }
      }}
      onDrop={(e) => {
        setDragOver(false);
        const slotId = e.dataTransfer.getData(DRAG_SLOT);
        if (slotId) {
          e.preventDefault();
          onSlotDropped(slotId);
        }
      }}
      className={[
        "shrink-0 border-t px-3 py-2 bg-panel transition-colors",
        dragOver ? "border-amber bg-amber/10" : "border-line",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span className="font-display font-semibold text-[11px] uppercase tracking-[0.08em] text-dim shrink-0">
          Roster
        </span>
        <form onSubmit={submit} className="flex gap-1.5 shrink-0">
          <input
            className="w-56 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
            placeholder="Twitch name or any URL…"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
          />
          <button
            type="submit"
            className="px-2.5 py-1 text-[11px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-dim hover:text-text hover:border-dim transition-colors"
          >
            Save
          </button>
        </form>
        <span className="text-[11px] text-dim/80 truncate">
          {dragOver
            ? "Release to take this feed off the board (bookmark stays)"
            : error ??
              "Click a chip to fill the next slot, or drag it onto a specific slot. Drag a slot card down here to clear it."}
        </span>
      </div>

      {roster.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2 max-h-24 overflow-y-auto">
          {roster.map((entry) => {
            const onBoard = boardKeys.has(entry.key);
            const platform = platformOf(entry.source);
            const text =
              entry.label ||
              (platform ? (entry.source as { name: string }).name : entry.key);
            return (
              <div
                key={entry.key}
                draggable={!onBoard}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_ROSTER, entry.key);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => {
                  if (!onBoard) onPick(entry.key);
                }}
                title={
                  onBoard
                    ? "Already on the board"
                    : "Click: fill next empty slot · Drag: drop on a specific slot"
                }
                className={[
                  "group flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-[3px] border text-xs select-none transition-colors",
                  onBoard
                    ? "border-line bg-panel2/50 text-dim/60"
                    : "border-line bg-panel2 text-text cursor-grab active:cursor-grabbing hover:border-dim",
                ].join(" ")}
              >
                {platform && (
                  <span
                    className={[
                      "w-2 h-2 rounded-[1px] shrink-0",
                      onBoard ? "opacity-50" : "",
                    ].join(" ")}
                    style={{ backgroundColor: PLATFORM_COLORS[platform] }}
                  />
                )}
                <span className="max-w-[140px] truncate">{text}</span>
                {onBoard && (
                  <span className="text-[9px] font-display font-semibold uppercase tracking-[0.08em] text-amber/70">
                    On board
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveEntry(entry.key);
                  }}
                  title="Remove from roster"
                  className="px-1 py-0.5 text-[10px] rounded-[2px] text-dim/50 opacity-0 group-hover:opacity-100 hover:text-tally transition-opacity"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
