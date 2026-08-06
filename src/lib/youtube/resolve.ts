import { YouTubeClient } from "./client";
import { ChannelMeta, YouTubeApiError } from "./types";

export type ChannelRef =
  | { kind: "id"; value: string }
  | { kind: "handle"; value: string }
  | { kind: "username"; value: string }
  | { kind: "videoId"; value: string }
  | { kind: "unresolvable"; value: string };

const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function parseChannelInput(raw: string): ChannelRef | null {
  const input = raw.trim();
  if (!input) return null;

  if (CHANNEL_ID.test(input)) return { kind: "id", value: input };
  if (input.startsWith("@")) return { kind: "handle", value: input };

  let url: URL | null = null;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    url = null;
  }

  const isYouTubeHost =
    url != null &&
    /(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname);

  if (url && isYouTubeHost) {
    const segments = url.pathname.split("/").filter(Boolean);
    if (url.hostname.endsWith("youtu.be")) {
      const id = segments[0];
      return id && VIDEO_ID.test(id) ? { kind: "videoId", value: id } : { kind: "unresolvable", value: input };
    }
    const [first, second] = segments;
    if (!first) return { kind: "unresolvable", value: input };
    if (first.startsWith("@")) return { kind: "handle", value: first };
    if (first === "channel" && second && CHANNEL_ID.test(second)) return { kind: "id", value: second };
    if (first === "user" && second) return { kind: "username", value: second };
    if (first === "c" && second) return { kind: "handle", value: second };
    if ((first === "shorts" || first === "live" || first === "embed") && second && VIDEO_ID.test(second)) {
      return { kind: "videoId", value: second };
    }
    if (first === "watch") {
      const v = url.searchParams.get("v");
      return v && VIDEO_ID.test(v) ? { kind: "videoId", value: v } : { kind: "unresolvable", value: input };
    }
    return { kind: "unresolvable", value: input };
  }

  if (/^[A-Za-z0-9._-]{3,30}$/.test(input)) return { kind: "handle", value: input };
  return { kind: "unresolvable", value: input };
}

export interface ResolveFailure {
  input: string;
  reason: string;
}

export interface ResolveResult {
  channels: ChannelMeta[];
  failures: ResolveFailure[];
}

export function parseChannelList(text: string): ChannelRef[] {
  const refs: ChannelRef[] = [];
  const seen = new Set<string>();
  for (const token of text.split(/[\s,]+/)) {
    const ref = parseChannelInput(token);
    if (!ref) continue;
    const key = `${ref.kind}:${ref.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

export async function resolveChannels(
  client: YouTubeClient,
  refs: ChannelRef[],
): Promise<ResolveResult> {
  const failures: ResolveFailure[] = [];
  const directIds: string[] = [];
  const pendingIds: string[] = [];
  const channels: ChannelMeta[] = [];

  for (const ref of refs) {
    if (ref.kind === "id") {
      directIds.push(ref.value);
    } else if (ref.kind === "unresolvable") {
      failures.push({ input: ref.value, reason: "Could not recognize a channel in this input" });
    }
  }

  for (const ref of refs) {
    try {
      if (ref.kind === "handle") {
        const channel = await client.channelByHandle(ref.value);
        if (channel) channels.push(channel);
        else failures.push({ input: ref.value, reason: "No channel found for this handle" });
      } else if (ref.kind === "username") {
        const channel =
          (await client.channelByLegacyUsername(ref.value)) ??
          (await client.channelByHandle(ref.value));
        if (channel) channels.push(channel);
        else failures.push({ input: ref.value, reason: "No channel found for this legacy username" });
      } else if (ref.kind === "videoId") {
        const channelId = await client.channelIdForVideo(ref.value);
        if (channelId) pendingIds.push(channelId);
        else failures.push({ input: ref.value, reason: "Video not found" });
      }
    } catch (e) {
      if (e instanceof YouTubeApiError && (e.kind === "quota_exceeded" || e.kind === "invalid_key" || e.kind === "api_not_enabled")) {
        throw e;
      }
      failures.push({ input: ref.value, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  const allIds = [...new Set([...directIds, ...pendingIds])].filter(
    (id) => !channels.some((c) => c.id === id),
  );
  if (allIds.length > 0) {
    const fetched = await client.channelsByIds(allIds);
    channels.push(...fetched);
    for (const id of allIds) {
      if (!fetched.some((c) => c.id === id)) {
        failures.push({ input: id, reason: "Channel not found" });
      }
    }
  }

  const unique = new Map<string, ChannelMeta>();
  for (const channel of channels) unique.set(channel.id, channel);
  return { channels: [...unique.values()], failures };
}
