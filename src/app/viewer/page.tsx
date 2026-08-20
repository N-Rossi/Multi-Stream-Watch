"use client";
import { useEffect, useRef, useState } from "react";
import type { BoardConfig } from "@/lib/types";
import { createSync } from "@/lib/sync";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useTwitchAuth } from "@/hooks/useTwitchAuth";
import ViewerGrid from "@/components/viewer/ViewerGrid";

// Clean program output. Renders only the published board. Open this in a second
// window, drag it to the second monitor, fullscreen once (button or F), and in
// OBS capture it with Window Capture — NOT a Browser Source (a Browser Source
// runs its own isolated browser and would never receive the channel pushes).

export default function ViewerPage() {
  const [published, setPublished] = useState<BoardConfig | null>(null);
  const [ready, setReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle } = useFullscreen(rootRef);
  // Twitch login happens on control or the home board; the token lands in
  // shared localStorage and this hook picks it up, so Turbo / sub accounts
  // get their ad-free entitlement in the viewer's players too. It resolves
  // asynchronously (validation fetch), so Twitch cells created before it
  // arrives rebuild once when it does.
  const { token: twitchToken } = useTwitchAuth();

  useEffect(() => {
    const room =
      new URLSearchParams(window.location.search).get("room") || "default";
    const sync = createSync(room);
    // Restore the live board instantly from localStorage (load + refresh),
    // then subscribe for future pushes.
    const current = sync.getCurrent();
    if (current) setPublished(current);
    setReady(true);
    const unsub = sync.subscribe((config) => {
      // Last push wins; ignore anything older than what we already show.
      setPublished((prev) =>
        !prev || config.version >= prev.version ? config : prev
      );
    });
    return () => {
      unsub();
      sync.close();
    };
  }, []);

  // F = fullscreen — used once during the local second-monitor setup.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "f" || e.key === "F") toggle();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle]);

  const hasContent = !!published?.slots.some((s) => s.source);

  return (
    <div
      ref={rootRef}
      className="relative w-screen h-screen bg-black overflow-hidden"
    >
      {hasContent ? (
        <ViewerGrid config={published!} twitchToken={twitchToken} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 select-none">
          <span className="w-2 h-2 rounded-[1px] bg-panel2 border border-line" />
          <span className="font-display font-semibold text-[11px] tracking-[0.35em] text-dim">
            {ready ? "WAITING FOR CONTROL" : "…"}
          </span>
        </div>
      )}

      {/* One-time local fullscreen control — shown ONLY while the board is
          empty. The moment content is up it must go: anything overlapping a
          Twitch iframe vetoes fresh starts and pauses started streams, and
          this button overlaps whichever cell owns the top-right corner in
          EVERY layout — the single full-viewport cell at layout 1 (verified
          live 2026-08-04: roster-drop into a Full board rendered a pure-black
          never-created player until this button was hidden), the focused
          cell, and the top-right cell of 2/3/4/9-up. Activation is not lost
          by hiding it: any click anywhere in the window grants user
          activation, and F toggles fullscreen at all times. */}
      {!isFullscreen && !hasContent && (
        <button
          onClick={toggle}
          title="Fullscreen (F)"
          className="absolute top-2 right-2 z-50 px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-[0.08em] bg-black/60 border border-line text-dim hover:text-text rounded-[3px]"
        >
          Fullscreen
        </button>
      )}
    </div>
  );
}
