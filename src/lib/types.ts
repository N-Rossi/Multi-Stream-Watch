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

export type Layout = "single" | "side-by-side" | "featured" | "quad";

export type Slot = {
  id: string;
  source: Source;
  label: string;
};
