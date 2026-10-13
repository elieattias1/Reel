import Anthropic from "@anthropic-ai/sdk";
import { CREW_REFERENCE, estimateProductionScale } from "@/lib/agents/rate-card";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ExtractedScene {
  scene_number: number;
  int_ext: "INT" | "EXT" | "INT/EXT";
  day_night: "DAY" | "NIGHT" | "DAWN" | "DUSK" | "UNSPECIFIED";
  location: string;
  synopsis: string;
  characters: string[];
  props: string[];
  complexity_flags: string[];
}

export interface ProjectedCastRole {
  role_name: string;
  character_name: string;
}

export interface ProjectedCrewRole {
  role_type: string;
  headcount: number;
}

export interface BreakdownResult {
  scenes: ExtractedScene[];
  projected_cast: ProjectedCastRole[];
  projected_crew: ProjectedCrewRole[];
}

const EXTRACTION_TOOL = {
  name: "record_breakdown",
  description:
    "Record the structured scene-by-scene breakdown of a screenplay: scenes with their sluglines decomposed, characters present, props/special requirements, and complexity flags.",
  input_schema: {
    type: "object" as const,
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            scene_number: { type: "integer" },
            int_ext: { type: "string", enum: ["INT", "EXT", "INT/EXT"] },
            day_night: { type: "string", enum: ["DAY", "NIGHT", "DAWN", "DUSK", "UNSPECIFIED"] },
            location: { type: "string", description: "Primary location name, normalized (e.g. 'KITCHEN', not 'THE KITCHEN - CONTINUOUS')" },
            synopsis: { type: "string", description: "One or two sentence summary of what happens in the scene" },
            characters: { type: "array", items: { type: "string" }, description: "Named or clearly implied speaking characters present" },
            props: { type: "array", items: { type: "string" }, description: "Notable props or special requirements (weapons, vehicles, animals, period items, etc.)" },
            complexity_flags: {
              type: "array",
              items: { type: "string", enum: ["stunts", "vfx", "large_cast", "night_exterior", "water", "fire", "animals", "vehicles", "minors", "weapons", "crowd"] },
            },
          },
          required: ["scene_number", "int_ext", "day_night", "location", "synopsis", "characters", "props", "complexity_flags"],
        },
      },
    },
    required: ["scenes"],
  },
};

/**
 * Sends extracted script text to Claude for structured scene/character/
 * location/prop extraction, rather than a brittle screenplay-layout parser.
 * Large scripts are chunked by scene-heading boundaries so a single request
 * stays within a comfortable context window; scene numbers are
 * renumbered sequentially across chunks.
 */
export async function runBreakdownAgent(scriptText: string): Promise<BreakdownResult> {
  const chunks = chunkByScenes(scriptText);
  const scenes: ExtractedScene[] = [];

  for (const chunk of chunks) {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 8000,
      system:
        "You are a professional script supervisor breaking down a screenplay for production. Extract every scene precisely. Infer INT/EXT and DAY/NIGHT from the slugline. Only list characters who are clearly present in the scene. Flag complexity conservatively — only when the text plainly calls for it.",
      messages: [
        {
          role: "user",
          content: `Break down the following screenplay excerpt into scenes.\n\n${chunk}`,
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_breakdown" },
    });

    const toolUse = message.content.find((b) => b.type === "tool_use");
    if (toolUse && toolUse.type === "tool_use") {
      const parsed = toolUse.input as { scenes: ExtractedScene[] };
      scenes.push(...parsed.scenes);
    }
  }

  // Renumber sequentially — chunk-local numbering can collide/repeat.
  scenes.forEach((s, i) => (s.scene_number = i + 1));

  const uniqueCharacters = Array.from(new Set(scenes.flatMap((s) => s.characters)));
  const uniqueLocations = Array.from(new Set(scenes.map((s) => s.location)));
  const complexityFlagCount = scenes.reduce((n, s) => n + s.complexity_flags.length, 0);

  const scale = estimateProductionScale({
    speakingRoles: uniqueCharacters.length,
    locationCount: uniqueLocations.length,
    complexityFlagCount,
  });

  const projected_cast: ProjectedCastRole[] = uniqueCharacters.map((name) => ({
    role_name: name,
    character_name: name,
  }));

  const projected_crew: ProjectedCrewRole[] = CREW_REFERENCE[scale].crew;

  return { scenes, projected_cast, projected_crew };
}

/**
 * Splits raw script text into chunks on scene-heading boundaries (lines in
 * ALL CAPS starting with INT./EXT./INT/EXT.), keeping each request well
 * under the model's context window for very long scripts.
 */
function chunkByScenes(text: string, maxCharsPerChunk = 12000): string[] {
  const sceneHeadingRe = /^\s*(INT|EXT|INT\/EXT)[.\s]/i;
  const lines = text.split("\n");

  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const isHeading = sceneHeadingRe.test(line);
    if (isHeading && current.length > maxCharsPerChunk) {
      chunks.push(current);
      current = "";
    }
    current += line + "\n";
  }
  if (current.trim()) chunks.push(current);
  return chunks.length > 0 ? chunks : [text];
}
