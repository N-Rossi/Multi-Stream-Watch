import type { BoardConfig } from "./types";

// Transport between the /control and /viewer surfaces. Everything runs on one
// machine in one browser, so this is browser-native only — no server, no API,
// no network. The interface exists so a network transport could be slotted in
// later without touching the pages; only the BroadcastChannel + localStorage
// implementation ships now.

export interface ViewerSync {
  /** Publish a board to the viewer (Push / the broadcast "take"). */
  publish(config: BoardConfig): void;
  /** Listen for future pushes. Returns an unsubscribe function. */
  subscribe(onConfig: (config: BoardConfig) => void): () => void;
  /** Last published board from localStorage — for first load and refresh restore. */
  getCurrent(): BoardConfig | null;
  /** Release the underlying channel. Optional cleanup on unmount. */
  close(): void;
}

// One namespace string per room serves both the channel name and the storage
// key. The room only namespaces these two — nothing else.
function ns(room: string): string {
  return `multiviewer:${room}`;
}

export function createSync(room: string): ViewerSync {
  const name = ns(room);
  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(name) : null;

  return {
    publish(config) {
      // Write first so a refresh of either window restores the latest board
      // even if no live message is in flight.
      try {
        localStorage.setItem(name, JSON.stringify(config));
      } catch {
        /* storage full / disabled — channel still delivers to open windows */
      }
      channel?.postMessage(config);
    },

    subscribe(onConfig) {
      if (!channel) return () => {};
      const handler = (e: MessageEvent) => onConfig(e.data as BoardConfig);
      channel.addEventListener("message", handler);
      return () => channel.removeEventListener("message", handler);
    },

    getCurrent() {
      try {
        const raw = localStorage.getItem(name);
        return raw ? (JSON.parse(raw) as BoardConfig) : null;
      } catch {
        return null;
      }
    },

    close() {
      channel?.close();
    },
  };
}
