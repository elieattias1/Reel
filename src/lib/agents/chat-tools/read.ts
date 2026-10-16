import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { checkConflicts, cloneConflictContext, loadConflictContext, runConflictChecks } from "@/lib/schedule/conflicts";
import { getDayDetail } from "@/lib/schedule/day-detail";
import { getDayOutOfDays } from "@/lib/schedule/dood";
import { createServiceClient } from "@/lib/supabase/service";

export const READ_TOOL_NAMES = [
  "mcp__reel__get_schedule",
  "mcp__reel__get_day",
  "mcp__reel__get_day_out_of_days",
  "mcp__reel__check_conflicts",
  "mcp__reel__get_cast_availability",
  "mcp__reel__get_location_availability",
  "mcp__reel__get_budget",
  "mcp__reel__get_budget_line",
  "mcp__reel__get_cast_crew",
  "mcp__reel__preview_impact",
];

/**
 * Every read tool the Reel chat agent can call freely (see READ_TOOL_NAMES,
 * put into `allowedTools` so these never go through canUseTool at all).
 * Replaces the old coarse get_scenes/get_budget/get_schedule/get_cast_crew
 * quartet with the grain the stripboard/DOOD/conflict-rail UI actually
 * needs, so the agent can reason and cite precisely.
 */
export function buildReadTools(projectId: string) {
  const supabase = createServiceClient();

  return [
    tool(
      "get_schedule",
      "Get the project's shoot schedule for a version (defaults to the latest): days in order, with the scenes assigned to each and their order within the day.",
      { version_id: z.string().optional().describe("schedule_versions id; omit for the latest version") },
      async ({ version_id }) => {
        const ctx = await loadConflictContext(supabase, projectId, { scheduleVersionId: version_id });
        const days = ctx.days.map((d) => ({
          ...d,
          scenes: d.sceneIds.map((id) => ctx.scenesById.get(id)).filter(Boolean),
        }));
        return { content: [{ type: "text", text: JSON.stringify({ schedule_version_id: ctx.scheduleVersionId, days }) }] };
      }
    ),
    tool(
      "get_day",
      "Get one shoot day's full detail: its scenes, required cast resolved to confirmed people (or flagged unconfirmed), required crew by department, and this day's own conflicts.",
      { day_id: z.string() },
      async ({ day_id }) => {
        const detail = await getDayDetail(supabase, projectId, day_id);
        return { content: [{ type: "text", text: JSON.stringify(detail ?? { error: "Day not found" }) }] };
      }
    ),
    tool(
      "get_day_out_of_days",
      "Get the Day-Out-of-Days grid for a schedule version: for every confirmed cast member, their W(ork)/H(old)/T(ravel)/SW(start+work)/WF(work+finish) code on every shoot day. This is what drives payroll cost and union-compliance checks.",
      { version_id: z.string().optional() },
      async ({ version_id }) => {
        const result = await getDayOutOfDays(supabase, projectId, version_id);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    ),
    tool(
      "check_conflicts",
      "Get the structured list of unresolved schedule conflicts: double bookings, turnaround violations, location unavailability, missing required crew, and exceeded minor work-hour limits. Call this before proposing any schedule change so your reasoning is grounded in the current state, not just the raw fields you're changing.",
      {
        version_id: z.string().optional(),
        day_id: z.string().optional().describe("restrict to conflicts touching this day"),
      },
      async ({ version_id, day_id }) => {
        const conflicts = await checkConflicts(supabase, projectId, { scheduleVersionId: version_id, dayId: day_id });
        return { content: [{ type: "text", text: JSON.stringify(conflicts) }] };
      }
    ),
    tool(
      "get_cast_availability",
      "Get a cast member's unavailable date ranges and the reason, if any has been recorded.",
      { cast_role_id: z.string() },
      async ({ cast_role_id }) => {
        const { data } = await supabase
          .from("availability")
          .select("*")
          .eq("project_id", projectId)
          .eq("person_type", "cast")
          .eq("cast_role_id", cast_role_id)
          .maybeSingle();
        return { content: [{ type: "text", text: JSON.stringify(data ?? null) }] };
      }
    ),
    tool(
      "get_location_availability",
      "Get a location's address, permit status, and available date ranges.",
      { location_id: z.string() },
      async ({ location_id }) => {
        const { data } = await supabase.from("locations").select("*").eq("id", location_id).eq("project_id", projectId).maybeSingle();
        return { content: [{ type: "text", text: JSON.stringify(data ?? null) }] };
      }
    ),
    tool(
      "get_budget",
      "Get budget lines for the project, each with category, description, amount, source, and confidence. Optionally filter by a case-insensitive substring match on category or description.",
      { filter: z.string().optional() },
      async ({ filter }) => {
        let query = supabase.from("budget_lines").select("*").eq("project_id", projectId);
        if (filter) query = query.or(`category.ilike.%${filter}%,description.ilike.%${filter}%`);
        const { data } = await query;
        return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
      }
    ),
    tool(
      "get_budget_line",
      "Get a single budget line by id.",
      { line_id: z.string() },
      async ({ line_id }) => {
        const { data } = await supabase.from("budget_lines").select("*").eq("id", line_id).eq("project_id", projectId).maybeSingle();
        return { content: [{ type: "text", text: JSON.stringify(data ?? null) }] };
      }
    ),
    tool(
      "get_cast_crew",
      "Get the project's cast and crew roles, both AI-projected and producer-confirmed. Optionally filter by a case-insensitive substring match on role name/type or person name.",
      { filter: z.string().optional() },
      async ({ filter }) => {
        let castQuery = supabase.from("cast_roles").select("*").eq("project_id", projectId);
        let crewQuery = supabase.from("crew_roles").select("*").eq("project_id", projectId);
        if (filter) {
          castQuery = castQuery.or(`role_name.ilike.%${filter}%,person_name.ilike.%${filter}%`);
          crewQuery = crewQuery.or(`role_type.ilike.%${filter}%,person_name.ilike.%${filter}%`);
        }
        const [cast, crew] = await Promise.all([castQuery, crewQuery]);
        return { content: [{ type: "text", text: JSON.stringify({ cast: cast.data ?? [], crew: crew.data ?? [] }) }] };
      }
    ),
    tool(
      "preview_impact",
      "Non-committing simulation: given a hypothetical schedule or budget change, returns the resulting conflict list and an estimated budget delta WITHOUT writing anything — nothing is persisted, not even a new schedule version. Call this before using any propose_* tool for a schedule change, and reference what you found in your reason.",
      {
        change: z.object({
          kind: z.enum(["move_scene", "swap_days", "budget_line_change"]),
          scene_id: z.string().optional().describe("for move_scene: the scene being moved"),
          target_day_id: z.string().optional().describe("for move_scene: the day it would move to"),
          day_id_a: z.string().optional().describe("for swap_days"),
          day_id_b: z.string().optional().describe("for swap_days"),
          line_id: z.string().optional().describe("for budget_line_change"),
          new_amount: z.number().optional().describe("for budget_line_change"),
        }),
      },
      async ({ change }) => {
        const before = await loadConflictContext(supabase, projectId, {});
        const after = cloneConflictContext(before);

        if (change.kind === "move_scene" && change.scene_id && change.target_day_id) {
          for (const day of after.days) day.sceneIds = day.sceneIds.filter((id) => id !== change.scene_id);
          after.days.find((d) => d.id === change.target_day_id)?.sceneIds.push(change.scene_id);
        } else if (change.kind === "swap_days" && change.day_id_a && change.day_id_b) {
          const a = after.days.find((d) => d.id === change.day_id_a);
          const b = after.days.find((d) => d.id === change.day_id_b);
          if (a && b) [a.sceneIds, b.sceneIds] = [b.sceneIds, a.sceneIds];
        }

        const conflictsBefore = runConflictChecks(before);
        const conflictsAfter = runConflictChecks(after);
        const beforeIds = new Set(conflictsBefore.map((c) => c.id));
        const afterIds = new Set(conflictsAfter.map((c) => c.id));

        let budgetDelta = 0;
        if (change.kind === "budget_line_change" && change.line_id && typeof change.new_amount === "number") {
          const { data: line } = await supabase.from("budget_lines").select("amount").eq("id", change.line_id).single();
          if (line) budgetDelta = change.new_amount - line.amount;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                conflictsBefore: conflictsBefore.length,
                conflictsAfter: conflictsAfter.length,
                newConflicts: conflictsAfter.filter((c) => !beforeIds.has(c.id)),
                resolvedConflicts: conflictsBefore.filter((c) => !afterIds.has(c.id)),
                budgetDelta,
              }),
            },
          ],
        };
      }
    ),
  ];
}
