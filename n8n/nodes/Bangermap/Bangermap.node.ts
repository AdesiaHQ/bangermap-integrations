import type {
  IDataObject,
  IExecuteFunctions,
  INode,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from "n8n-workflow";
import { NodeConnectionTypes, NodeOperationError } from "n8n-workflow";

import {
  scoreChannelVideos,
  type ChannelBaselines,
  type ScoredVideo,
} from "../../../src/lib/outliers/engine";
import { YouTubeClient } from "../../../src/lib/youtube/client";
import { parseChannelList, resolveChannels } from "../../../src/lib/youtube/resolve";
import { formatDuration } from "../../../src/lib/youtube/duration";
import { YouTubeApiError, type ChannelMeta } from "../../../src/lib/youtube/types";

const DEPTHS: Record<string, number> = { light: 50, standard: 100, deep: 200 };
const MAX_COMPARE_CHANNELS = 25;

interface Scan {
  channel: ChannelMeta;
  rows: ScoredVideo[];
  baselines: ChannelBaselines;
}

const EMPTY_BASELINES: ChannelBaselines = {
  long: null,
  short: null,
  longRange: null,
  shortRange: null,
  longPoolSize: 0,
  shortPoolSize: 0,
};

interface Filters {
  minMultiple: number;
  format: string;
  maxAgeDays: number;
}

function explain(error: unknown): string {
  if (error instanceof YouTubeApiError) {
    switch (error.kind) {
      case "invalid_key":
        return "Google rejected the API key on this credential. Check it is complete and not restricted to another API.";
      case "api_not_enabled":
        return "The YouTube Data API v3 is not enabled on this key's Google Cloud project.";
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

function round(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function depthOf(value: string): number {
  return DEPTHS[value] ?? DEPTHS.standard;
}

async function scanChannel(
  client: YouTubeClient,
  channel: ChannelMeta,
  depth: number,
): Promise<Scan> {
  if (!channel.uploadsPlaylistId) {
    return { channel, rows: [], baselines: EMPTY_BASELINES };
  }
  const ids = await client.uploadsVideoIds(channel.uploadsPlaylistId, depth);
  const videos = await client.videosByIds(ids);
  const { scored, baselines } = scoreChannelVideos(videos);
  const rows = scored
    .filter((row) => row.multiple != null)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0));
  return { channel, rows, baselines };
}

async function resolveOne(
  node: INode,
  client: YouTubeClient,
  input: string,
): Promise<ChannelMeta> {
  const refs = parseChannelList(input);
  if (refs.length === 0) {
    throw new NodeOperationError(node, `Could not read a channel from "${input}".`);
  }
  const { channels, failures } = await resolveChannels(client, [refs[0]]);
  if (channels.length === 0) {
    throw new NodeOperationError(node, failures[0]?.reason ?? `No channel found for "${input}".`);
  }
  return channels[0];
}

function passes(row: ScoredVideo, filters: Filters): boolean {
  if (row.multiple == null) return false;
  if (row.multiple < filters.minMultiple) return false;
  if (filters.format !== "any" && row.format !== filters.format) return false;
  if (filters.maxAgeDays > 0 && row.ageDays > filters.maxAgeDays) return false;
  return true;
}

function outlierJson(row: ScoredVideo, channel: ChannelMeta): IDataObject {
  return {
    channelId: channel.id,
    channelTitle: channel.title,
    channelHandle: channel.handle,
    channelSubscribers: channel.subscriberCount,
    videoId: row.video.id,
    title: row.video.title,
    url: `https://www.youtube.com/watch?v=${row.video.id}`,
    thumbnailUrl: row.video.thumbnailUrl,
    views: row.video.viewCount,
    multiple: row.multiple == null ? null : round(row.multiple, 2),
    baseline: row.baseline == null ? null : Math.round(row.baseline),
    format: row.format,
    duration: formatDuration(row.video.durationSeconds),
    durationSeconds: row.video.durationSeconds,
    publishedAt: row.video.publishedAt ? new Date(row.video.publishedAt).toISOString() : null,
    ageDays: round(row.ageDays, 1),
    likes: row.video.likeCount,
    comments: row.video.commentCount,
  };
}

function rank(scans: Scan[], filters: Filters, limit: number): IDataObject[] {
  return scans
    .flatMap((scan) => scan.rows.map((row) => ({ row, channel: scan.channel })))
    .filter(({ row }) => passes(row, filters))
    .sort((a, b) => (b.row.multiple ?? 0) - (a.row.multiple ?? 0))
    .slice(0, limit)
    .map(({ row, channel }) => outlierJson(row, channel));
}

export class Bangermap implements INodeType {
  description: INodeTypeDescription = {
    displayName: "Bangermap",
    name: "bangermap",
    icon: { light: "file:bangermap.svg", dark: "file:bangermap.dark.svg" },
    group: ["transform"],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: "Find YouTube outliers on your own free YouTube Data API key",
    defaults: { name: "Bangermap" },
    usableAsTool: true,
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [{ name: "bangermapApi", required: true }],
    properties: [
      {
        displayName: "Operation",
        name: "operation",
        type: "options",
        noDataExpression: true,
        default: "findOutliers",
        options: [
          {
            name: "Compare Channels",
            value: "compareChannels",
            description:
              "Rank the strongest outliers across several channels, each measured against its own baseline. About 5 quota units per channel.",
            action: "Compare channels",
          },
          {
            name: "Find Outliers",
            value: "findOutliers",
            description:
              "Rank one channel's recent uploads by how far each beat that channel's own baseline. About 5 quota units.",
            action: "Find outliers on a channel",
          },
          {
            name: "Get Channel Baseline",
            value: "channelBaseline",
            description:
              "Report what normal performance looks like for a channel, so a view count can be judged. About 5 quota units.",
            action: "Get a channel baseline",
          },
          {
            name: "Sweep Niche",
            value: "sweepNiche",
            description:
              "Expand a seed channel through the channels it features, then rank outliers across all of them. About 5 quota units per channel found.",
            action: "Sweep a niche",
          },
        ],
      },
      {
        displayName: "Channel",
        name: "channel",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://www.youtube.com/@mkbhd",
        description:
          "Channel URL, @handle, channel ID, or the URL of any video on the channel",
        displayOptions: { show: { operation: ["findOutliers", "channelBaseline"] } },
      },
      {
        displayName: "Channels",
        name: "channels",
        type: "string",
        default: "",
        required: true,
        placeholder: "@mkbhd, @mrwhosetheboss",
        description:
          "Channel URLs, @handles or IDs, separated by commas, spaces or newlines. The first 25 are read.",
        displayOptions: { show: { operation: ["compareChannels"] } },
      },
      {
        displayName: "Seed Channel",
        name: "seed",
        type: "string",
        default: "",
        required: true,
        placeholder: "https://www.youtube.com/@mkbhd",
        description:
          "The channel to expand from, through the channels it features publicly. Cheaper and deeper than keyword search, which a free key caps at 100 calls a day.",
        displayOptions: { show: { operation: ["sweepNiche"] } },
      },
      {
        displayName: "Depth",
        name: "depth",
        type: "options",
        default: "standard",
        description: "How many recent uploads to read per channel",
        options: [
          { name: "Light (50 Uploads)", value: "light" },
          { name: "Standard (100 Uploads)", value: "standard" },
          { name: "Deep (200 Uploads)", value: "deep" },
        ],
        displayOptions: { show: { operation: ["findOutliers", "compareChannels"] } },
      },
      {
        displayName: "Max Channels",
        name: "maxChannels",
        type: "number",
        default: 8,
        typeOptions: { minValue: 1, maxValue: 20 },
        description: "How many of the featured channels to scan",
        displayOptions: { show: { operation: ["sweepNiche"] } },
      },
      {
        displayName: "Limit",
        name: "limit",
        type: "number",
        default: 50,
        typeOptions: { minValue: 1 },
        description: "Max number of results to return",
        displayOptions: {
          show: { operation: ["findOutliers", "compareChannels", "sweepNiche"] },
        },
      },
      {
        displayName: "Filters",
        name: "filters",
        type: "collection",
        placeholder: "Add Filter",
        default: {},
        displayOptions: {
          show: { operation: ["findOutliers", "compareChannels", "sweepNiche"] },
        },
        options: [
          {
            displayName: "Format",
            name: "format",
            type: "options",
            default: "any",
            description:
              "Shorts and long-form are measured against separate baselines either way",
            options: [
              { name: "Any", value: "any" },
              { name: "Long-Form", value: "long" },
              { name: "Shorts", value: "short" },
            ],
          },
          {
            displayName: "Max Age (Days)",
            name: "maxAgeDays",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0 },
            description:
              "Only return uploads published within this many days. Zero for no limit.",
          },
          {
            displayName: "Min Multiple",
            name: "minMultiple",
            type: "number",
            default: 0,
            typeOptions: { minValue: 0, numberPrecision: 2 },
            description:
              "Only return uploads that beat their channel's baseline by at least this much, so 3 means three times normal",
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const node = this.getNode();
    const credentials = await this.getCredentials("bangermapApi");
    const apiKey = String(credentials.apiKey ?? "").trim();
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        if (!apiKey) {
          throw new NodeOperationError(node, "This credential has no YouTube Data API key set.");
        }
        const operation = this.getNodeParameter("operation", i) as string;
        const client = new YouTubeClient(apiKey);
        let rows: IDataObject[] = [];

        if (operation === "channelBaseline") {
          const channel = this.getNodeParameter("channel", i) as string;
          const meta = await resolveOne(node, client, channel);
          const scan = await scanChannel(client, meta, DEPTHS.standard);
          const { baselines } = scan;
          rows = [
            {
              channelId: meta.id,
              channelTitle: meta.title,
              channelHandle: meta.handle,
              subscribers: meta.subscriberCount,
              publicUploads: meta.videoCount,
              thumbnailUrl: meta.thumbnailUrl,
              longBaseline: baselines.long == null ? null : Math.round(baselines.long),
              longTypicalRange: baselines.longRange,
              longPoolSize: baselines.longPoolSize,
              shortBaseline: baselines.short == null ? null : Math.round(baselines.short),
              shortTypicalRange: baselines.shortRange,
              shortPoolSize: baselines.shortPoolSize,
              uploadsRanked: scan.rows.length,
              uploadsLast90Days: scan.rows.filter((row) => row.ageDays <= 90).length,
              bestMultiple:
                scan.rows[0]?.multiple == null ? null : round(scan.rows[0].multiple, 2),
            },
          ];
        } else {
          const limit = this.getNodeParameter("limit", i) as number;
          const raw = this.getNodeParameter("filters", i, {}) as IDataObject;
          const filters: Filters = {
            minMultiple: Number(raw.minMultiple ?? 0),
            format: String(raw.format ?? "any"),
            maxAgeDays: Number(raw.maxAgeDays ?? 0),
          };
          const scans: Scan[] = [];

          if (operation === "findOutliers") {
            const channel = this.getNodeParameter("channel", i) as string;
            const depth = this.getNodeParameter("depth", i) as string;
            const meta = await resolveOne(node, client, channel);
            const scan = await scanChannel(client, meta, depthOf(depth));
            if (scan.rows.length === 0) {
              throw new NodeOperationError(
                node,
                `${meta.title} has too few settled uploads to set a baseline, so nothing can be measured against it yet.`,
              );
            }
            scans.push(scan);
          } else if (operation === "compareChannels") {
            const channels = this.getNodeParameter("channels", i) as string;
            const depth = this.getNodeParameter("depth", i) as string;
            const refs = parseChannelList(channels);
            if (refs.length === 0) {
              throw new NodeOperationError(node, "No channels could be read from that input.");
            }
            const { channels: metas, failures } = await resolveChannels(
              client,
              refs.slice(0, MAX_COMPARE_CHANNELS),
            );
            if (metas.length === 0) {
              throw new NodeOperationError(
                node,
                `None of those channels could be read. ${failures.map((f) => f.input).join(", ")}`,
              );
            }
            for (const meta of metas) scans.push(await scanChannel(client, meta, depthOf(depth)));
          } else if (operation === "sweepNiche") {
            const seed = this.getNodeParameter("seed", i) as string;
            const maxChannels = this.getNodeParameter("maxChannels", i) as number;
            const root = await resolveOne(node, client, seed);
            const featured = await client.featuredChannelIds(root.id);
            if (featured.length === 0) {
              throw new NodeOperationError(
                node,
                `${root.title} does not feature any channels publicly, so the graph cannot be expanded from it. Seed from a channel that does feature others.`,
              );
            }
            const metas = await client.channelsByIds(featured.slice(0, maxChannels));
            for (const meta of metas) scans.push(await scanChannel(client, meta, DEPTHS.light));
          } else {
            throw new NodeOperationError(node, `Unknown operation "${operation}".`);
          }

          rows = rank(scans, filters, limit);
        }

        out.push(...rows.map((json) => ({ json, pairedItem: { item: i } })));
      } catch (error) {
        if (this.continueOnFail()) {
          out.push({ json: { error: explain(error) }, pairedItem: { item: i } });
          continue;
        }
        throw new NodeOperationError(node, explain(error), { itemIndex: i });
      }
    }

    return [out];
  }
}
