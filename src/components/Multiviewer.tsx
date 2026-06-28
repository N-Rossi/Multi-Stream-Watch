"use client";
import { useReducer, useRef, useEffect, useCallback } from "react";
import type { Slot, Layout } from "@/lib/types";
import { parseSource } from "@/lib/parseSource";
import { useFullscreen } from "@/hooks/useFullscreen";
import ControlBar from "./ControlBar";
import StreamCell from "./StreamCell";

// ---- State ----------------------------------------------------------------

type State = {
  slots: (Slot | null)[];
  layout: Layout;
  audioSlot: number | null;
  showLabels: boolean;
};

type Action =
  | { type: "ADD"; url: string; index?: number }
  | { type: "REMOVE"; index: number }
  | { type: "RENAME"; index: number; name: string }
  | { type: "SET_LAYOUT"; layout: Layout }
  | { type: "SET_AUDIO_SLOT"; index: number }
  | { type: "TOGGLE_LABELS" };

function makeSlot(url: string): Slot {
  const source = parseSource(url);
  const label =
    source.type !== "invalid" && source.type !== "unsupported"
      ? source.name
      : "Unknown";
  return { id: crypto.randomUUID(), source, label };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD": {
      const slots = [...state.slots];
      const idx =
        action.index !== undefined
          ? action.index
          : slots.findIndex((s) => s === null);
      if (idx === -1 || idx >= 4) return state;
      slots[idx] = makeSlot(action.url);
      const hasAudio =
        state.audioSlot !== null && slots[state.audioSlot] !== null;
      return { ...state, slots, audioSlot: hasAudio ? state.audioSlot : idx };
    }

    case "REMOVE": {
      const slots = [...state.slots];
      slots[action.index] = null;
      const audioSlot =
        state.audioSlot === action.index
          ? slots.findIndex((s) => s !== null)
          : state.audioSlot;
      return {
        ...state,
        slots,
        audioSlot: audioSlot === -1 ? null : audioSlot,
      };
    }

    case "RENAME": {
      const slots = [...state.slots];
      const slot = slots[action.index];
      if (!slot) return state;
      slots[action.index] = { ...slot, label: action.name };
      return { ...state, slots };
    }

    case "SET_LAYOUT":
      return { ...state, layout: action.layout };

    case "SET_AUDIO_SLOT":
      return { ...state, audioSlot: state.audioSlot === action.index ? null : action.index };

    case "TOGGLE_LABELS":
      return { ...state, showLabels: !state.showLabels };

    default:
      return state;
  }
}

const initialState: State = {
  slots: [null, null, null, null],
  layout: "quad",
  audioSlot: null,
  showLabels: true,
};

// ---- Layout CSS -----------------------------------------------------------

const LAYOUT_CLASSES: Record<Layout, string> = {
  single: "grid-cols-1 grid-rows-1",
  "side-by-side": "grid-cols-2 grid-rows-1",
  featured: "grid-cols-4 grid-rows-2",
  quad: "grid-cols-2 grid-rows-2",
};

function cellClass(layout: Layout, index: number): string {
  if (layout === "featured") {
    // 3-way: two equal cells on top, one centered on the bottom
    if (index === 2) return "col-start-2 col-span-2";
    return "col-span-2";
  }
  return "";
}

const LAYOUT_CELL_COUNT: Record<Layout, number> = {
  single: 1,
  "side-by-side": 2,
  featured: 3,
  quad: 4,
};

// ---- Component ------------------------------------------------------------

export default function Multiviewer() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const gridRef = useRef<HTMLDivElement>(null);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(gridRef);

  // F key = fullscreen, L key = toggle labels
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "f" || e.key === "F") toggleFullscreen();
      if (e.key === "l" || e.key === "L") dispatch({ type: "TOGGLE_LABELS" });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFullscreen]);

  const handleAddUrl = useCallback((url: string, index?: number) => {
    dispatch({ type: "ADD", url, index });
  }, []);

  const handleAddUrlAtIndex = useCallback((index: number, url: string) => {
    dispatch({ type: "ADD", url, index });
  }, []);

  const handleRemove = useCallback(
    (index: number) => dispatch({ type: "REMOVE", index }),
    []
  );

  const handleRename = useCallback(
    (index: number, name: string) => dispatch({ type: "RENAME", index, name }),
    []
  );

  const handleSetAudioSlot = useCallback(
    (index: number) => dispatch({ type: "SET_AUDIO_SLOT", index }),
    []
  );

  const handleLayoutChange = useCallback(
    (layout: Layout) => dispatch({ type: "SET_LAYOUT", layout }),
    []
  );

  const handleToggleLabels = useCallback(
    () => dispatch({ type: "TOGGLE_LABELS" }),
    []
  );

  const cellCount = LAYOUT_CELL_COUNT[state.layout];

  return (
    <div className="flex flex-col h-screen bg-bg text-text overflow-hidden">
      {!isFullscreen && (
        <ControlBar
          layout={state.layout}
          showLabels={state.showLabels}
          onLayoutChange={handleLayoutChange}
          onAddUrl={handleAddUrl}
          onToggleFullscreen={toggleFullscreen}
          onToggleLabels={handleToggleLabels}
          isFullscreen={isFullscreen}
        />
      )}

      <div
        ref={gridRef}
        className={[
          "flex-1 grid gap-px overflow-hidden",
          isFullscreen ? "bg-black" : "bg-bg",
          LAYOUT_CLASSES[state.layout],
        ].join(" ")}
        style={{ minHeight: 0 }}
      >
        {Array.from({ length: cellCount }, (_, i) => (
          <StreamCell
            key={i}
            index={i}
            slot={state.slots[i] ?? null}
            isAudioSlot={state.audioSlot === i}
            showLabels={state.showLabels}
            onAddUrl={handleAddUrlAtIndex}
            onRemove={handleRemove}
            onRename={handleRename}
            onSoloAudio={handleSetAudioSlot}
            className={cellClass(state.layout, i)}
          />
        ))}

        {isFullscreen && (
          <button
            onClick={toggleFullscreen}
            className="fixed top-2 right-2 z-50 px-2 py-1 text-xs font-mono bg-panel/80 border border-line text-dim hover:text-text rounded"
          >
            EXIT FS
          </button>
        )}
      </div>
    </div>
  );
}
