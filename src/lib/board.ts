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
      // If the audio slot falls outside the new layout it would keep sounding
      // from a hidden cell on the viewer. Hand audio to the first visible
      // populated slot instead. (Any populated slot within the first `layout`
      // positions is also within the viewer's populated-slice view, so this
      // rule is safe for both surfaces.)
      const visible = state.slots.slice(0, action.layout);
      let audioSlot = state.audioSlot;
      if (audioSlot !== null && !visible.some((s) => s.id === audioSlot)) {
        audioSlot = visible.find((s) => s.source !== null)?.id ?? null;
      }
      return { ...state, layout: action.layout, audioSlot };
    }

    case "TOGGLE_FOCUS":
      return {
        ...state,
        focusedSlot: state.focusedSlot === action.id ? null : action.id,
      };

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
}
