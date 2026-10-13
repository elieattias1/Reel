import { createSdkMcpServer, query, tool, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  formatIntRange,
  parseIntRange,
  rowToSet,
  rowToShot,
  setToInsertRow,
  shotToInsertRow,
} from "@/lib/overheads/db";
import {
  CameraSchema,
  ActorSchema,
  DoorSchema,
  SetPieceSchema,
  ShotSizeSchema,
  WallSchema,
  WindowSchema,
  SUPER_35_SENSOR_WIDTH_MM,
  type Set as OverheadSet,
  type Shot,
} from "@/lib/overheads/schema";
import { nextSetupLetter } from "@/lib/overheads/labels";
import {
  axisFromActors,
  checkAxisCrossings,
  checkCameraInOtherCones,
  checkOutOfBounds,
  checkUncoveredLines,
  estimateShootingTime,
  type ValidationIssue,
} from "@/lib/overheads/validators";
import { createServiceClient } from "@/lib/supabase/service";
import type { SetRow, ShotRow } from "@/lib/supabase/types";

const READ_TOOLS = [
  "mcp__blocking__get_scene",
  "mcp__blocking__get_set",
  "mcp__blocking__list_shots",
  "mcp__blocking__get_validation",
];

const DRAFT_WRITE_TOOLS = [
  "mcp__blocking__create_set",
  "mcp__blocking__update_set",
  "mcp__blocking__add_shot",
  "mcp__blocking__update_shot",
  "mcp__blocking__delete_shot",
  "mcp__blocking__reorder_shots",
  "mcp__blocking__apply_coverage_pattern",
];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Every helper below takes `projectId` and filters on it, even though a
 * `scene_id` alone would usually resolve to the right row — defense in
 * depth so a session bound to one project (buildBlockingMcpServer's own
 * `projectId` closure) can never read or write another project's scene
 * just because it guessed or was given that scene's id.
 */
async function loadSceneContext(projectId: string, sceneId: string) {
  const supabase = createServiceClient();
  const { data: scene } = await supabase
    .from("scenes")
    .select("id, project_id, script_version_id, scene_number, synopsis, primary_location_id, line_start, line_end")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .single();
  return scene;
}

async function loadSetForScene(projectId: string, sceneId: string): Promise<{ row: SetRow; set: OverheadSet } | null> {
  const scene = await loadSceneContext(projectId, sceneId);
  if (!scene?.primary_location_id) return null;

  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("sets")
    .select("*")
    .eq("project_id", scene.project_id)
    .eq("location_id", scene.primary_location_id)
    .maybeSingle();

  if (!row) return null;
  return { row, set: rowToSet(row) };
}

async function loadShotsForScene(projectId: string, sceneId: string): Promise<{ rows: ShotRow[]; shots: Shot[] }> {
  const scene = await loadSceneContext(projectId, sceneId);
  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("shots")
    .select("*")
    .eq("scene_id", sceneId)
    .eq("project_id", projectId)
    .order("position");
  const shots = (rows ?? []).map((r) => rowToShot(r, String(scene?.scene_number ?? "")));
  return { rows: rows ?? [], shots };
}

/**
 * Every draft write takes a new version — a full {set, shots} snapshot of
 * the scene after the change — so the UI can show history and undo.
 */
async function writeOverheadVersion(projectId: string, sceneId: string, createdBy: "agent" | "human") {
  const supabase = createServiceClient();
  const [setResult, shotsResult] = await Promise.all([loadSetForScene(projectId, sceneId), loadShotsForScene(projectId, sceneId)]);

  const { data: lastVersion } = await supabase
    .from("overhead_versions")
    .select("version_number")
    .eq("scene_id", sceneId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("overhead_versions").insert({
    project_id: projectId,
    scene_id: sceneId,
    version_number: (lastVersion?.version_number ?? 0) + 1,
    snapshot: { set: setResult?.set ?? null, shots: shotsResult.shots },
    created_by: createdBy,
  });
}

function validateSceneState(set: OverheadSet | null, shots: Shot[], lineRange: { start: number; end: number } | null, allSetups: boolean): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!set) return issues;

  const setups = shots.map((s) => ({ ...s.setup, id: s.label }));
  const primary = shots.find((s) => s.actors.length >= 2);
  const axis = primary ? axisFromActors(primary.actors) : null;
  if (axis) issues.push(...checkAxisCrossings(axis, setups));

  if (allSetups) {
    issues.push(...checkCameraInOtherCones(setups, SUPER_35_SENSOR_WIDTH_MM));
  }

  const subjects = shots.flatMap((s) => [
    { id: s.label, x: s.setup.x, y: s.setup.y, kind: "camera" as const },
    ...s.actors.map((a) => ({ id: `${s.label}:${a.characterId}`, x: a.x, y: a.y, kind: "actor" as const })),
  ]);
  issues.push(...checkOutOfBounds(set, subjects));

  if (lineRange) issues.push(...checkUncoveredLines(lineRange, shots));

  return issues;
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

// The agent never supplies a setup id — the tool handlers always generate one.
const CameraInputSchema = CameraSchema.omit({ id: true });

export function buildBlockingMcpServer(projectId: string) {
  const supabase = createServiceClient();

  return createSdkMcpServer({
    name: "blocking",
    version: "0.1.0",
    tools: [
      // --- Read tools ------------------------------------------------------
      tool(
        "get_scene",
        "Get a scene's script text (with 1-indexed line numbers so you can set shots' linesCovered precisely), synopsis, location, and characters present.",
        { scene_id: z.string() },
        async ({ scene_id }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          if (!scene) return { content: [{ type: "text", text: "Scene not found." }] };

          const [{ data: scriptVersion }, { data: location }, { data: sceneCharacters }] = await Promise.all([
            supabase.from("script_versions").select("raw_text").eq("id", scene.script_version_id).maybeSingle(),
            scene.primary_location_id
              ? supabase.from("locations").select("name").eq("id", scene.primary_location_id).maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from("scene_characters")
              .select("characters(id, name)")
              .eq("scene_id", scene_id),
          ]);

          let scriptText = "No line-numbered script text available for this scene (line_start/line_end not set — run the backfill).";
          if (scriptVersion?.raw_text && scene.line_start && scene.line_end) {
            const lines = scriptVersion.raw_text.split("\n");
            scriptText = lines
              .slice(scene.line_start - 1, scene.line_end)
              .map((line: string, i: number) => `${scene.line_start! + i}: ${line}`)
              .join("\n");
          }

          const characters = (sceneCharacters ?? []).map(
            (sc) => (sc.characters as unknown as { id: string; name: string })
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  scene_id: scene.id,
                  scene_number: scene.scene_number,
                  synopsis: scene.synopsis,
                  location_id: scene.primary_location_id,
                  location_name: (location as { name: string } | null)?.name ?? null,
                  characters,
                  line_range: scene.line_start && scene.line_end ? { start: scene.line_start, end: scene.line_end } : null,
                  script_text: scriptText,
                }),
              },
            ],
          };
        }
      ),

      tool(
        "get_set",
        "Get the floor plan (set) for a scene's location, if one exists yet.",
        { scene_id: z.string() },
        async ({ scene_id }) => {
          const found = await loadSetForScene(projectId, scene_id);
          return {
            content: [
              { type: "text", text: found ? JSON.stringify(found.set) : "No set exists yet for this scene's location." },
            ],
          };
        }
      ),

      tool(
        "list_shots",
        "List every shot drafted so far for a scene, in order.",
        { scene_id: z.string() },
        async ({ scene_id }) => {
          const { shots } = await loadShotsForScene(projectId, scene_id);
          return { content: [{ type: "text", text: JSON.stringify(shots) }] };
        }
      ),

      tool(
        "get_validation",
        "Get current validation issues for a scene (180-degree line crossings, out-of-bounds/wall/set-piece collisions, uncovered script lines, and — if all_setups is true — cameras inside another setup's frame), plus a setup-count/time estimate.",
        { scene_id: z.string(), all_setups: z.boolean().optional() },
        async ({ scene_id, all_setups }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          const [setFound, { shots }] = await Promise.all([loadSetForScene(projectId, scene_id), loadShotsForScene(projectId, scene_id)]);
          const lineRange = scene?.line_start && scene?.line_end ? { start: scene.line_start, end: scene.line_end } : null;
          const issues = validateSceneState(setFound?.set ?? null, shots, lineRange, Boolean(all_setups));
          const estimate = estimateShootingTime(shots.length);

          return { content: [{ type: "text", text: JSON.stringify({ issues, estimate }) }] };
        }
      ),

      // --- Draft write tools (allowed, versioned) --------------------------
      tool(
        "create_set",
        "Create the floor plan (set) for a scene's location. You MAY invent reasonable placeholder geometry when none is confirmed, but you MUST say so plainly in your reply to the user when you do (set assumed: true) — never silently invent a set.",
        {
          scene_id: z.string(),
          name: z.string(),
          width_ft: z.number().positive(),
          depth_ft: z.number().positive(),
          walls: z.array(WallSchema),
          doors: z.array(DoorSchema).default([]),
          windows: z.array(WindowSchema).default([]),
          setPieces: z.array(SetPieceSchema).default([]),
          assumed: z.boolean(),
        },
        async ({ scene_id, name, width_ft, depth_ft, walls, doors, windows, setPieces, assumed }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          if (!scene?.primary_location_id) {
            return { content: [{ type: "text", text: "This scene has no location on record; can't create a set." }] };
          }

          const existing = await loadSetForScene(projectId, scene_id);
          if (existing) {
            return { content: [{ type: "text", text: "A set already exists for this location — use update_set instead." }] };
          }

          const set: OverheadSet = {
            id: crypto.randomUUID(),
            name,
            units: "ft",
            bounds: { width: width_ft, height: depth_ft },
            walls,
            doors,
            windows,
            setPieces,
          };
          const insertRow = setToInsertRow(scene.project_id, scene.primary_location_id, set);
          await supabase.from("sets").insert(insertRow);
          await writeOverheadVersion(scene.project_id, scene_id, "agent");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ created: set, assumed, reminder: assumed ? "Tell the user this geometry is an assumption, not confirmed." : undefined }),
              },
            ],
          };
        }
      ),

      tool(
        "update_set",
        "Update the set's dimensions or geometry for a scene's location.",
        {
          scene_id: z.string(),
          name: z.string().optional(),
          width_ft: z.number().positive().optional(),
          depth_ft: z.number().positive().optional(),
          walls: z.array(WallSchema).optional(),
          doors: z.array(DoorSchema).optional(),
          windows: z.array(WindowSchema).optional(),
          setPieces: z.array(SetPieceSchema).optional(),
        },
        async ({ scene_id, ...patch }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          const found = await loadSetForScene(projectId, scene_id);
          if (!scene || !found) return { content: [{ type: "text", text: "No set exists yet — use create_set first." }] };

          const updated: OverheadSet = {
            ...found.set,
            name: patch.name ?? found.set.name,
            bounds: { width: patch.width_ft ?? found.set.bounds.width, height: patch.depth_ft ?? found.set.bounds.height },
            walls: patch.walls ?? found.set.walls,
            doors: patch.doors ?? found.set.doors,
            windows: patch.windows ?? found.set.windows,
            setPieces: patch.setPieces ?? found.set.setPieces,
          };
          const insertRow = setToInsertRow(scene.project_id, scene.primary_location_id!, updated);
          await supabase.from("sets").update(insertRow).eq("id", found.row.id);
          await writeOverheadVersion(scene.project_id, scene_id, "agent");

          return { content: [{ type: "text", text: JSON.stringify(updated) }] };
        }
      ),

      tool(
        "add_shot",
        "Add ONE new shot to a scene (one call per shot — never batch several shots into one call, so the client can stream them in as they're created). Returns the created shot plus any new validation warnings so you can self-correct.",
        {
          scene_id: z.string(),
          title: z.string(),
          shotSize: ShotSizeSchema,
          linesCovered: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }),
          note: z.string().nullable().optional(),
          setup: CameraInputSchema,
          actors: z.array(ActorSchema).default([]),
        },
        async ({ scene_id, title, shotSize, linesCovered, note, setup, actors }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          const found = await loadSetForScene(projectId, scene_id);
          if (!scene || !found) {
            return { content: [{ type: "text", text: "No set exists yet for this scene — use create_set before adding shots." }] };
          }

          const { rows } = await loadShotsForScene(projectId, scene_id);
          const letter = nextSetupLetter(rows.map((r) => r.setup_letter));
          const position = rows.length;

          const shot: Omit<Shot, "id" | "label"> = {
            title,
            shotSize,
            linesCovered,
            note: note ?? null,
            setup: { ...setup, id: crypto.randomUUID() },
            actors,
          };

          const insertRow = shotToInsertRow(scene.project_id, scene_id, found.row.id, position, letter, shot);
          const { data: created, error } = await supabase.from("shots").insert(insertRow).select().single();
          if (error) return { content: [{ type: "text", text: `Failed to add shot: ${error.message}` }] };

          await writeOverheadVersion(scene.project_id, scene_id, "agent");

          const { shots: allShots } = await loadShotsForScene(projectId, scene_id);
          const lineRange = scene.line_start && scene.line_end ? { start: scene.line_start, end: scene.line_end } : null;
          const issues = validateSceneState(found.set, allShots, lineRange, false);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ created: rowToShot(created, String(scene.scene_number)), issues }),
              },
            ],
          };
        }
      ),

      tool(
        "update_shot",
        "Update fields of an existing shot by id.",
        {
          shot_id: z.string(),
          title: z.string().optional(),
          shotSize: ShotSizeSchema.optional(),
          linesCovered: z.object({ start: z.number().int().positive(), end: z.number().int().positive() }).optional(),
          note: z.string().nullable().optional(),
          setup: CameraInputSchema.partial().optional(),
          actors: z.array(ActorSchema).optional(),
        },
        async ({ shot_id, ...patch }) => {
          const { data: row } = await supabase.from("shots").select("*").eq("id", shot_id).eq("project_id", projectId).single();
          if (!row) return { content: [{ type: "text", text: "Shot not found." }] };

          const existing = rowToShot(row, "");
          const updated: Omit<Shot, "id" | "label"> = {
            title: patch.title ?? existing.title,
            shotSize: patch.shotSize ?? existing.shotSize,
            linesCovered: patch.linesCovered ?? existing.linesCovered,
            note: patch.note !== undefined ? patch.note : existing.note,
            setup: patch.setup ? { ...existing.setup, ...patch.setup } : existing.setup,
            actors: patch.actors ?? existing.actors,
          };

          const insertRow = shotToInsertRow(row.project_id, row.scene_id, row.set_id, row.position, row.setup_letter, updated);
          await supabase.from("shots").update(insertRow).eq("id", shot_id);
          await writeOverheadVersion(row.project_id, row.scene_id, "agent");

          const scene = await loadSceneContext(projectId, row.scene_id);
          const found = await loadSetForScene(projectId, row.scene_id);
          const { shots: allShots } = await loadShotsForScene(projectId, row.scene_id);
          const lineRange = scene?.line_start && scene?.line_end ? { start: scene.line_start, end: scene.line_end } : null;
          const issues = validateSceneState(found?.set ?? null, allShots, lineRange, false);

          return { content: [{ type: "text", text: JSON.stringify({ updated: true, issues }) }] };
        }
      ),

      tool(
        "delete_shot",
        "Delete a shot by id.",
        { shot_id: z.string() },
        async ({ shot_id }) => {
          const { data: row } = await supabase
            .from("shots")
            .select("project_id, scene_id")
            .eq("id", shot_id)
            .eq("project_id", projectId)
            .single();
          if (!row) return { content: [{ type: "text", text: "Shot not found." }] };

          await supabase.from("shots").delete().eq("id", shot_id);
          await writeOverheadVersion(row.project_id, row.scene_id, "agent");

          return { content: [{ type: "text", text: "Deleted." }] };
        }
      ),

      tool(
        "reorder_shots",
        "Reorder a scene's shots by passing every shot id for that scene in the new order.",
        { scene_id: z.string(), ordered_shot_ids: z.array(z.string()) },
        async ({ scene_id, ordered_shot_ids }) => {
          const scene = await loadSceneContext(projectId, scene_id);
          if (!scene) return { content: [{ type: "text", text: "Scene not found." }] };

          await Promise.all(
            ordered_shot_ids.map((id, position) => supabase.from("shots").update({ position }).eq("id", id).eq("scene_id", scene_id))
          );
          await writeOverheadVersion(scene.project_id, scene_id, "agent");

          return { content: [{ type: "text", text: "Reordered." }] };
        }
      ),

      tool(
        "apply_coverage_pattern",
        "Get a starting-point checklist for a standard coverage pattern (master, over_the_shoulder_pair, singles, inserts) to adapt to this scene's actual blocking — this does NOT create shots itself, you still call add_shot for each one you decide to use.",
        {
          scene_id: z.string(),
          pattern: z.enum(["master", "over_the_shoulder_pair", "singles", "inserts"]),
        },
        async ({ pattern }) => {
          const guidance: Record<typeof pattern, string> = {
            master: "One wide setup that holds every actor in the scene for its full duration — establish before cutting in.",
            over_the_shoulder_pair: "Two setups, each positioned over one actor's shoulder favoring the other actor across the 180° line — keep both on the same side of the axis.",
            singles: "One setup per actor who speaks, tight enough to isolate them, still respecting the established axis side.",
            inserts: "A close, often high-angle setup on a specific object or detail the scene calls out — typically no actors in frame.",
          };
          return { content: [{ type: "text", text: guidance[pattern] }] };
        }
      ),

      // --- Gated production write -------------------------------------------
      tool(
        "propose_schedule_impact",
        "Propose that this scene's blocking will affect the shoot schedule (e.g. it now needs a dolly day, or more setups than budgeted time allows). Never commits directly — the producer must approve the resulting pending-change card.",
        {
          scene_id: z.string(),
          summary: z.string().describe("one sentence describing the impact, e.g. 'Scene 12 now needs a dolly day'"),
          reason: z.string(),
          extra_days: z.number().optional(),
        },
        async () => ({ content: [{ type: "text", text: "Proposal recorded; awaiting producer approval." }] })
      ),
    ],
  });
}

export function buildBlockingCanUseTool(
  projectId: string,
  chatSessionId: string | null,
  onPending: (id: string) => void
): CanUseTool {
  return async (toolName, input) => {
    if (READ_TOOLS.includes(toolName) || DRAFT_WRITE_TOOLS.includes(toolName)) {
      return { behavior: "allow" };
    }

    if (toolName === "mcp__blocking__propose_schedule_impact") {
      const supabase = createServiceClient();
      const title = `Schedule impact: ${String(input.summary ?? "blocking change")}`;
      const description = String(input.reason ?? "The blocking agent flagged a schedule impact.");

      const { data } = await supabase
        .from("pending_changes")
        .insert({
          project_id: projectId,
          chat_session_id: chatSessionId,
          tool_name: toolName,
          title,
          description,
          proposed_input: input,
        })
        .select("id")
        .single();

      if (data?.id) onPending(data.id);

      return {
        behavior: "deny",
        message: `Proposed as a pending change ("${title}") for the producer to review. Do not retry this tool — wait for their decision and move on with the rest of your answer.`,
      };
    }

    return { behavior: "deny", message: `Tool ${toolName} is not permitted in the blocking agent.` };
  };
}

export interface BlockingTurnResult {
  reply: string;
  sessionId: string | null;
  pendingChangeIds: string[];
}

/**
 * Sends one chat turn to the blocking agent for a project, resuming its
 * own persistent session (separate from the Reel chat agent's —
 * chat_sessions.kind distinguishes them) unless `fork` is set.
 */
export async function sendBlockingMessage(
  projectId: string,
  message: string,
  opts: {
    resumeSessionId?: string | null;
    fork?: boolean;
    chatSessionId?: string | null;
    activeSceneId?: string | null;
    activeShotId?: string | null;
  } = {}
): Promise<BlockingTurnResult> {
  const server = buildBlockingMcpServer(projectId);
  const pendingChangeIds: string[] = [];
  const canUseTool = buildBlockingCanUseTool(projectId, opts.chatSessionId ?? null, (id) => pendingChangeIds.push(id));

  let reply = "";
  let sessionId: string | null = null;

  const context = opts.activeShotId
    ? `[Scene ${opts.activeSceneId ?? "unknown"}, viewing shot ${opts.activeShotId}]`
    : opts.activeSceneId
      ? `[Scene ${opts.activeSceneId}, no shots drafted yet]`
      : null;
  const prompt = context ? `${context} ${message}` : message;

  for await (const msg of query({
    prompt,
    options: {
      resume: opts.resumeSessionId ?? undefined,
      forkSession: opts.fork ?? false,
      mcpServers: { blocking: server },
      allowedTools: [...READ_TOOLS, ...DRAFT_WRITE_TOOLS],
      canUseTool,
      model: process.env.REEL_BLOCKING_MODEL || "claude-sonnet-4-5",
      systemPrompt:
        "You are an experienced director and DP running the blocking workspace for a film production app called Reel. Every message starts with a bracketed context tag like '[Scene <id>, viewing shot <id>]' or '[Scene <id>, no shots drafted yet]' — that scene id is the scene_id you pass to every tool call; never ask the user for it or guess one, it's always given to you. Resolve phrases like 'this shot'/'this one' to that shot id, and 'this scene' to that scene id. Coordinates are feet from the set's top-left corner (x right, y down). Headings are clockwise degrees where 0=up/−y, 90=right/+x, 180=down/+y, 270=left/−x — this is NOT the usual '0=right' convention, so always compute a camera's or actor's heading toward a subject as atan2(dx, -dy) in degrees (dx, dy = subject minus self), normalized to 0-360; never eyeball it, a wrong heading points the shot away from its subject. For every scene you cover, aim for the fewest setups that fully cover every scripted line, using get_validation to check coverage as you go. Keep cameras on one side of the 180-degree line unless the user explicitly asks to cross it. Add shots one at a time via add_shot — never describe a shot in prose and skip creating it. Explain your choices briefly in chat as you work, not just at the end. Never invent set geometry the user hasn't confirmed without saying so plainly in your reply. If a change would affect the shoot schedule, use propose_schedule_impact rather than just stating it.",
    },
  })) {
    const m = msg as { type: string; subtype?: string; message?: { content?: Array<{ type: string; text?: string }> }; session_id?: string; result?: string };

    if (m.type === "assistant" && m.message?.content) {
      for (const block of m.message.content) {
        if (block.type === "text" && block.text) reply += block.text;
      }
    }
    if (m.type === "result" && m.subtype === "success") {
      if (typeof m.result === "string" && !reply) reply = m.result;
    }
    if (m.session_id) sessionId = m.session_id;
  }

  return { reply: reply.trim(), sessionId, pendingChangeIds };
}

export { parseIntRange, formatIntRange };
