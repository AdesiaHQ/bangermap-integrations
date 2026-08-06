import { describe, expect, it } from "vitest";
import { VideoMeta } from "../youtube/types";
import {
  computeBaselines,
  DEFAULT_ENGINE_OPTIONS,
  median,
  quantile,
  scoreChannelVideos,
  videoFormat,
} from "./engine";

const NOW = Date.parse("2026-08-01T00:00:00Z");
const DAY = 86400_000;

function video(overrides: Partial<VideoMeta>): VideoMeta {
  return {
    id: "vid",
    channelId: "UCchannel",
    title: "t",
    description: "",
    thumbnailUrl: null,
    publishedAt: NOW - 30 * DAY,
    durationSeconds: 600,
    viewCount: 1000,
    likeCount: null,
    commentCount: null,
    fetchedAt: NOW,
    ...overrides,
  };
}

describe("median", () => {
  it("returns null for empty input", () => {
    expect(median([])).toBeNull();
  });
  it("handles odd and even counts", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("quantile", () => {
  it("returns null for empty input", () => {
    expect(quantile([], 0.25)).toBeNull();
  });
  it("interpolates between neighbours", () => {
    expect(quantile([100, 200, 300, 400, 500], 0.25)).toBe(200);
    expect(quantile([100, 200, 300, 400], 0.25)).toBe(175);
    expect(quantile([100, 200, 300, 400], 0.75)).toBe(325);
  });
});

describe("videoFormat", () => {
  it("splits shorts from longform at the threshold", () => {
    expect(videoFormat(video({ durationSeconds: 60 }))).toBe("short");
    expect(videoFormat(video({ durationSeconds: 180 }))).toBe("short");
    expect(videoFormat(video({ durationSeconds: 181 }))).toBe("long");
  });
  it("treats unknown duration as longform", () => {
    expect(videoFormat(video({ durationSeconds: 0 }))).toBe("long");
  });
});

describe("computeBaselines", () => {
  it("uses the median of same-format settled videos", () => {
    const videos = [100, 200, 300, 400, 500].map((views, i) =>
      video({ id: `v${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    const baselines = computeBaselines(videos, NOW);
    expect(baselines.long).toBe(300);
    expect(baselines.longPoolSize).toBe(5);
    expect(baselines.short).toBeNull();
  });

  it("reports the typical range as the middle half of the pool", () => {
    const videos = [100, 200, 300, 400, 500].map((views, i) =>
      video({ id: `v${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    const baselines = computeBaselines(videos, NOW);
    expect(baselines.longRange).toEqual([200, 400]);
    expect(baselines.shortRange).toBeNull();
  });

  it("excludes videos younger than the settling window from the pool", () => {
    const settled = [100, 200, 300, 400, 500].map((views, i) =>
      video({ id: `v${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    const fresh = video({ id: "fresh", viewCount: 1_000_000, publishedAt: NOW - 2 * DAY });
    const baselines = computeBaselines([...settled, fresh], NOW);
    expect(baselines.long).toBe(300);
  });

  it("returns null baseline when the pool is too small", () => {
    const videos = [100, 200].map((views, i) =>
      video({ id: `v${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    expect(computeBaselines(videos, NOW).long).toBeNull();
  });

  it("caps the pool at the configured size, most recent first", () => {
    const videos = Array.from({ length: 40 }, (_, i) =>
      video({ id: `v${i}`, viewCount: i < 30 ? 100 : 9000, publishedAt: NOW - (10 + i) * DAY }),
    );
    const baselines = computeBaselines(videos, NOW, { ...DEFAULT_ENGINE_OPTIONS, baselinePoolSize: 30 });
    expect(baselines.long).toBe(100);
  });

  it("computes separate baselines per format", () => {
    const longs = [100, 100, 100, 100, 100].map((views, i) =>
      video({ id: `l${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    const shorts = [5000, 5000, 5000, 5000, 5000].map((views, i) =>
      video({ id: `s${i}`, viewCount: views, durationSeconds: 45, publishedAt: NOW - (10 + i) * DAY }),
    );
    const baselines = computeBaselines([...longs, ...shorts], NOW);
    expect(baselines.long).toBe(100);
    expect(baselines.short).toBe(5000);
  });
});

describe("scoreChannelVideos", () => {
  it("scores multiples against the channel baseline", () => {
    const settled = [100, 100, 100, 100, 100].map((views, i) =>
      video({ id: `v${i}`, viewCount: views, publishedAt: NOW - (10 + i) * DAY }),
    );
    const outlier = video({ id: "big", viewCount: 1200, publishedAt: NOW - 20 * DAY });
    const { scored } = scoreChannelVideos([...settled, outlier], NOW);
    const big = scored.find((s) => s.video.id === "big")!;
    expect(big.multiple).toBeCloseTo(12);
    expect(big.baseline).toBe(100);
  });

  it("yields null multiple when there is no baseline", () => {
    const videos = [video({ id: "only", viewCount: 500 })];
    const { scored } = scoreChannelVideos(videos, NOW);
    expect(scored[0].multiple).toBeNull();
  });

  it("clamps views-per-day for very young videos", () => {
    const v = video({ id: "young", viewCount: 4800, publishedAt: NOW - DAY / 24 });
    const { scored } = scoreChannelVideos([v], NOW);
    expect(scored[0].viewsPerDay).toBe(4800);
  });
});
