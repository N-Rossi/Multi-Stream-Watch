/// <reference types="vitest/importMeta" />
import type { BoardConfig, BoardLayout, BoardSlot, Source } from "./types";

// The control surface edits a *draft* BoardConfig through this reducer. Nothing
// here touches the viewer — publishing is a separate step (see bumpForPublish).

export const MAX_SLOTS = 9;
export const LAYOUTS: BoardLayout[] = [1, 2, 3, 4, 9];

// All nine positions always exist with stable ids; layout only controls how
// many are shown. An empty position has source === null.
function emptySlot(i: number): BoardSlot {
  return { id: `slot-${i + 1}`, source: null, label: "", lead: false };
}

export function emptyBoard(): BoardConfig {
  return {
    version: 0,
    layout: 4,
    slots: Array.from({ length: MAX_SLOTS }, (_, i) => emptySlot(i)),
    focusedSlot: null,
    audioSlot: null,
  };
}

/** Default label for a freshly parsed source (blank for unparseable input). */
export function labelFor(source: Source): string {
  return source.type !== "invalid" && source.type !== "unsupported"
    ? source.name
    : "";
}

export type BoardAction =
  | { type: "ADD_SOURCE"; source: Source; label: string } // fill the next empty visible slot
  | { type: "SET_SLOT_SOURCE"; id: string; source: Source; label: string }
  | { type: "MOVE_SLOT"; from: string; to: string } // swap the two cells' positions
  | { type: "REMOVE_SLOT"; id: string }
  | { type: "SET_LABEL"; id: string; label: string }
  | { type: "SET_LAYOUT"; layout: BoardLayout }
  | { type: "TOGGLE_FOCUS"; id: string }
  | { type: "TOGGLE_AUDIO"; id: string }
  | { type: "TOGGLE_LEAD"; id: string } // race-leader crown; any number can be on
  | { type: "LOAD"; config: BoardConfig }; // replace draft (init / revert)

function withSlot(
  state: BoardConfig,
  id: string,
  patch: Partial<BoardSlot>
): BoardSlot[] {
  return state.slots.map((s) => (s.id === id ? { ...s, ...patch } : s));
}

export function boardReducer(
  state: BoardConfig,
  action: BoardAction
): BoardConfig {
  switch (action.type) {
    case "ADD_SOURCE": {
      // Next empty slot among the currently visible ones.
      const visible = state.slots.slice(0, state.layout);
      const target = visible.find((s) => s.source === null);
      if (!target) return state;
      const slots = withSlot(state, target.id, {
        source: action.source,
        label: action.label,
        lead: false,
      });
      // First populated slot on an all-muted board grabs audio by default.
      const audioSlot = state.audioSlot ?? target.id;
      return { ...state, slots, audioSlot };
    }

    case "SET_SLOT_SOURCE": {
      // A different streamer lands here — the crown belonged to the old one.
      const slots = withSlot(state, action.id, {
        source: action.source,
        label: action.label,
        lead: false,
      });
      const audioSlot = state.audioSlot ?? action.id;
      return { ...state, slots, audioSlot };
    }

    case "MOVE_SLOT": {
      // Swap the two slot objects' array positions. Ids travel with their
      // content, so audio/focus (tracked by id) follow the stream, and the
      // viewer — which keys cells by id and places them by position via pure
      // CSS — moves the picture without reloading the player.
      const a = state.slots.findIndex((s) => s.id === action.from);
      const b = state.slots.findIndex((s) => s.id === action.to);
      if (a < 0 || b < 0 || a === b) return state;
      const slots = [...state.slots];
      [slots[a], slots[b]] = [slots[b], slots[a]];
      return { ...state, slots };
    }

    case "REMOVE_SLOT": {
      const slots = withSlot(state, action.id, {
        source: null,
        label: "",
        lead: false,
      });
      return {
        ...state,
        slots,
        audioSlot: state.audioSlot === action.id ? null : state.audioSlot,
        focusedSlot: state.focusedSlot === action.id ? null : state.focusedSlot,
      };
    }

    case "SET_LABEL":
      return { ...state, slots: withSlot(state, action.id, { label: action.label }) };

    case "SET_LAYOUT": {
      // Compact first: populated slots pack to the front (order preserved,
      // whole slot objects move so ids — and audio/focus/lead — travel with
      // their stream, exactly like MOVE_SLOT). Without this, a board with a
      // gap ([feed, empty, feed]) shrunk to 2-up would show the blank and cut
      // off the third feed; compacted, the blank drops out and the feed slides
      // up. The viewer reorders by pure CSS, so nothing reloads.
      const slots = [
        ...state.slots.filter((s) => s.source !== null),
        ...state.slots.filter((s) => s.source === null),
      ];
      // If the audio slot still falls outside the new layout it would keep
      // sounding from a hidden cell on the viewer. Hand audio to the first
      // visible populated slot instead.
      const visible = slots.slice(0, action.layout);
      let audioSlot = state.audioSlot;
      if (audioSlot !== null && !visible.some((s) => s.id === audioSlot)) {
        audioSlot = visible.find((s) => s.source !== null)?.id ?? null;
      }
      return { ...state, layout: action.layout, slots, audioSlot };
    }

    case "TOGGLE_FOCUS": {
      const focusing = state.focusedSlot !== action.id;
      return {
        ...state,
        focusedSlot: focusing ? action.id : null,
        // Focusing means "watch this one" — bring the sound along in the same
        // take. Unfocusing leaves audio where it is (no snap-back); the Audio
        // button still overrides freely afterwards.
        audioSlot: focusing ? action.id : state.audioSlot,
      };
    }

    case "TOGGLE_AUDIO":
      return {
        ...state,
        audioSlot: state.audioSlot === action.id ? null : action.id,
      };

    case "TOGGLE_LEAD":
      return {
        ...state,
        slots: state.slots.map((s) =>
          s.id === action.id ? { ...s, lead: !s.lead } : s
        ),
      };

    case "LOAD":
      return action.config;

    default:
      return state;
  }
}

/** Copy the draft into a publishable config, incrementing the version. */
export function bumpForPublish(
  draft: BoardConfig,
  lastVersion: number
): BoardConfig {
  return { ...draft, version: lastVersion + 1 };
}

/** Equality ignoring version — used for the unpushed-changes indicator. */
export function boardsEqual(a: BoardConfig, b: BoardConfig): boolean {
  const strip = (c: BoardConfig) => JSON.stringify({ ...c, version: 0 });
  return strip(a) === strip(b);
}

/**
 * Smallest layout that fits `count` feeds. The viewer renders this instead of
 * the chosen layout when feeds don't fill it (2 feeds on a 4-up board render
 * 2-up), so removing streams never leaves empty grid cells. The chosen layout
 * still caps how many feeds are visible — this only ever shrinks.
 */
export function fitLayout(count: number): BoardLayout {
  for (const l of LAYOUTS) {
    if (count <= l) return l;
  }
  return 9;
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const src: Source = {
    type: "tw-channel",
    platform: "tw",
    channel: "test",
    name: "test",
    live: true,
  };

  describe("boardReducer TOGGLE_LEAD", () => {
    it("toggles lead on and off, allowing several at once", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "b" });
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-1" });
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-2" });
      expect(b.slots[0].lead).toBe(true);
      expect(b.slots[1].lead).toBe(true);
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-1" });
      expect(b.slots[0].lead).toBe(false);
      expect(b.slots[1].lead).toBe(true);
    });

    it("clears lead when the slot is emptied or its stream replaced", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-1" });
      b = boardReducer(b, { type: "REMOVE_SLOT", id: "slot-1" });
      expect(b.slots[0].lead).toBe(false);

      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-1" });
      b = boardReducer(b, {
        type: "SET_SLOT_SOURCE",
        id: "slot-1",
        source: src,
        label: "other",
      });
      expect(b.slots[0].lead).toBe(false);
    });

    it("SET_LAYOUT compacts gaps so populated slots pack to the front", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "b" });
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "c" });
      b = boardReducer(b, { type: "TOGGLE_AUDIO", id: "slot-3" });
      b = boardReducer(b, { type: "REMOVE_SLOT", id: "slot-2" }); // gap at position 2
      b = boardReducer(b, { type: "SET_LAYOUT", layout: 2 });
      // The blank dropped out and slot-3's stream slid up to position 2.
      expect(b.slots[0].id).toBe("slot-1");
      expect(b.slots[1].id).toBe("slot-3");
      expect(b.slots[1].source).not.toBeNull();
      expect(b.slots[2].source).toBeNull();
      // Audio was on slot-3, which is visible after compaction — it stays.
      expect(b.audioSlot).toBe("slot-3");
    });

    it("fitLayout picks the smallest layout that holds the feed count", () => {
      expect(fitLayout(0)).toBe(1);
      expect(fitLayout(1)).toBe(1);
      expect(fitLayout(2)).toBe(2);
      expect(fitLayout(3)).toBe(3);
      expect(fitLayout(4)).toBe(4);
      expect(fitLayout(5)).toBe(9);
      expect(fitLayout(9)).toBe(9);
    });

    it("lead travels with the stream on MOVE_SLOT", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "TOGGLE_LEAD", id: "slot-1" });
      b = boardReducer(b, { type: "MOVE_SLOT", from: "slot-1", to: "slot-2" });
      // The whole slot object (id + lead) moved to position 1.
      expect(b.slots[1].id).toBe("slot-1");
      expect(b.slots[1].lead).toBe(true);
    });
  });

  describe("boardReducer TOGGLE_FOCUS", () => {
    it("brings audio along when focusing, keeps it on unfocus", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" }); // audio -> slot-1
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "b" });
      b = boardReducer(b, { type: "TOGGLE_FOCUS", id: "slot-2" });
      expect(b.focusedSlot).toBe("slot-2");
      expect(b.audioSlot).toBe("slot-2"); // focus moved the sound too
      b = boardReducer(b, { type: "TOGGLE_FOCUS", id: "slot-2" }); // unfocus
      expect(b.focusedSlot).toBe(null);
      expect(b.audioSlot).toBe("slot-2"); // no snap-back
    });

    it("still allows overriding audio after focusing", () => {
      let b = emptyBoard();
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "a" });
      b = boardReducer(b, { type: "ADD_SOURCE", source: src, label: "b" });
      b = boardReducer(b, { type: "TOGGLE_FOCUS", id: "slot-2" });
      b = boardReducer(b, { type: "TOGGLE_AUDIO", id: "slot-1" });
      expect(b.focusedSlot).toBe("slot-2");
      expect(b.audioSlot).toBe("slot-1");
    });
  });
}