import type { BoardConfig, BoardLayout, BoardSlot, Source } from "./types";

// The control surface edits a *draft* BoardConfig through this reducer. Nothing
// here touches the viewer — publishing is a separate step (see bumpForPublish).

export const MAX_SLOTS = 9;
export const LAYOUTS: BoardLayout[] = [1, 2, 3, 4, 9];

// All nine positions always exist with stable ids; layout only controls how
// many are shown. An empty position has source === null.
function emptySlot(i: number): BoardSlot {
  return { id: `slot-${i + 1}`, source: null, label: "" };
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
      });
      // First populated slot on an all-muted board grabs audio by default.
      const audioSlot = state.audioSlot ?? target.id;
      return { ...state, slots, audioSlot };
    }

    case "SET_SLOT_SOURCE": {
      const slots = withSlot(state, action.id, {
        source: action.source,
        label: action.label,
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
      const slots = withSlot(state, action.id, { source: null, label: "" });
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
