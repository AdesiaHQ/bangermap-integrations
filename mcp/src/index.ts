import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scoreChannelVideos, type ScoredVideo } from "../../src/lib/outliers/engine";
import { YouTubeClient } from "../../src/lib/youtube/client";
import { parseChannelList, resolveChannels } from "../../src/lib/youtube/resolve";
import { formatDuration } from "../../src/lib/youtube/duration";
import { YouTubeApiError, type ChannelMeta } from "../../src/lib/youtube/types";

const DEPTHS = { light: 50, standard: 100, deep: 200 } as const;

function apiKey(): string {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "No YOUTUBE_API_KEY in the environment. Create a free key in the Google Cloud console, enable the YouTube Data API v3 on its project, and set YOUTUBE_API_KEY in this server's config.",
    );
  }
  return key;
}

function explain(error: unknown): string {
  if (error instanceof YouTubeApiError) {
    switch (error.kind) {
      case "invalid_key":
        return "Google rejected YOUTUBE_API_KEY. Check it is complete and not restricted to another API.";
      case "api_not_enabled":
        return "The YouTube Data API v3 is not enabled on this key's project.";
      case "quota_exceeded":
        return "This key is out of quota for today. It resets at midnight Pacific time.";
      case "not_found":
        return "No channel found for that input.";
      case "network":
        return `Could not reach googleapis.com: ${error.message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function views(n: number | null): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function multiple(m: number | null): string {
  if (m == null) return "—";
  return m >= 10 ? `${Math.round(m)}x` : `${m.toFixed(1)}x`;
}

interface Scan {
  channel: ChannelMeta;
  rows: ScoredVideo[];
  baseline: number | null;
  poolSize: number;
}

async function scanChannel(
  client: YouTubeClient,
  channel: ChannelMeta,
  depth: number,
): Promise<Scan> {
  if (!channel.uploadsPlaylistId) {
    return { channel, rows: [], baseline: null, poolSize: 0 };
  }
  const ids = await client.uploadsVideoIds(channel.uploadsPlaylistId, depth);
  const videos = await client.videosByIds(ids);
  const { scored, baselines } = scoreChannelVideos(videos);
  const rows = scored
    .filter((row) => row.multiple != null)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));
  return {
    channel,
    rows,
    baseline: baselines.long ?? baselines.short,
    poolSize: Math.max(baselines.longPoolSize, baselines.shortPoolSize),
  };
}

async function resolveOne(client: YouTubeClient, input: string): Promise<ChannelMeta> {
  const refs = parseChannelList(input);
  if (refs.length === 0) throw new Error(`Could not read a channel from "${input}".`);
  const { channels, failures } = await resolveChannels(client, [refs[0]]);
  if (channels.length === 0) {
    throw new Error(failures[0]?.reason ?? `No channel found for "${input}".`);
  }
  return channels[0];
}

function table(rows: ScoredVideo[], limit: number): string {
  const lines = ["| multiple | views | length | title | url |", "| --- | --- | --- | --- | --- |"];
  for (const row of rows.slice(0, limit)) {
    const title = row.video.title.replace(/\|/g, "\\|");
    lines.push(
      `| ${multiple(row.multiple)} | ${views(row.video.viewCount)} | ${formatDuration(row.video.durationSeconds)} | ${title} | https://www.youtube.com/watch?v=${row.video.id} |`,
    );
  }
  return lines.join("\n");
}

const DISCLOSURE =
  "\n\nOutlier multiple and baseline are computed by Bangermap, not by YouTube. View and channel data comes from the YouTube Data API.";

function text(body: string) {
  return { content: [{ type: "text" as const, text: body }] };
}

function failure(error: unknown) {
  return { content: [{ type: "text" as const, text: explain(error) }], isError: true };
}

const server = new McpServer({ name: "bangermap", version: "1.0.0" });

server.registerTool(
  "find_outliers",
  {
    title: "Find outlier uploads on a channel",
    description:
      "Rank a YouTube channel's recent uploads by how far each beat that channel's own baseline. Call this when the user wants to know which of a channel's videos overperformed, or wants proven ideas from a specific channel. Runs on the caller's own free YouTube Data API key. Costs about 5 quota units.",
    inputSchema: {
      channel: z
        .string()
        .describe("Channel URL, @handle, channel id, or the URL of any video on the channel"),
      depth: z
        .enum(["light", "standard", "deep"])
        .default("standard")
        .describe("How many recent uploads to read: light 50, standard 100, deep 200"),
      limit: z.number().int().min(1).max(50).default(15).describe("How many rows to return"),
    },
  },
  async ({ channel, depth, limit }) => {
    try {
      const client = new YouTubeClient(apiKey());
      const meta = await resolveOne(client, channel);
      const scan = await scanChannel(client, meta, DEPTHS[depth]);
      if (scan.rows.length === 0) {
        return text(
          `${meta.title} has too few settled uploads to set a baseline, so nothing can be measured against it yet.`,
        );
      }
      return text(
        `## ${meta.title}\n\nBaseline ${views(scan.baseline)} views, from ${scan.poolSize} uploads. ${scan.rows.length} uploads ranked.\n\n${table(scan.rows, limit)}${DISCLOSURE}`,
      );
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "channel_baseline",
  {
    title: "Get a channel's baseline",
    description:
      "Report what normal performance looks like for a YouTube channel, as the median views of its recent settled uploads, with subscriber count and upload cadence. Call this when the user asks whether a view count is good for a given channel, or needs a reference point before judging a video. Costs about 5 quota units.",
    inputSchema: {
      channel: z.string().describe("Channel URL, @handle, channel id, or any video URL"),
    },
  },
  async ({ channel }) => {
    try {
      const client = new YouTubeClient(apiKey());
      const meta = await resolveOne(client, channel);
      const scan = await scanChannel(client, meta, 100);
      const recent = scan.rows.filter((row) => row.ageDays <= 90).length;
      return text(
        [
          `## ${meta.title}`,
          "",
          `- Subscribers: ${meta.subscriberCount == null ? "hidden" : views(meta.subscriberCount)}`,
          `- Public uploads: ${meta.videoCount ?? "unknown"}`,
          `- Baseline: ${views(scan.baseline)} views, from ${scan.poolSize} settled uploads`,
          `- Uploads in the last 90 days: ${recent}`,
          `- Best recent multiple: ${multiple(scan.rows[0]?.multiple ?? null)}`,
        ].join("\n") + DISCLOSURE,
      );
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "compare_channels",
  {
    title: "Rank outliers across several channels",
    description:
      "Scan several YouTube channels at once and return the strongest outliers across all of them, each measured against its own channel's baseline. Call this when the user wants to see what is working across a niche or a set of competitors rather than one channel. Costs about 5 quota units per channel.",
    inputSchema: {
      channels: z
        .string()
        .describe("Channel URLs, @handles or ids, separated by spaces, commas or newlines"),
      depth: z.enum(["light", "standard", "deep"]).default("light"),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ channels, depth, limit }) => {
    try {
      const client = new YouTubeClient(apiKey());
      const refs = parseChannelList(channels);
      if (refs.length === 0) throw new Error("No channels could be read from that input.");
      const { channels: metas, failures } = await resolveChannels(client, refs.slice(0, 25));
      const scans: Scan[] = [];
      for (const meta of metas) scans.push(await scanChannel(client, meta, DEPTHS[depth]));

      const merged = scans
        .flatMap((scan) => scan.rows.map((row) => ({ row, channel: scan.channel })))
        .sort((a, b) => (b.row.multiple ?? 0) - (a.row.multiple ?? 0))
        .slice(0, limit);

      const lines = [
        "| multiple | views | channel | title | url |",
        "| --- | --- | --- | --- | --- |",
      ];
      for (const { row, channel } of merged) {
        const title = row.video.title.replace(/\|/g, "\\|");
        lines.push(
          `| ${multiple(row.multiple)} | ${views(row.video.viewCount)} | ${channel.title.replace(/\|/g, "\\|")} | ${title} | https://www.youtube.com/watch?v=${row.video.id} |`,
        );
      }

      const skipped = failures.length
        ? `\n\nCould not read: ${failures.map((f) => f.input).join(", ")}.`
        : "";
      return text(
        `Scanned ${scans.length} channels.\n\n${lines.join("\n")}${skipped}${DISCLOSURE}`,
      );
    } catch (error) {
      return failure(error);
    }
  },
);

server.registerTool(
  "sweep_niche",
  {
    title: "Expand a niche from a seed channel",
    description:
      "Find channels related to a seed channel through the channels it features, then rank the strongest outliers across all of them. Call this when the user wants to discover channels in a niche they do not already know, rather than analyse ones they named. Costs about 5 quota units per channel found.",
    inputSchema: {
      seed: z.string().describe("The channel to expand from"),
      max_channels: z.number().int().min(1).max(20).default(8),
      limit: z.number().int().min(1).max(50).default(20),
    },
  },
  async ({ seed, max_channels, limit }) => {
    try {
      const client = new YouTubeClient(apiKey());
      const root = await resolveOne(client, seed);
      const featured = await client.featuredChannelIds(root.id);
      if (featured.length === 0) {
        return text(
          `${root.title} does not feature any channels publicly, so the graph cannot be expanded from it. Keyword discovery is capped at 100 searches a day on a free key, so seeding from a channel that does feature others is the cheaper path.`,
        );
      }
      const metas = await client.channelsByIds(featured.slice(0, max_channels));
      const scans: Scan[] = [];
      for (const meta of metas) scans.push(await scanChannel(client, meta, DEPTHS.light));

      const merged = scans
        .flatMap((scan) => scan.rows.map((row) => ({ row, channel: scan.channel })))
        .sort((a, b) => (b.row.multiple ?? 0) - (a.row.multiple ?? 0))
        .slice(0, limit);

      const lines = [
        "| multiple | views | channel | title | url |",
        "| --- | --- | --- | --- | --- |",
      ];
      for (const { row, channel } of merged) {
        const title = row.video.title.replace(/\|/g, "\\|");
        lines.push(
          `| ${multiple(row.multiple)} | ${views(row.video.viewCount)} | ${channel.title.replace(/\|/g, "\\|")} | ${title} | https://www.youtube.com/watch?v=${row.video.id} |`,
        );
      }
      return text(
        `Expanded ${root.title} into ${metas.length} featured channels.\n\n${lines.join("\n")}${DISCLOSURE}`,
      );
    } catch (error) {
      return failure(error);
    }
  },
);

await server.connect(new StdioServerTransport());
