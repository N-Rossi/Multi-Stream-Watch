"use client";
import { useEffect, useReducer, useRef, useState, useCallback } from "react";
import type { BoardConfig, BoardLayout } from "@/lib/types";
import {
  boardReducer,
  emptyBoard,
  boardsEqual,
  bumpForPublish,
} from "@/lib/board";
import { createSync, type ViewerSync } from "@/lib/sync";
import ControlBar from "@/components/control/ControlBar";
import PushBar from "@/components/control/PushBar";
import SlotCard from "@/components/control/SlotCard";

// Operator surface. Holds an editable DRAFT board. Nothing here reaches the
// viewer until Push (the broadcast "take"). Control deliberately renders no
// video — only lightweight metadata cards.

export default function ControlPage() {
  const [draft, dispatch] = useReducer(boardReducer, undefined, emptyBoard);
  const [published, setPublished] = useState<BoardConfig | null>(null);
  const [room, setRoom] = useState("default");
  const syncRef = useRef<ViewerSync | null>(null);

  useEffect(() => {
    const r =
      new URLSearchParams(window.location.search).get("room") || "default";
    setRoom(r);
    const sync = createSync(r);
    syncRef.current = sync;
    // Adopt whatever is already live so control opens in sync with the viewer.
    const current = sync.getCurrent();
    if (current) {
      dispatch({ type: "LOAD", config: current });
      setPublished(current);
    }
    return () => sync.close();
  }, []);

  const baseline = published ?? emptyBoard();
  const dirty = !boardsEqual(draft, baseline);

  const handlePush = useCallback(() => {
    const next = bumpForPublish(draft, published?.version ?? 0);
    syncRef.current?.publish(next);
    setPublished(next);
    dispatch({ type: "LOAD", config: next }); // keep draft version in sync
  }, [draft, published]);

  const handleRevert = useCallback(() => {
    dispatch({ type: "LOAD", config: published ?? emptyBoard() });
  }, [published]);

  const openViewer = useCallback(() => {
    window.open(
      `/viewer?room=${encodeURIComponent(room)}`,
      "_blank",
      "noopener"
    );
  }, [room]);

  const visibleSlots = draft.slots.slice(0, draft.layout);

  return (
    <div className="flex flex-col h-screen bg-bg text-text overflow-hidden">
      <ControlBar
        layout={draft.layout}
        room={room}
        onLayout={(layout: BoardLayout) =>
          dispatch({ type: "SET_LAYOUT", layout })
        }
        onAddUrl={(url) => dispatch({ type: "ADD_URL", url })}
      />
      <PushBar
        dirty={dirty}
        version={published?.version ?? 0}
        onPush={handlePush}
        onRevert={handleRevert}
        onOpenViewer={openViewer}
      />

      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleSlots.map((slot, i) => (
            <SlotCard
              key={slot.id}
              slot={slot}
              position={i + 1}
              isFocused={draft.focusedSlot === slot.id}
              isAudio={draft.audioSlot === slot.id}
              onAddUrl={(url) =>
                dispatch({ type: "SET_SLOT_URL", id: slot.id, url })
              }
              onLabel={(label) =>
                dispatch({ type: "SET_LABEL", id: slot.id, label })
              }
              onFocus={() => dispatch({ type: "TOGGLE_FOCUS", id: slot.id })}
              onAudio={() => dispatch({ type: "TOGGLE_AUDIO", id: slot.id })}
              onRemove={() => dispatch({ type: "REMOVE_SLOT", id: slot.id })}
            />
          ))}
        </div>

        <p className="mt-4 text-[10px] font-mono text-dim/70 leading-relaxed">
          Edits stay on control until you Push. The viewer keeps playing
          unchanged feeds across pushes — only feeds whose URL changed reload.
          {draft.layout === 9 &&
            " 9-up runs 9 live players at once: heavy on CPU, GPU, and bandwidth."}
        </p>
      </div>
    </div>
  );
}
