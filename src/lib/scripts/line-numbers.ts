// Scene heading detector shared with lib/agents/breakdown.ts's chunking pass
// (kept as a separate copy there since that file only needs it to decide
// chunk boundaries, not to produce line numbers).
const SCENE_HEADING_RE = /^\s*(INT|EXT|INT\/EXT)[.\s]/i;

export interface LineRange {
  start: number;
  end: number;
}

/**
 * Finds the 1-indexed start/end line of each scene in a script's raw text,
 * by locating scene-heading lines in order and assuming (per the breakdown
 * agent's own renumbering) that extracted scenes appear in the same
 * top-to-bottom order as their headings. A scene without a matching
 * heading (heading count < sceneCount, e.g. OCR noise swallowed it) gets
 * `null` rather than a guessed range.
 */
export function computeSceneLineRanges(rawText: string, sceneCount: number): (LineRange | null)[] {
  const lines = rawText.split("\n");
  const headingLineNumbers: number[] = [];
  lines.forEach((line, i) => {
    if (SCENE_HEADING_RE.test(line)) headingLineNumbers.push(i + 1);
  });

  const ranges: (LineRange | null)[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const start = headingLineNumbers[i];
    if (start === undefined) {
      ranges.push(null);
      continue;
    }
    const nextStart = headingLineNumbers[i + 1];
    const end = nextStart !== undefined ? nextStart - 1 : lines.length;
    ranges.push({ start, end });
  }
  return ranges;
}
