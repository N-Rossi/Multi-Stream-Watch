/// <reference types="vitest/importMeta" />
import type { BoardBookmark, BoardConfig, Source } from "./types";
import { MAX_SLOTS } from "./board";
import { sourceKey } from "./roster";

// Saved board states ("bookmarks"): whole-board snapshots recalled with one
// click, like switcher scene presets. Pure localStorage, global across rooms
// (same reasoning as the roster — a saved lineup is useful anywhere).

export const MAX_BOOKMARKS = 10;
const STORAGE_KEY = "multiviewer:bookmarks";

export function loadBookmarks(): BoardBookmark[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveBookmarks(list: BoardBookmark[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage full / unavailable — bookmarks just won't persist this session
  }
}

/**
 * Save the given board under `name`. Same name (case-insensitive) updates that
 * bookmark in place; a new name appends, subject to the cap. Returns the new
 * list plus a user-facing error when nothing was saved.
 */
export function upsertBookmark(
  list: BoardBookmark[],
  name: string,
  config: BoardConfig
): { list: BoardBookmark[]; error: string | null } {
  const trimmed = name.trim();
  if (!trimmed) return { list, error: "Give the state a name first." };
  // Deep snapshot with version zeroed: the bookmark must not share objects
  // with the live draft, and version is a transport detail, not board content.
  const snapshot: BoardConfig = JSON.parse(
    JSON.stringify({ ...config, version: 0 })
  );
  const idx = list.findIndex(
    (b) => b.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { name: trimmed, config: snapshot };
    return { list: next, error: null };
  }
  if (list.length >= MAX_BOOKMARKS) {
    return {
      list,
      error: `Limit of ${MAX_BOOKMARKS} saved states — remove one first.`,
    };
  }
  return { list: [...list, { name: trimmed, config: snapshot }], error: null };
}

export function removeBookmark(
  list: BoardBookmark[],
  name: string
): BoardBookmark[] {
  return list.filter((b) => b.name !== name);
}

/**
 * Rewrite a bookmark's slot ids so that any stream also present on `current`
 * keeps the slot id it has RIGHT NOW. The viewer keys players by slot id, so
 * after this alignment a recall leaves shared streams' players completely
 * untouched — they just slide to the bookmark's positions (pure CSS). Slots
 * without a live counterpart keep their stored id when free, else take any
 * unused one. audioSlot / focusedSlot references are remapped along; lead
 * lives on the slot object and travels by itself. Content and order are
 * preserved exactly — only ids change.
 */
export function alignBookmarkToBoard(
  config: BoardConfig,
  current: BoardConfig | null
): BoardConfig {
  if (!current) return config;

  const keyOf = (s: Source | null) => (s ? sourceKey(s) : null);
  const currentIdByKey = new Map<string, string>();
  for (const s of current.slots) {
    const k = keyOf(s.source);
    if (k && !currentIdByKey.has(k)) currentIdByKey.set(k, s.id);
  }

  // Pass 1: slots whose stream is live now claim that stream's current id.
  const used = new Set<string>();
  const assigned: (string | null)[] = config.slots.map((s) => {
    const k = keyOf(s.source);
    if (!k) return null;
    const id = currentIdByKey.get(k);
    if (id && !used.has(id)) {
      used.add(id);
      currentIdByKey.delete(k); // duplicate sources: first claim wins
      return id;
    }
    return null;
  });

  // Pass 2: everyone else keeps their stored id when it's still free.
  config.slots.forEach((s, i) => {
    if (assigned[i] === null && !used.has(s.id)) {
      assigned[i] = s.id;
      used.add(s.id);
    }
  });

  // Pass 3: whatever is left takes the remaining ids from the standard pool.
  const pool = Array.from({ length: MAX_SLOTS }, (_, i) => `slot-${i + 1}`).filter(
    (id) => !used.has(id)
  );
  const idMap = new Map<string, string>();
  const slots = config.slots.map((s, i) => {
    const id = assigned[i] ?? pool.shift() ?? s.id;
    idMap.set(s.id, id);
    return { ...s, id };
  });

  return {
    ...config,
    slots,
    focusedSlot: config.focusedSlot
      ? (idMap.get(config.focusedSlot) ?? null)
      : null,
    audioSlot: config.audioSlot ? (idMap.get(config.audioSlot) ?? null) : null,
  };
}

// --- tests (vitest) ---
if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const src = (channel: string): Source => ({
    type: "tw-channel",
    platform: "tw",
    channel,
    name: channel,
    live: true,
  });

  const board = (
    entries: (string | null)[],
    audioSlot: string | null = null
  ): BoardConfig => ({
    version: 0,
    layout: 4,
    slots: Array.from({ length: MAX_SLOTS }, (_, i) => ({
      id: `slot-${i + 1}`,
      source: entries[i] ? src(entries[i]!) : null,
      label: entries[i] ?? "",
      lead: false,
    })),
    focusedSlot: null,
    audioSlot,
  });

  describe("upsertBookmark", () => {
    it("adds, updates by name (case-insensitive), and enforces the cap", () => {
      let list: BoardBookmark[] = [];
      ({ list } = upsertBookmark(list, "Race A", board(["a"])));
      expect(list).toHaveLength(1);

      const updated = upsertBookmark(list, "race a", board(["b"]));
      expect(updated.error).toBeNull();
      expect(updated.list).toHaveLength(1);
      expect(updated.list[0].config.slots[0].label).toBe("b");

      for (let i = 0; i < MAX_BOOKMARKS - 1; i++) {
        ({ list } = upsertBookmark(list, `s${i}`, board(["a"])));
      }
      expect(list).toHaveLength(MAX_BOOKMARKS);
      const full = upsertBookmark(list, "one too many", board(["a"]));
      expect(full.error).toMatch(/Limit/);
      expect(full.list).toHaveLength(MAX_BOOKMARKS);
    });

    it("rejects empty names and snapshots deeply", () => {
      const cfg = board(["a"]);
      const { list, error } = upsertBookmark([], "  ", cfg);
      expect(error).not.toBeNull();
      expect(list).toHaveLength(0);

      const saved = upsertBookmark([], "x", cfg).list[0];
      expect(saved.config).not.toBe(cfg);
      expect(saved.config.slots[0]).not.toBe(cfg.slots[0]);
      expect(saved.config.version).toBe(0);
    });
  });

  describe("alignBookmarkToBoard", () => {
    it("keeps a shared stream on its current slot id and remaps references", () => {
      // Live board: A plays in slot-1.
      const current = board(["a"]);
      // Bookmark: B first (stored slot-1), A second (stored slot-2, has audio).
      const bm = board(["b", "a"], "slot-2");

      const aligned = alignBookmarkToBoard(bm, current);
      // A keeps slot-1 (its live id) even though the bookmark stored slot-2…
      expect(aligned.slots[1].id).toBe("slot-1");
      expect(aligned.slots[1].label).toBe("a");
      // …B takes a free id…
      expect(aligned.slots[0].id).toBe("slot-2");
      // …and the audio reference follows A to its new id.
      expect(aligned.audioSlot).toBe("slot-1");
      // Ids stay a permutation of slot-1..9.
      expect(new Set(aligned.slots.map((s) => s.id)).size).toBe(MAX_SLOTS);
    });

    it("is the identity when there is no live board", () => {
      const bm = board(["a", "b"]);
      expect(alignBookmarkToBoard(bm, null)).toBe(bm);
    });
  });
}
