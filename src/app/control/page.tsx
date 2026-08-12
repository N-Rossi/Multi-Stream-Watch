"use client";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useCallback,
} from "react";
import type {
  BoardBookmark,
  BoardConfig,
  BoardLayout,
  RosterEntry,
  Source,
} from "@/lib/types";
import {
  boardReducer,
  emptyBoard,
  boardsEqual,
  bumpForPublish,
  labelFor,
} from "@/lib/board";
import { parseSource } from "@/lib/parseSource";
import {
  loadRoster,
  saveRoster,
  upsertEntry,
  removeEntry,
  sourceKey,
} from "@/lib/roster";
import {
  loadBookmarks,
  saveBookmarks,
  upsertBookmark,
  removeBookmark,
  alignBookmarkToBoard,
} from "@/lib/bookmarks";
import { createSync, type ViewerSync } from "@/lib/sync";
import { useTwitchAuth } from "@/hooks/useTwitchAuth";
import ControlBar from "@/components/control/ControlBar";
import PushBar from "@/components/control/PushBar";
import BookmarkBar from "@/components/control/BookmarkBar";
import SlotCard from "@/components/control/SlotCard";
import RosterTray from "@/components/control/RosterTray";

// Operator surface. Holds an editable DRAFT board. Nothing here reaches the
// viewer until Push (the broadcast "take"). Control deliberately renders no
// video — only lightweight metadata cards.

/**
 * Roster input accepts bare Twitch names ("dalek") as well as full URLs —
 * staging a race roster is overwhelmingly a list of Twitch channels.
 */
function parseRosterInput(raw: string): Source {
  const bareName = /^[A-Za-z0-9_]{2,25}$/.test(raw);
  return parseSource(bareName ? `twitch.tv/${raw}` : raw);
}

export default function ControlPage() {
  const [draft, dispatch] = useReducer(boardReducer, undefined, emptyBoard);
  const [published, setPublished] = useState<BoardConfig | null>(null);
  const [room, setRoom] = useState("default");
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [bookmarks, setBookmarks] = useState<BoardBookmark[]>([]);
  const syncRef = useRef<ViewerSync | null>(null);
  const twitch = useTwitchAuth();

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
    setRoster(loadRoster());
    setBookmarks(loadBookmarks());
    return () => sync.close();
  }, []);

  const mutateRoster = useCallback(
    (fn: (r: RosterEntry[]) => RosterEntry[]) => {
      setRoster((prev) => {
        const next = fn(prev);
        if (next !== prev) saveRoster(next);
        return next;
      });
    },
    []
  );

  // Every stream that lands on the board is bookmarked, so anyone viewed this
  // session can be re-added from the tray later without re-pasting the URL.
  const captureToRoster = useCallback(
    (source: Source, label: string) => {
      mutateRoster((r) => upsertEntry(r, source, label));
    },
    [mutateRoster]
  );

  const handleAddUrl = useCallback(
    (url: string) => {
      const source = parseSource(url);
      const label = labelFor(source);
      dispatch({ type: "ADD_SOURCE", source, label });
      captureToRoster(source, label);
    },
    [captureToRoster]
  );

  const handleSetSlotUrl = useCallback(
    (id: string, url: string) => {
      const source = parseSource(url);
      const label = labelFor(source);
      dispatch({ type: "SET_SLOT_SOURCE", id, source, label });
      captureToRoster(source, label);
    },
    [captureToRoster]
  );

  // Slot label edits flow back into the matching bookmark, so the tray shows
  // racer names instead of raw channel names.
  const handleLabel = useCallback(
    (id: string, label: string) => {
      dispatch({ type: "SET_LABEL", id, label });
      const source = draft.slots.find((s) => s.id === id)?.source;
      const key = source ? sourceKey(source) : null;
      if (key) {
        mutateRoster((r) =>
          r.map((e) => (e.key === key ? { ...e, label } : e))
        );
      }
    },
    [draft.slots, mutateRoster]
  );

  const handleRosterAdd = useCallback(
    (raw: string): string | null => {
      const source = parseRosterInput(raw);
      if (source.type === "invalid" || source.type === "unsupported") {
        return source.message;
      }
      if (source.type === "tw-clip") {
        return "Clips can't be saved to the roster — paste the URL into a slot instead.";
      }
      mutateRoster((r) => upsertEntry(r, source, labelFor(source)));
      return null;
    },
    [mutateRoster]
  );

  const placeFromRoster = useCallback(
    (key: string, slotId: string | null) => {
      const entry = roster.find((e) => e.key === key);
      if (!entry) return;
      const label = entry.label || labelFor(entry.source);
      if (slotId) {
        dispatch({ type: "SET_SLOT_SOURCE", id: slotId, source: entry.source, label });
      } else {
        dispatch({ type: "ADD_SOURCE", source: entry.source, label });
      }
    },
    [roster]
  );

  // Card dragged into the tray: off the board, bookmark kept (re-captured in
  // case it was never in the roster, e.g. loaded from a pre-roster board).
  const handleSlotDroppedOnTray = useCallback(
    (slotId: string) => {
      const slot = draft.slots.find((s) => s.id === slotId);
      if (slot?.source) captureToRoster(slot.source, slot.label);
      dispatch({ type: "REMOVE_SLOT", id: slotId });
    },
    [draft.slots, captureToRoster]
  );

  const boardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of draft.slots) {
      const key = s.source ? sourceKey(s.source) : null;
      if (key) keys.add(key);
    }
    return keys;
  }, [draft.slots]);

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

  const handleSaveBookmark = useCallback(
    (name: string): string | null => {
      const res = upsertBookmark(bookmarks, name, draft);
      if (res.error) return res.error;
      setBookmarks(res.list);
      saveBookmarks(res.list);
      return null;
    },
    [bookmarks, draft]
  );

  const handleRemoveBookmark = useCallback((name: string) => {
    setBookmarks((prev) => {
      const next = removeBookmark(prev, name);
      saveBookmarks(next);
      return next;
    });
  }, []);

  // Recall loads the snapshot into the DRAFT only — the viewer doesn't change
  // until Push, like every other edit. Slot ids are aligned to the live board
  // at recall time (streams playing in both keep their players untouched when
  // the push lands — the viewer keys by slot id).
  const handleRecallBookmark = useCallback(
    (name: string) => {
      const bm = bookmarks.find((b) => b.name === name);
      if (!bm) return;
      dispatch({
        type: "LOAD",
        config: alignBookmarkToBoard(bm.config, published),
      });
    },
    [bookmarks, published]
  );

  // Which bookmark is live right now (for the chip highlight). Compared after
  // alignment, since recall rewrites slot ids.
  const activeBookmark = useMemo(() => {
    if (!published) return null;
    return (
      bookmarks.find((b) =>
        boardsEqual(alignBookmarkToBoard(b.config, published), published)
      )?.name ?? null
    );
  }, [bookmarks, published]);

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
        onAddUrl={handleAddUrl}
        twitchUsername={twitch.username}
        onTwitchLogin={twitch.login}
        onTwitchLogout={twitch.logout}
      />
      <PushBar
        dirty={dirty}
        version={published?.version ?? 0}
        onPush={handlePush}
        onRevert={handleRevert}
        onOpenViewer={openViewer}
      />
      <BookmarkBar
        bookmarks={bookmarks}
        activeName={activeBookmark}
        onSave={handleSaveBookmark}
        onRecall={handleRecallBookmark}
        onRemove={handleRemoveBookmark}
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
              isLead={!!slot.lead}
              onAddUrl={(url) => handleSetSlotUrl(slot.id, url)}
              onLabel={(label) => handleLabel(slot.id, label)}
              onFocus={() => dispatch({ type: "TOGGLE_FOCUS", id: slot.id })}
              onAudio={() => dispatch({ type: "TOGGLE_AUDIO", id: slot.id })}
              onLead={() => dispatch({ type: "TOGGLE_LEAD", id: slot.id })}
              onRemove={() => dispatch({ type: "REMOVE_SLOT", id: slot.id })}
              onSwapFrom={(fromId) =>
                dispatch({ type: "MOVE_SLOT", from: fromId, to: slot.id })
              }
              onRosterDrop={(key) => placeFromRoster(key, slot.id)}
            />
          ))}
        </div>

        <p className="mt-4 text-[11px] text-dim/80 leading-relaxed">
          Edits stay on control until you Push. The viewer keeps playing
          unchanged feeds across pushes — only feeds whose URL changed reload.
          Reordering slots never reloads a feed. The viewer auto-packs: it
          never shows empty cells, so 2 feeds on a 4-up board render 2-up.
          {draft.layout === 9 &&
            " 9-up runs 9 live players at once: heavy on CPU, GPU, and bandwidth."}
        </p>
      </div>

      <RosterTray
        roster={roster}
        boardKeys={boardKeys}
        onAdd={handleRosterAdd}
        onPick={(key) => placeFromRoster(key, null)}
        onRemoveEntry={(key) => mutateRoster((r) => removeEntry(r, key))}
        onSlotDropped={handleSlotDroppedOnTray}
        onClear={() => mutateRoster(() => [])}
      />
    </div>
  );
}
