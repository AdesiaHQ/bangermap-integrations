import { describe, expect, it } from "vitest";
import { parseChannelInput, parseChannelList } from "./resolve";

describe("parseChannelInput", () => {
  it("recognizes a raw channel id", () => {
    expect(parseChannelInput("UCsBjURrPoezykLs9EqgamOA")).toEqual({
      kind: "id",
      value: "UCsBjURrPoezykLs9EqgamOA",
    });
  });

  it("recognizes handles with and without a url around them", () => {
    expect(parseChannelInput("@mkbhd")).toEqual({ kind: "handle", value: "@mkbhd" });
    expect(parseChannelInput("https://www.youtube.com/@mkbhd")).toEqual({
      kind: "handle",
      value: "@mkbhd",
    });
    expect(parseChannelInput("youtube.com/@mkbhd/videos")).toEqual({
      kind: "handle",
      value: "@mkbhd",
    });
  });

  it("pulls the channel id out of a /channel/ url", () => {
    expect(parseChannelInput("https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA")).toEqual({
      kind: "id",
      value: "UCsBjURrPoezykLs9EqgamOA",
    });
  });

  it("pulls the video id out of every video url shape", () => {
    const expected = { kind: "videoId", value: "dQw4w9WgXcQ" };
    expect(parseChannelInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(expected);
    expect(parseChannelInput("https://youtu.be/dQw4w9WgXcQ")).toEqual(expected);
    expect(parseChannelInput("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toEqual(expected);
    expect(parseChannelInput("https://www.youtube.com/live/dQw4w9WgXcQ")).toEqual(expected);
  });

  it("keeps a watch url with extra params", () => {
    expect(parseChannelInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")).toEqual({
      kind: "videoId",
      value: "dQw4w9WgXcQ",
    });
  });

  it("marks a youtube url with nothing usable in it as unresolvable", () => {
    expect(parseChannelInput("https://www.youtube.com/feed/subscriptions")?.kind).toBe(
      "unresolvable",
    );
    expect(parseChannelInput("https://www.youtube.com/watch?list=PL123")?.kind).toBe(
      "unresolvable",
    );
  });

  it("does not treat a lookalike host as YouTube", () => {
    expect(parseChannelInput("https://notyoutube.com/@mkbhd")?.kind).toBe("unresolvable");
  });

  it("returns null for empty input", () => {
    expect(parseChannelInput("   ")).toBeNull();
  });
});

describe("parseChannelList", () => {
  it("splits on newlines, commas and spaces", () => {
    const refs = parseChannelList("@one, @two\n@three @four");
    expect(refs.map((r) => r.value)).toEqual(["@one", "@two", "@three", "@four"]);
  });

  it("does not send a whole space-separated line as one handle", () => {
    const refs = parseChannelList("@one @two");
    expect(refs).toHaveLength(2);
    expect(refs.every((r) => r.kind === "handle")).toBe(true);
  });

  it("drops repeats so the same channel is not paid for twice", () => {
    const refs = parseChannelList("@one\n@ONE\n@one");
    expect(refs).toHaveLength(1);
  });

  it("keeps distinct references to different channels", () => {
    const refs = parseChannelList(
      "@one\nhttps://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA",
    );
    expect(refs.map((r) => r.kind)).toEqual(["handle", "id"]);
  });

  it("ignores blank lines", () => {
    expect(parseChannelList("\n\n@one\n\n")).toHaveLength(1);
  });
});
