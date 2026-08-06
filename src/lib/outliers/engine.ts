import { VideoMeta } from "../youtube/types";

export type VideoFormat = "short" | "long";

export interface EngineOptions {
  shortMaxSeconds: number;
  baselinePoolSize: number;
  baselineMinAgeDays: number;
  minPoolSize: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  shortMaxSeconds: 180,
  baselinePoolSize: 30,
  baselineMinAgeDays: 7,
  minPoolSize: 5,
};

export type TypicalRange = [number, number];

export interface ChannelBaselines {
  long: number | null;
  short: number | null;
  longRange: TypicalRange | null;
  shortRange: TypicalRange | null;
  longPoolSize: number;
  shortPoolSize: number;
}

export interface ScoredVideo {
  video: VideoMeta;
  format: VideoFormat;
  ageDays: number;
  viewsPerDay: number | null;
  baseline: number | null;
  baselineRange: TypicalRange | null;
  multiple: number | null;
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

export function videoFormat(video: VideoMeta, opts: EngineOptions = DEFAULT_ENGINE_OPTIONS): VideoFormat {
  return video.durationSeconds > 0 && video.durationSeconds <= opts.shortMaxSeconds ? "short" : "long";
}

function baselineFor(
  videos: VideoMeta[],
  format: VideoFormat,
  now: number,
  opts: EngineOptions,
): { baseline: number | null; range: TypicalRange | null; poolSize: number } {
  const minAgeMs = opts.baselineMinAgeDays * 86400_000;
  const pool = videos
    .filter((v) => videoFormat(v, opts) === format)
    .filter((v) => v.viewCount != null)
    .filter((v) => now - v.publishedAt >= minAgeMs)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, opts.baselinePoolSize);

  if (pool.length < opts.minPoolSize) return { baseline: null, range: null, poolSize: pool.length };
  const views = pool.map((v) => v.viewCount as number);
  const value = median(views);
  if (value == null || value <= 0) return { baseline: null, range: null, poolSize: pool.length };
  const low = quantile(views, 0.25) as number;
  const high = quantile(views, 0.75) as number;
  return { baseline: value, range: [Math.round(low), Math.round(high)], poolSize: pool.length };
}

export function computeBaselines(
  videos: VideoMeta[],
  now: number = Date.now(),
  opts: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): ChannelBaselines {
  const long = baselineFor(videos, "long", now, opts);
  const short = baselineFor(videos, "short", now, opts);
  return {
    long: long.baseline,
    short: short.baseline,
    longRange: long.range,
    shortRange: short.range,
    longPoolSize: long.poolSize,
    shortPoolSize: short.poolSize,
  };
}

export function scoreChannelVideos(
  videos: VideoMeta[],
  now: number = Date.now(),
  opts: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): { scored: ScoredVideo[]; baselines: ChannelBaselines } {
  const baselines = computeBaselines(videos, now, opts);
  const scored = videos.map((video) => {
    const format = videoFormat(video, opts);
    const ageDays = Math.max(0, (now - video.publishedAt) / 86400_000);
    const baseline = format === "short" ? baselines.short : baselines.long;
    const baselineRange = format === "short" ? baselines.shortRange : baselines.longRange;
    const multiple =
      baseline != null && video.viewCount != null ? video.viewCount / baseline : null;
    const viewsPerDay =
      video.viewCount != null ? video.viewCount / Math.max(ageDays, 1) : null;
    return { video, format, ageDays, viewsPerDay, baseline, baselineRange, multiple };
  });
  return { scored, baselines };
}
