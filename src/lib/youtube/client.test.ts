import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeClient } from "./client";
import { ApiErrorKind } from "./types";

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

function googleError(reason: string, message = "something went wrong") {
  return { error: { message, errors: [{ reason }] } };
}

async function kindFor(status: number, body: unknown): Promise<ApiErrorKind> {
  respondWith(status, body);
  const result = await new YouTubeClient("AIzaTest").healthCheck();
  if (result.ok) throw new Error("expected the health check to fail");
  return result.error.kind;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("error mapping", () => {
  it("names an exhausted quota, so the app can say when it resets", async () => {
    await expect(kindFor(403, googleError("quotaExceeded"))).resolves.toBe("quota_exceeded");
  });

  it("treats rate limiting as the same quota wall", async () => {
    await expect(kindFor(403, googleError("rateLimitExceeded"))).resolves.toBe("quota_exceeded");
  });

  it("separates a project with the API switched off from a bad key", async () => {
    await expect(kindFor(403, googleError("accessNotConfigured"))).resolves.toBe("api_not_enabled");
  });

  it("recognizes the not-used-in-project wording without a reason code", async () => {
    await expect(
      kindFor(403, { error: { message: "YouTube Data API has not been used in project 123 before" } }),
    ).resolves.toBe("api_not_enabled");
  });

  it("flags a rejected key", async () => {
    await expect(kindFor(400, googleError("keyInvalid"))).resolves.toBe("invalid_key");
    await expect(
      kindFor(400, { error: { message: "API key not valid. Please pass a valid API key." } }),
    ).resolves.toBe("invalid_key");
  });

  it("maps a missing resource to not_found rather than something fatal", async () => {
    await expect(kindFor(404, googleError("notFound"))).resolves.toBe("not_found");
  });

  it("falls back to other for unfamiliar failures", async () => {
    await expect(kindFor(500, googleError("backendError"))).resolves.toBe("other");
  });

  it("survives an error body that is not json", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error("not json");
        },
      })),
    );
    const result = await new YouTubeClient("AIzaTest").healthCheck();
    expect(result.ok).toBe(false);
  });

  it("reports a dead connection as a network problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const result = await new YouTubeClient("AIzaTest").healthCheck();
    if (result.ok) throw new Error("expected the health check to fail");
    expect(result.error.kind).toBe("network");
  });
});

describe("quota accounting", () => {
  it("books the cost of a request that reached Google and failed", async () => {
    const onCost = vi.fn();
    respondWith(403, googleError("quotaExceeded"));

    await new YouTubeClient("AIzaTest", onCost).healthCheck();

    expect(onCost).toHaveBeenCalledWith({ units: 1, searches: 0 });
  });

  it("books nothing when the request never left the machine", async () => {
    const onCost = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await new YouTubeClient("AIzaTest", onCost).healthCheck();

    expect(onCost).not.toHaveBeenCalled();
  });
});
