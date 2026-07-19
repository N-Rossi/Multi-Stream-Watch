import type { RosterEntry, Source } from "./types";

// Roster = the control page's saved streamer list. Pure localStorage — same
// no-backend rule as the rest of the control/viewer workflow. Global (not
// per-room): a streamer bookmark is useful across every room.

const STORAGE_KEY = "multiviewer:roster";

/**
 * Canonical identity for a source, used to dedupe roster entries and to tell
 * "is this streamer already on the board". Null for sources that aren't
 * bookmarkable (invalid / unsupported).
 */
export function sourceKey(source: Source): string | null {
  switch (source.type) {
    case "tw-channel":
      return `tw:${source.channel.toLowerCase()}`;
    case "tw-vod":
      return `tw-vod:${source.videoId}`;
    case "yt-video":
      return `yt:${source.videoId}`;
    case "yt-channel":
      return `yt-ch:${source.channelId}`;
    case "kick-channel":
      return `kick:${source.channel.toLowerCase()}`;
    case "bili-live":
      return `bili:${source.roomId}`;
    case "bili-video":
      return `bili-v:${source.bvid}`;
    case "hls":
    case "video-file":
      return `file:${source.url}`;
    default:
      return null;
  }
}

export function loadRoster(): RosterEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRoster(entries: RosterEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full / unavailable — roster just won't persist this session
  }
}

/**
 * Add a source to the roster, deduped by sourceKey. An existing entry is kept
 * as-is (its label may have been hand-edited) unless it has no label yet and
 * the caller brings one.
 */
export function upsertEntry(
  roster: RosterEntry[],
  source: Source,
  label: string
): RosterEntry[] {
  const key = sourceKey(source);
  if (!key) return roster;
  const existing = roster.find((e) => e.key === key);
  if (existing) {
    if (label && !existing.label) {
      return roster.map((e) => (e.key === key ? { ...e, label } : e));
    }
    return roster;
  }
  return [...roster, { key, source, label }];
}

export function removeEntry(roster: RosterEntry[], key: string): RosterEntry[] {
  return roster.filter((e) => e.key !== key);
}

// ── Drag-and-drop payload types (shared by SlotCard + RosterTray) ───────────
// Custom MIME types so slot drags and roster drags are distinguishable in
// dragover (via e.dataTransfer.types) before the data itself is readable.
export const DRAG_SLOT = "application/x-multiview-slot";
export const DRAG_ROSTER = "application/x-multiview-roster";
