import { parseIsoDuration } from "./duration";
import {
  ChannelMeta,
  QuotaCost,
  VideoMeta,
  YouTubeApiError,
} from "./types";

const API_BASE = "https://www.googleapis.com/youtube/v3";
const BATCH = 50;

type Json = Record<string, any>;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function mapError(status: number, body: Json | null): YouTubeApiError {
  const message: string = body?.error?.message ?? `HTTP ${status}`;
  const reasons: string[] = (body?.error?.errors ?? []).map((e: Json) => e.reason);
  if (reasons.includes("quotaExceeded") || reasons.includes("rateLimitExceeded")) {
    return new YouTubeApiError("quota_exceeded", message, status);
  }
  if (reasons.includes("accessNotConfigured") || message.includes("has not been used in project")) {
    return new YouTubeApiError("api_not_enabled", message, status);
  }
  if (status === 400 && (reasons.includes("keyInvalid") || message.includes("API key not valid"))) {
    return new YouTubeApiError("invalid_key", message, status);
  }
  if (status === 403 && reasons.includes("forbidden")) {
    return new YouTubeApiError("invalid_key", message, status);
  }
  if (status === 404) {
    return new YouTubeApiError("not_found", message, status);
  }
  return new YouTubeApiError("other", message, status);
}

function channelFromResource(item: Json): ChannelMeta {
  const customUrl: string | undefined = item.snippet?.customUrl;
  return {
    id: item.id,
    handle: customUrl?.startsWith("@") ? customUrl : null,
    title: item.snippet?.title ?? "",
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? NaN) || null,
    videoCount: Number(item.statistics?.videoCount ?? NaN) || null,
    uploadsPlaylistId: item.contentDetails?.relatedPlaylists?.uploads ?? null,
    fetchedAt: Date.now(),
  };
}

function videoFromResource(item: Json): VideoMeta {
  return {
    id: item.id,
    channelId: item.snippet?.channelId ?? "",
    title: item.snippet?.title ?? "",
    description: (item.snippet?.description ?? "").slice(0, 3000),
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? item.snippet?.thumbnails?.default?.url ?? null,
    publishedAt: Date.parse(item.snippet?.publishedAt ?? "") || 0,
    durationSeconds: parseIsoDuration(item.contentDetails?.duration ?? ""),
    viewCount: item.statistics?.viewCount != null ? Number(item.statistics.viewCount) : null,
    likeCount: item.statistics?.likeCount != null ? Number(item.statistics.likeCount) : null,
    commentCount: item.statistics?.commentCount != null ? Number(item.statistics.commentCount) : null,
    fetchedAt: Date.now(),
  };
}

export interface SearchResultChannel {
  channelId: string;
  title: string;
}

export function explainFailure(error: YouTubeApiError): string {
  switch (error.kind) {
    case "invalid_key":
      return "Google rejected this key. Re-copy it from the credentials page and watch for missing characters.";
    case "api_not_enabled":
      return "The key works, but the YouTube Data API is not enabled on its project yet. Enable it, give it a minute, then check again.";
    case "quota_exceeded":
      return "This key has used its free allowance for today. It resets at midnight Pacific time.";
    case "network":
      return "Could not reach Google. Check your connection and try again.";
    default:
      return `Something unexpected came back from Google. ${error.message}`;
  }
}

export class YouTubeClient {
  private apiKey: string;
  private onCost: ((cost: QuotaCost) => void) | null;

  constructor(apiKey: string, onCost: ((cost: QuotaCost) => void) | null = null) {
    this.apiKey = apiKey;
    this.onCost = onCost;
  }

  private async get(endpoint: string, params: Record<string, string>, cost: QuotaCost): Promise<Json> {
    const query = new URLSearchParams({ ...params, key: this.apiKey });
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/${endpoint}?${query}`);
    } catch (e) {
      throw new YouTubeApiError("network", e instanceof Error ? e.message : "network error");
    }
    this.onCost?.(cost);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw mapError(res.status, body);
    }
    return res.json();
  }

  async channelsByIds(ids: string[]): Promise<ChannelMeta[]> {
    const out: ChannelMeta[] = [];
    for (const batch of chunk(ids, BATCH)) {
      const data = await this.get(
        "channels",
        { part: "snippet,contentDetails,statistics", id: batch.join(","), maxResults: "50" },
        { units: 1, searches: 0 },
      );
      out.push(...(data.items ?? []).map(channelFromResource));
    }
    return out;
  }

  async channelByHandle(handle: string): Promise<ChannelMeta | null> {
    const normalized = handle.startsWith("@") ? handle : `@${handle}`;
    const data = await this.get(
      "channels",
      { part: "snippet,contentDetails,statistics", forHandle: normalized },
      { units: 1, searches: 0 },
    );
    const item = (data.items ?? [])[0];
    return item ? channelFromResource(item) : null;
  }

  async channelByLegacyUsername(username: string): Promise<ChannelMeta | null> {
    const data = await this.get(
      "channels",
      { part: "snippet,contentDetails,statistics", forUsername: username },
      { units: 1, searches: 0 },
    );
    const item = (data.items ?? [])[0];
    return item ? channelFromResource(item) : null;
  }

  async uploadsVideoIds(uploadsPlaylistId: string, maxCount: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    while (ids.length < maxCount) {
      const params: Record<string, string> = {
        part: "contentDetails",
        playlistId: uploadsPlaylistId,
        maxResults: "50",
      };
      if (pageToken) params.pageToken = pageToken;
      let data: Json;
      try {
        data = await this.get("playlistItems", params, { units: 1, searches: 0 });
      } catch (e) {
        if (e instanceof YouTubeApiError && e.kind === "not_found" && ids.length === 0) return [];
        throw e;
      }
      for (const item of data.items ?? []) {
        const id = item.contentDetails?.videoId;
        if (id) ids.push(id);
      }
      pageToken = data.nextPageToken;
      if (!pageToken) break;
    }
    return ids.slice(0, maxCount);
  }

  async videosByIds(ids: string[]): Promise<VideoMeta[]> {
    const out: VideoMeta[] = [];
    for (const batch of chunk(ids, BATCH)) {
      const data = await this.get(
        "videos",
        { part: "snippet,contentDetails,statistics", id: batch.join(","), maxResults: "50" },
        { units: 1, searches: 0 },
      );
      out.push(...(data.items ?? []).map(videoFromResource));
    }
    return out;
  }

  async channelIdForVideo(videoId: string): Promise<string | null> {
    const data = await this.get(
      "videos",
      { part: "snippet", id: videoId },
      { units: 1, searches: 0 },
    );
    return (data.items ?? [])[0]?.snippet?.channelId ?? null;
  }

  async featuredChannelIds(channelId: string): Promise<string[]> {
    const data = await this.get(
      "channelSections",
      { part: "contentDetails", channelId },
      { units: 1, searches: 0 },
    );
    const ids = new Set<string>();
    for (const section of data.items ?? []) {
      for (const id of section.contentDetails?.channels ?? []) ids.add(id);
    }
    return [...ids];
  }

  async searchChannels(query: string, maxResults = 25): Promise<SearchResultChannel[]> {
    const data = await this.get(
      "search",
      { part: "snippet", q: query, type: "channel", maxResults: String(Math.min(maxResults, 50)) },
      { units: 100, searches: 1 },
    );
    return (data.items ?? [])
      .map((item: Json) => ({
        channelId: item.id?.channelId ?? "",
        title: item.snippet?.title ?? "",
      }))
      .filter((c: SearchResultChannel) => c.channelId);
  }

  async searchVideoChannels(query: string, maxResults = 50): Promise<SearchResultChannel[]> {
    const data = await this.get(
      "search",
      { part: "snippet", q: query, type: "video", maxResults: String(Math.min(maxResults, 50)) },
      { units: 100, searches: 1 },
    );
    const seen = new Map<string, SearchResultChannel>();
    for (const item of data.items ?? []) {
      const channelId = item.snippet?.channelId;
      if (channelId && !seen.has(channelId)) {
        seen.set(channelId, { channelId, title: item.snippet?.channelTitle ?? "" });
      }
    }
    return [...seen.values()];
  }

  async healthCheck(): Promise<{ ok: true } | { ok: false; error: YouTubeApiError }> {
    try {
      await this.get(
        "channels",
        { part: "id", id: "UC_x5XG1OV2P6uZZ5FSM9Ttw" },
        { units: 1, searches: 0 },
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof YouTubeApiError) return { ok: false, error: e };
      return { ok: false, error: new YouTubeApiError("other", String(e)) };
    }
  }
}
