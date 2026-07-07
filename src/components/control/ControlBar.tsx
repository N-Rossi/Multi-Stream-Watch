"use client";
import { useState } from "react";
import type { BoardLayout } from "@/lib/types";
import { LAYOUTS } from "@/lib/board";

// Top bar for the control surface: brand, add-by-URL, the 1/2/3/4/9 layout
// selector, and Twitch auth. None of this reaches the viewer until Push.

const BTN =
  "flex items-center justify-center rounded-[3px] border font-display font-semibold uppercase tracking-[0.08em] transition-colors";
const BTN_IDLE = "border-line bg-panel2 text-dim hover:text-text hover:border-dim";

type Props = {
  layout: BoardLayout;
  room: string;
  onLayout: (layout: BoardLayout) => void;
  onAddUrl: (url: string) => void;
  twitchUsername: string | null;
  onTwitchLogin: () => void;
  onTwitchLogout: () => void;
};

export default function ControlBar({
  layout,
  room,
  onLayout,
  onAddUrl,
  twitchUsername,
  onTwitchLogin,
  onTwitchLogout,
}: Props) {
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
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-display italic font-bold text-sm tracking-wide text-text uppercase">
          Control
        </span>
        <span className="text-[10px] font-mono text-dim">/{room}</span>
        <a
          href="/"
          title="Back to the Multiviewer"
          className="text-[10px] font-display font-semibold uppercase tracking-[0.08em] text-dim hover:text-text transition-colors"
        >
          ← Home
        </a>
      </div>

      <div className="w-px h-4 bg-line mx-1" />

      <form onSubmit={submit} className="flex gap-1.5 flex-1 min-w-0">
        <input
          className="flex-1 min-w-0 bg-panel2 border border-line text-xs font-mono text-text px-2 py-1 rounded-[3px] focus:outline-none focus:border-amber placeholder:text-dim"
          placeholder="Paste YouTube / Twitch / Kick / Bilibili / .m3u8 URL → next empty slot…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          className="px-3 h-7 text-[11px] font-display font-semibold uppercase tracking-[0.08em] rounded-[3px] border border-line bg-panel2 text-text/80 hover:text-text hover:border-dim transition-colors shrink-0"
        >
          Add
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
              "w-7 h-7 flex items-center justify-center text-xs font-display font-semibold rounded-[3px] border transition-colors",
              layout === l
                ? "border-amber/70 bg-amber/15 text-amber shadow-[inset_0_0_8px_rgba(255,178,36,0.18)]"
                : "border-line bg-panel2 text-dim hover:text-text hover:border-dim",
            ].join(" ")}
          >
            {l}
          </button>
        ))}
      </div>

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
    </header>
  );
}
