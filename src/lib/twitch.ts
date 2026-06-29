// Shared Twitch Player JS API loader. Used by both the home StreamCell and the
// viewer cell so the embed script is fetched once and the Player API is reused.
// Twitch.Player lets us call setMuted()/setQuality() without rebuilding the
// iframe src (which would reload and pause the stream).

export interface TwitchPlayerInstance {
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  setQuality(quality: string): void;
  addEventListener(event: string, cb: () => void): void;
}

export type TwitchPlayerCtor = (new (
  id: string,
  opts: Record<string, unknown>
) => TwitchPlayerInstance) & {
  PLAYING: string;
};

interface TwitchWindow extends Window {
  Twitch?: { Player: TwitchPlayerCtor };
}

let twitchScriptPromise: Promise<void> | null = null;

export function loadTwitchScript(): Promise<void> {
  if (!twitchScriptPromise) {
    twitchScriptPromise = new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject();
        return;
      }
      if ((window as TwitchWindow).Twitch?.Player) {
        resolve();
        return;
      }
      const s = document.createElement("script");
      s.src = "https://player.twitch.tv/js/embed/v1.js";
      s.onload = () => resolve();
      s.onerror = () => {
        twitchScriptPromise = null;
        reject();
      };
      document.head.appendChild(s);
    });
  }
  return twitchScriptPromise;
}

/** The Twitch.Player constructor once the script has loaded, else null. */
export function getTwitchPlayer(): TwitchPlayerCtor | null {
  if (typeof window === "undefined") return null;
  return (window as TwitchWindow).Twitch?.Player ?? null;
}
