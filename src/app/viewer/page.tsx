"use client";
import { useEffect, useRef, useState } from "react";
import type { BoardConfig } from "@/lib/types";
import { createSync } from "@/lib/sync";
import { useFullscreen } from "@/hooks/useFullscreen";
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
        <ViewerGrid config={published!} />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 select-none">
          <span className="w-2.5 h-2.5 rounded-full bg-signal animate-pulse" />
          <span className="font-mono text-xs tracking-widest text-dim">
            {ready ? "WAITING FOR CONTROL" : "…"}
          </span>
        </div>
      )}

      {/* One-time local fullscreen control; hides once fullscreen. */}
      {!isFullscreen && (
        <button
          onClick={toggle}
          title="Fullscreen (F)"
          className="absolute top-2 right-2 z-50 px-2 py-1 text-[10px] font-mono bg-black/50 border border-line text-dim hover:text-text rounded"
        >
          ⛶ FULLSCREEN
        </button>
      )}
    </div>
  );
}
