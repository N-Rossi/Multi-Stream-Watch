"use client";
import { useState } from "react";
import type { BoardBookmark } from "@/lib/types";
import { MAX_BOOKMARKS } from "@/lib/bookmarks";

// Saved board states, recalled like switcher presets — but through the normal
// preview/take flow: Save snapshots the CURRENT DRAFT under a name; clicking a
// chip loads that board into the draft, and nothing reaches the viewer until
// Push. Re-saving an existing name updates that bookmark.

type Props = {
  bookmarks: BoardBookmark[];
  activeName: string | null; // bookmark currently live on the viewer, if any
  onSave: (name: string) => string | null; // error message, or null on success
  onRecall: (name: string) => void;
  onRemove: (name: string) => void;
};

export default function BookmarkBar({
  bookmarks,
  activeName,
  onSave,
  onRecall,
  onRemove,
}: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = onSave(name);
    setError(err);
    if (!err) setName("");
  };

  const full = bookmarks.length >= MAX_BOOKMARKS;

  return (
    <div className="shrink-0 flex items-center gap-3 flex-wrap border-b border-line bg-panel px-3 py-2">
      <span className="font-display font-semibold text-[11px] uppercase tracking-[0.08em] text-dim shrink-0">
        Bookmarks
      </span>

      <form onSubmit={submit} className="flex gap-1.5 shrink-0">
        <input
          className="w-40 bg-panel2 border border-line text-xs text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
          placeholder="Name this board…"
          maxLength={24}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <button
          type="submit"
          title={
            full
              ? `Re-save an existing name to update it (limit ${MAX_BOOKMARKS})`
              : "Save the current board as a state"
          }
          className="px-2.5 py-1 text-[11px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-dim hover:text-text hover:border-dim transition-colors shrink-0"
        >
          Save state
        </button>
      </form>

      {bookmarks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 min-w-0">
          {bookmarks.map((b) => {
            const active = b.name === activeName;
            const feeds = b.config.slots.filter((s) => s.source).length;
            return (
              <div
                key={b.name}
                onClick={() => onRecall(b.name)}
                title={`Load "${b.name}" into the draft (${feeds} feed${feeds === 1 ? "" : "s"}) — press Push to send it live`}
                className={[
                  "group flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-[3px] border text-xs select-none cursor-pointer transition-colors",
                  active
                    ? "border-amber/70 bg-amber/10 text-amber"
                    : "border-line bg-panel2 text-text hover:border-dim",
                ].join(" ")}
              >
                <span className="max-w-[120px] truncate">{b.name}</span>
                <span className="text-[10px] text-dim/80 shrink-0">{feeds}</span>
                {active && (
                  <span
                    className="w-1.5 h-1.5 rounded-[1px] bg-amber shadow-[0_0_5px_#FFB224] shrink-0"
                    title="Live on the viewer"
                  />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(b.name);
                  }}
                  title="Delete this saved state"
                  className="px-1 py-0.5 text-[10px] rounded-[2px] text-dim/50 opacity-0 group-hover:opacity-100 hover:text-tally transition-opacity"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      <span className="text-[11px] text-dim/80 truncate">
        {error ??
          (bookmarks.length === 0
            ? "Save the current board as a named state, then load it back anytime."
            : "Click a state to load it into the draft, then press Push to take it live.")}
      </span>
    </div>
  );
}
