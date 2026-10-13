import Anthropic from "@anthropic-ai/sdk";
import type { LineRange } from "./line-numbers";

const LOCATE_TOOL = {
  name: "record_scene_lines",
  description: "Record the first and last line number of every scene in a numbered script text.",
  input_schema: {
    type: "object" as const,
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_number: { type: "integer" },
            start_line: { type: "integer" },
            end_line: { type: "integer" },
          },
          required: ["scene_number", "start_line", "end_line"],
        },
      },
    },
    required: ["scenes"],
  },
};

/**
 * Fallback for scripts `computeSceneLineRanges` can't handle — source
 * text with no INT./EXT. sluglines at all (a stage play, a loosely
 * formatted draft, an OCR'd book). Asks Claude to locate each scene's
 * line range directly against the already-extracted scene list, using
 * the same numbered-line format `get_scene` shows the blocking agent.
 * Only called when the regex heading scan finds too few headings to
 * trust (see callers) — it costs a real request, the regex path is free.
 */
export async function locateSceneLinesWithAI(
  rawText: string,
  scenes: { scene_number: number; synopsis: string }[]
): Promise<Map<number, LineRange>> {
  // Constructed per call, not at module load — this file is imported by
  // scripts/backfill-scene-lines.ts, a standalone script that loads
  // .env.local via dotenv at runtime; a module-level client would read
  // process.env.ANTHROPIC_API_KEY before that import-hoisted config()
  // call ever ran.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const numberedText = rawText
    .split("\n")
    .map((line, i) => `${i + 1}: ${line}`)
    .join("\n");

  const sceneList = scenes.map((s) => `${s.scene_number}. ${s.synopsis}`).join("\n");

  const message = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4000,
    system:
      "You are locating scene boundaries in a script's raw text for production line-numbering. Scenes are contiguous and appear in order; scene N's text ends the line before scene N+1 begins, and the last scene ends at the final line of the text. The text may not use standard INT./EXT. sluglines (e.g. a stage play or a loosely formatted draft) — use the scene synopses and narrative flow to find each boundary.",
    messages: [
      {
        role: "user",
        content: `Here is the numbered script text:\n\n${numberedText}\n\nHere are the scenes in order:\n${sceneList}\n\nFor each scene number, record its start_line and end_line.`,
      },
    ],
    tools: [LOCATE_TOOL],
    tool_choice: { type: "tool", name: "record_scene_lines" },
  });

  const toolUse = message.content.find((b) => b.type === "tool_use");
  const result = new Map<number, LineRange>();
  if (toolUse && toolUse.type === "tool_use") {
    const parsed = toolUse.input as { scenes: { scene_number: number; start_line: number; end_line: number }[] };
    for (const s of parsed.scenes) {
      result.set(s.scene_number, { start: s.start_line, end: s.end_line });
    }
  }
  return result;
}
