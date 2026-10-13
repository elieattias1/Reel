import { describe, expect, it } from "vitest";
import { computeSceneLineRanges } from "./line-numbers";

const SCRIPT = [
  "INT. DINER - NIGHT", // line 1
  "Maya sits.", // 2
  "MAYA", // 3
  "Hello.", // 4
  "", // 5
  "EXT. ALLEY - NIGHT", // 6
  "Theo walks.", // 7
  "", // 8
  "INT. APARTMENT - DAY", // 9
  "The end.", // 10
].join("\n");

describe("computeSceneLineRanges", () => {
  it("splits on scene-heading lines and assigns inclusive 1-indexed ranges", () => {
    const ranges = computeSceneLineRanges(SCRIPT, 3);
    expect(ranges).toEqual([
      { start: 1, end: 5 },
      { start: 6, end: 8 },
      { start: 9, end: 10 },
    ]);
  });

  it("returns null for scenes past the last detected heading", () => {
    const ranges = computeSceneLineRanges(SCRIPT, 5);
    expect(ranges.slice(0, 3)).toEqual([
      { start: 1, end: 5 },
      { start: 6, end: 8 },
      { start: 9, end: 10 },
    ]);
    expect(ranges.slice(3)).toEqual([null, null]);
  });

  it("handles text with no scene headings at all", () => {
    expect(computeSceneLineRanges("just some text\nmore text", 1)).toEqual([null]);
  });
});
