"use client";
import type { BoardConfig, BoardLayout } from "@/lib/types";
import ViewerCell from "./ViewerCell";

// Reconciling renderer. Every populated slot is mounted exactly once, keyed by
// its stable slot id, and rendered in a FIXED DOM order (sorted by id) that
// never changes with board order. Position on screen comes from explicit CSS
// grid coordinates instead. This matters because moving an iframe to a new
// place in the DOM reloads it — with fixed DOM order, reordering slots on
// control is a pure class change and feeds keep playing. Layout and focus are
// likewise pure CSS, so cosmetic pushes cause ZERO remounts. Only a slot whose
// source changed gets a new player (the memo + changed props inside ViewerCell
// handle that), and emptied slots unmount.

const GRID_CLASS: Record<BoardLayout, string> = {
  1: "grid-cols-1 grid-rows-1",
  2: "grid-cols-2 grid-rows-1",
  3: "grid-cols-4 grid-rows-2", // featured 3-up: two on top, one centered below
  4: "grid-cols-2 grid-rows-2",
  9: "grid-cols-3 grid-rows-3",
};

// Explicit placement for each visible position, per layout. Every visible cell
// gets fixed coordinates so grid auto-placement (which depends on DOM order)
// never decides where anything goes.
const PLACEMENT: Record<BoardLayout, string[]> = {
  1: ["col-start-1 row-start-1"],
  // 2-up: half-height cells, vertically centered, so each keeps a widescreen
  // shape instead of stretching into a tall vertical panel.
  2: [
    "col-start-1 row-start-1 self-center h-1/2",
    "col-start-2 row-start-1 self-center h-1/2",
  ],
  3: [
    "col-start-1 col-span-2 row-start-1",
    "col-start-3 col-span-2 row-start-1",
    "col-start-2 col-span-2 row-start-2",
  ],
  4: [
    "col-start-1 row-start-1",
    "col-start-2 row-start-1",
    "col-start-1 row-start-2",
    "col-start-2 row-start-2",
  ],
  9: [
    "col-start-1 row-start-1",
    "col-start-2 row-start-1",
    "col-start-3 row-start-1",
    "col-start-1 row-start-2",
    "col-start-2 row-start-2",
    "col-start-3 row-start-2",
    "col-start-1 row-start-3",
    "col-start-2 row-start-3",
    "col-start-3 row-start-3",
  ],
};

export default function ViewerGrid({ config }: { config: BoardConfig }) {
  const { layout, slots, focusedSlot, audioSlot } = config;

  const populated = slots.filter((s) => s.source !== null);
  const visible = populated.slice(0, layout);
  const visibleIndex = new Map(visible.map((s, i) => [s.id, i]));
  const focusActive =
    focusedSlot !== null && populated.some((s) => s.id === focusedSlot);

  // Stable render order, independent of board order (see header comment).
  const ordered = [...populated].sort((a, b) => a.id.localeCompare(b.id));

  // Focus is implemented INSIDE the grid — the focused cell spans every track
  // while the others hide — rather than as an absolute overlay on a non-grid
  // container. Verified live 2026-08-04 in real Chrome: a Twitch player whose
  // cell was `absolute inset-0 z-10` in a plain container had its START
  // permanently vetoed (fresh players sat on the play button; the identical
  // player in a grid cell autoplayed seconds earlier). Twitch's requirements
  // are opaque; staying a grid item keeps the iframe in the exact environment
  // where starts provably work, and the rendered result is the same
  // full-bleed frame.
  return (
    <div className={`grid w-full h-full gap-px bg-black ${GRID_CLASS[layout]}`}>
      {ordered.map((slot) => {
        const idx = visibleIndex.get(slot.id);
        const placement = focusActive
          ? slot.id === focusedSlot
            ? "col-start-1 row-start-1 col-span-full row-span-full"
            : "hidden"
          : idx !== undefined
            ? (PLACEMENT[layout][idx] ?? "hidden")
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
