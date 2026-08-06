export interface ChannelMeta {
  id: string;
  handle: string | null;
  title: string;
  thumbnailUrl: string | null;
  subscriberCount: number | null;
  videoCount: number | null;
  uploadsPlaylistId: string | null;
  fetchedAt: number;
}

export interface VideoMeta {
  id: string;
  channelId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: number;
  durationSeconds: number;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  fetchedAt: number;
}

export type ApiErrorKind =
  | "invalid_key"
  | "api_not_enabled"
  | "quota_exceeded"
  | "not_found"
  | "network"
  | "other";

export class YouTubeApiError extends Error {
  kind: ApiErrorKind;
  status: number | null;

  constructor(kind: ApiErrorKind, message: string, status: number | null = null) {
    super(message);
    this.name = "YouTubeApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface QuotaCost {
  units: number;
  searches: number;
}
