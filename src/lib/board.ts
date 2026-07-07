import type { BoardConfig, BoardLayout, BoardSlot, Source } from "./types";
import { parseSource } from "./parseSource";

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
function labelFor(source: Source): string {
  return source.type !== "invalid" && source.type !== "unsupported"
    ? source.name
    : "";
}

export type BoardAction =
  | { type: "ADD_URL"; url: string } // fill the next empty visible slot
  | { type: "SET_SLOT_URL"; id: string; url: string }
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
    case "ADD_URL": {
      // Next empty slot among the currently visible ones.
      const visible = state.slots.slice(0, state.layout);
      const target = visible.find((s) => s.source === null);
      if (!target) return state;
      const source = parseSource(action.url);
      const slots = withSlot(state, target.id, {
        source,
        label: labelFor(source),
      });
      // First populated slot on an all-muted board grabs audio by default.
      const audioSlot = state.audioSlot ?? target.id;
      return { ...state, slots, audioSlot };
    }

    case "SET_SLOT_URL": {
      const source = parseSource(action.url);
      const slots = withSlot(state, action.id, {
        source,
        label: labelFor(source),
      });
      const audioSlot = state.audioSlot ?? action.id;
      return { ...state, slots, audioSlot };
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
