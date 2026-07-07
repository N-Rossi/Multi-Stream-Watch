"use client";
import type { BoardConfig, BoardLayout } from "@/lib/types";
import ViewerCell from "./ViewerCell";

// Reconciling renderer. Every populated slot is mounted exactly once, keyed by
// its stable slot id. Layout and focus are applied as pure CSS over those
// mounted cells, so they cause ZERO remounts — feeds never reload for a
// cosmetic push. Only a slot whose source changed gets a new player (the memo
// + changed props inside ViewerCell handle that), and emptied slots unmount.

const GRID_CLASS: Record<BoardLayout, string> = {
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-4 grid-rows-2", // featured 3-up: two on top, one centered below
  4: "grid-cols-2 grid-rows-2",
  9: "grid-cols-3 grid-rows-3",
};

// Per-cell grid placement, by index within the visible set (only 3-up spans).
function cellPlacement(layout: BoardLayout, index: number): string {
  if (layout === 3) {
    if (index === 2) return "col-start-2 col-span-2";
    return "col-span-2";
  }
  // 2-up: half-height cells, vertically centered, so each keeps a widescreen
  // shape instead of stretching into a tall vertical panel.
  if (layout === 2) return "self-center h-1/2";
  return "";
}

export default function ViewerGrid({ config }: { config: BoardConfig }) {
  const { layout, slots, focusedSlot, audioSlot } = config;

  const populated = slots.filter((s) => s.source !== null);
  const visible = populated.slice(0, layout);
  const visibleIndex = new Map(visible.map((s, i) => [s.id, i]));
  const focusActive = focusedSlot !== null && populated.some((s) => s.id === focusedSlot);

  return (
    <div
      className={
        focusActive
          ? "relative w-full h-full bg-black"
          : `grid w-full h-full gap-px bg-black ${GRID_CLASS[layout]}`
      }
    >
      {populated.map((slot) => {
        const isFocused = slot.id === focusedSlot;
        const shown = focusActive ? isFocused : visibleIndex.has(slot.id);

        const placement = focusActive
          ? isFocused
            ? "absolute inset-0 z-10"
            : "hidden"
          : shown
            ? cellPlacement(layout, visibleIndex.get(slot.id) ?? 0)
            : "hidden";

        return (
          <div key={slot.id} className={placement}>
            <ViewerCell
              source={slot.source!}
              muted={slot.id !== audioSlot}
              label={slot.label}
              lowQuality={layout === 9}
              twId={`tw-viewer-${slot.id}`}
            />
          </div>
        );
      })}
    </div>
  );
}
