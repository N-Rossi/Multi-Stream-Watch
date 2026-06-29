export type Platform = "yt" | "tw" | "kick" | "bili" | "file";

export type YTVideoSource = {
  type: "yt-video";
  platform: "yt";
  videoId: string;
  name: string;
  live: boolean;
};

export type YTChannelSource = {
  type: "yt-channel";
  platform: "yt";
  channelId: string;
  name: string;
  live: true;
};

export type TwitchChannelSource = {
  type: "tw-channel";
  platform: "tw";
  channel: string;
  name: string;
  live: true;
};

export type TwitchVODSource = {
  type: "tw-vod";
  platform: "tw";
  videoId: string;
  name: string;
  live: false;
};

export type KickSource = {
  type: "kick-channel";
  platform: "kick";
  channel: string;
  name: string;
  live: true;
};

export type BiliLiveSource = {
  type: "bili-live";
  platform: "bili";
  roomId: string;
  name: string;
  live: true;
};

export type BiliVideoSource = {
  type: "bili-video";
  platform: "bili";
  bvid: string;
  name: string;
  live: false;
};

export type HLSSource = {
  type: "hls";
  platform: "file";
  url: string;
  name: string;
  live: boolean;
};

export type VideoFileSource = {
  type: "video-file";
  platform: "file";
  url: string;
  name: string;
  live: false;
};

export type UnsupportedSource = {
  type: "unsupported";
  message: string;
};

export type InvalidSource = {
  type: "invalid";
  message: string;
};

export type Source =
  | YTVideoSource
  | YTChannelSource
  | TwitchChannelSource
  | TwitchVODSource
  | KickSource
  | BiliLiveSource
  | BiliVideoSource
  | HLSSource
  | VideoFileSource
  | UnsupportedSource
  | InvalidSource;

export type Layout = "single" | "side-by-side" | "duo" | "featured" | "quad" | "grid9";

export type Slot = {
  id: string;
  source: Source;
  label: string;
};

// ── Control / Viewer board model (two-surface operator workflow) ────────────
// Distinct from the home Multiviewer's Layout/Slot above so that page keeps
// working unchanged. The board is what control edits and pushes to the viewer.

export type BoardLayout = 1 | 2 | 3 | 4 | 9;

export type BoardSlot = {
  id: string; // stable per position, e.g. "slot-1". Never changes for a position.
  source: Source | null;
  label: string; // racer / team name, shown as overlay on the viewer
};

export type BoardConfig = {
  version: number; // increments on every push, for ordering and diffing
  layout: BoardLayout;
  slots: BoardSlot[]; // up to 9, ids slot-1..slot-9
  focusedSlot: string | null; // slot id shown 1-up on the viewer, or null for grid
  audioSlot: string | null; // slot id that has sound, or null for all muted
};
