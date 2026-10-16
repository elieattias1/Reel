import { tool } from "@anthropic-ai/claude-agent-sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { cloneConflictContext, loadConflictContext, runConflictChecks, type ConflictContext } from "@/lib/schedule/conflicts";

/** Never reached — canUseTool denies every propose_* call before this runs (see buildCanUseTool in ../chat-agent.ts). Kept only so the SDK has a valid handler to register. */
const DEAD_HANDLER = async () => ({ content: [{ type: "text" as const, text: "Proposal recorded; awaiting producer approval." }] });

/**
 * Every write tool the Reel chat agent can propose. None are ever
 * auto-approved — canUseTool denies each one and persists a pending_changes
 * row instead (see WRITE_TOOL_INFO below for how that row's title/
 * description get built, and apply-change.ts for what happens once a
 * producer approves it).
 */
export function buildWriteTools() {
  return [
    tool(
      "propose_move_scene",
      "Propose moving a scene to a different shoot day (and position within it). Never commits directly — the producer must approve the resulting pending-change card. Call check_conflicts/preview_impact first and reference what you found in `reason`.",
      {
        scene_id: z.string(),
        target_day_id: z.string(),
        position: z.number().int(),
        reason: z.string(),
      },
      DEAD_HANDLER
    ),
    tool(
      "propose_swap_days",
      "Propose swapping the scenes assigned to two shoot days. Never commits directly.",
      { day_id_a: z.string(), day_id_b: z.string(), reason: z.string() },
      DEAD_HANDLER
    ),
    tool(
      "propose_lock_scene",
      "Propose locking or unlocking a scene against manual drag and agent-proposed reschedules. Never commits directly.",
      { scene_id: z.string(), locked: z.boolean(), reason: z.string() },
      DEAD_HANDLER
    ),
    tool(
      "propose_reassign_crew",
      "Propose assigning a named person to a required crew role, optionally scoped to a scene or day. Never commits directly.",
      {
        crew_role_id: z.string(),
        person_name: z.string(),
        contact: z.string().optional(),
        rate: z.number().optional(),
        scene_id: z.string().optional(),
        schedule_day_id: z.string().optional(),
        reason: z.string(),
      },
      DEAD_HANDLER
    ),
    tool(
      "propose_budget_line_change",
      "Propose changing the amount (or source) of an existing budget line. Never commits directly.",
      {
        line_id: z.string(),
        new_amount: z.number().optional(),
        new_source: z.string().optional(),
        note: z.string().optional(),
        reason: z.string(),
      },
      DEAD_HANDLER
    ),
    tool(
      "propose_crew_change",
      "Propose confirming a cast or crew role with a named person, contact, rate, and/or status. Supersedes the single-purpose version of this tool — now also covers status-only changes. Never commits directly.",
      {
        role_table: z.enum(["cast_roles", "crew_roles"]),
        role_id: z.string(),
        person_name: z.string().optional(),
        contact: z.string().optional(),
        rate: z.number().optional(),
        status: z.enum(["offered", "confirmed", "declined"]).optional(),
        reason: z.string(),
      },
      DEAD_HANDLER
    ),
    tool(
      "propose_change_bundle",
      "Groups several related writes (e.g. moving a scene plus reassigning the crew role it requires) into one atomic approval the producer sees and approves/rejects as a unit, logged as a single change_log entry covering every affected row. Use this whenever one request implies more than one write.",
      {
        changes: z.array(
          z.object({
            tool_name: z.string().describe("one of the other propose_* tool names, without the mcp__reel__ prefix"),
            input: z.record(z.string(), z.unknown()),
          })
        ),
        summary: z.string(),
        reason: z.string(),
      },
      DEAD_HANDLER
    ),
  ];
}

export interface DescribeCtx {
  supabase: SupabaseClient;
  projectId: string;
}

/**
 * Builds the " → resolves N conflicts, introduces M new conflicts" clause
 * that turns a bare field diff into the reasoned consequence the spec asks
 * for — the same preview_impact simulation logic (lib/schedule/conflicts.ts),
 * called directly rather than through the tool, so the pending_changes row's
 * durable `description` carries it without a second tool round-trip.
 */
async function impactClause(ctx: DescribeCtx, mutate: (after: ConflictContext) => void): Promise<string> {
  const before = await loadConflictContext(ctx.supabase, ctx.projectId, {});
  const after = cloneConflictContext(before);
  mutate(after);

  const { resolved, introduced } = diffConflictCounts(before, after);
  const parts: string[] = [];
  if (resolved) parts.push(`resolves ${resolved} conflict${resolved === 1 ? "" : "s"}`);
  if (introduced) parts.push(`introduces ${introduced} new conflict${introduced === 1 ? "" : "s"}`);
  return parts.length ? ` → ${parts.join(", ")}.` : "";
}

type Describe = (input: Record<string, unknown>, ctx: DescribeCtx) => Promise<{ title: string; description: string }>;

/**
 * Formats each write tool's pending_changes title/description. Async
 * (unlike the single-tool chat-agent.ts predecessor) because several of
 * these call into the shared conflict-simulation logic for the reasoned
 * consequence sentence described above.
 */
export const WRITE_TOOL_INFO: Record<string, Describe> = {
  mcp__reel__propose_move_scene: async (input, ctx) => {
    const impact = await impactClause(ctx, (after) => {
      for (const day of after.days) day.sceneIds = day.sceneIds.filter((id) => id !== input.scene_id);
      after.days.find((d) => d.id === input.target_day_id)?.sceneIds.push(input.scene_id as string);
    });
    return {
      title: "Move a scene to a different day",
      description: `${String(input.reason ?? "The agent proposes moving a scene.")}${impact}`,
    };
  },

  mcp__reel__propose_swap_days: async (input, ctx) => {
    const impact = await impactClause(ctx, (after) => {
      const a = after.days.find((d) => d.id === input.day_id_a);
      const b = after.days.find((d) => d.id === input.day_id_b);
      if (a && b) [a.sceneIds, b.sceneIds] = [b.sceneIds, a.sceneIds];
    });
    return {
      title: "Swap two shoot days",
      description: `${String(input.reason ?? "The agent proposes swapping two days.")}${impact}`,
    };
  },

  mcp__reel__propose_lock_scene: async (input) => ({
    title: input.locked ? "Lock a scene against rescheduling" : "Unlock a scene",
    description: String(input.reason ?? "The agent proposes changing a scene's lock state."),
  }),

  mcp__reel__propose_reassign_crew: async (input) => ({
    title: `Assign ${String(input.person_name ?? "someone")} to a crew role`,
    description: String(input.reason ?? "The agent proposes assigning a named person to a required crew role."),
  }),

  mcp__reel__propose_budget_line_change: async (input, ctx) => {
    let delta = "";
    if (typeof input.new_amount === "number" && input.line_id) {
      const { data: line } = await ctx.supabase.from("budget_lines").select("amount").eq("id", input.line_id).maybeSingle();
      if (line) {
        const diff = (input.new_amount as number) - line.amount;
        delta = ` → ${diff >= 0 ? "+" : ""}$${diff.toFixed(2)}.`;
      }
    }
    return {
      title: `Change a budget line${typeof input.new_amount === "number" ? ` to $${input.new_amount}` : ""}`,
      description: `${String(input.reason ?? "The agent proposes updating a budget line.")}${delta}`,
    };
  },

  mcp__reel__propose_crew_change: async (input) => ({
    title: `Confirm ${input.role_table === "cast_roles" ? "cast" : "crew"} role`,
    description: String(input.reason ?? "The agent proposes confirming a cast/crew role with a named person."),
  }),

  mcp__reel__propose_change_bundle: async (input) => {
    const changes = Array.isArray(input.changes) ? (input.changes as { tool_name: string }[]) : [];
    return {
      title: String(input.summary ?? `Bundle of ${changes.length} related changes`),
      description: String(input.reason ?? "The agent proposes several related changes together, approved or rejected as one."),
    };
  },
};

export interface ApprovalDiffRow {
  label: string;
  before?: string;
  after: string;
}

/**
 * Re-derives a structured `diff` for ApprovalCard, called fresh at
 * chat/route.ts response time rather than stored — `pending_changes.description`
 * (above) stays the durable plain-text record; this is presentation-only
 * enrichment built from the same conflict-simulation logic.
 */
export async function buildApprovalDiff(
  supabase: SupabaseClient,
  projectId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ApprovalDiffRow[]> {
  switch (toolName) {
    case "mcp__reel__propose_move_scene": {
      const before = await loadConflictContext(supabase, projectId, {});
      const currentDay = before.days.find((d) => d.sceneIds.includes(input.scene_id as string));
      const targetDay = before.days.find((d) => d.id === input.target_day_id);
      const after = cloneConflictContext(before);
      for (const day of after.days) day.sceneIds = day.sceneIds.filter((id) => id !== input.scene_id);
      after.days.find((d) => d.id === input.target_day_id)?.sceneIds.push(input.scene_id as string);

      const { resolved, introduced } = diffConflictCounts(before, after);
      const rows: ApprovalDiffRow[] = [
        {
          label: "Day",
          before: currentDay ? `Day ${currentDay.day_number}` : undefined,
          after: targetDay ? `Day ${targetDay.day_number}` : "Unknown day",
        },
      ];
      if (resolved) rows.push({ label: "Conflicts resolved", after: String(resolved) });
      if (introduced) rows.push({ label: "New conflicts", after: String(introduced) });
      return rows;
    }

    case "mcp__reel__propose_swap_days": {
      const before = await loadConflictContext(supabase, projectId, {});
      const a = before.days.find((d) => d.id === input.day_id_a);
      const b = before.days.find((d) => d.id === input.day_id_b);
      const after = cloneConflictContext(before);
      const aAfter = after.days.find((d) => d.id === input.day_id_a);
      const bAfter = after.days.find((d) => d.id === input.day_id_b);
      if (aAfter && bAfter) [aAfter.sceneIds, bAfter.sceneIds] = [bAfter.sceneIds, aAfter.sceneIds];

      const { resolved, introduced } = diffConflictCounts(before, after);
      const rows: ApprovalDiffRow[] = [
        { label: "Days swapped", after: a && b ? `Day ${a.day_number} ↔ Day ${b.day_number}` : "Unknown days" },
      ];
      if (resolved) rows.push({ label: "Conflicts resolved", after: String(resolved) });
      if (introduced) rows.push({ label: "New conflicts", after: String(introduced) });
      return rows;
    }

    case "mcp__reel__propose_lock_scene":
      return [{ label: "Locked", after: input.locked ? "Yes" : "No" }];

    case "mcp__reel__propose_reassign_crew":
      return [{ label: "Assigned to", after: String(input.person_name ?? "") }];

    case "mcp__reel__propose_budget_line_change": {
      const { data: line } = input.line_id
        ? await supabase.from("budget_lines").select("amount").eq("id", input.line_id as string).maybeSingle()
        : { data: null };
      return [
        {
          label: "Amount",
          before: line ? `$${line.amount}` : undefined,
          after: typeof input.new_amount === "number" ? `$${input.new_amount}` : String(input.new_source ?? ""),
        },
      ];
    }

    case "mcp__reel__propose_crew_change":
      return [
        { label: "Status", after: String(input.status ?? "confirmed") },
        ...(input.person_name ? [{ label: "Person", after: String(input.person_name) }] : []),
      ];

    case "mcp__reel__propose_change_bundle": {
      const changes = Array.isArray(input.changes) ? (input.changes as { tool_name: string; input: Record<string, unknown> }[]) : [];
      const rows: ApprovalDiffRow[] = [];
      for (const sub of changes) {
        const subRows = await buildApprovalDiff(supabase, projectId, `mcp__reel__${sub.tool_name}`, sub.input);
        rows.push(...subRows.map((r) => ({ ...r, label: `${sub.tool_name}: ${r.label}` })));
      }
      return rows;
    }

    default:
      return [];
  }
}

function diffConflictCounts(before: ConflictContext, after: ConflictContext): { resolved: number; introduced: number } {
  const conflictsBefore = runConflictChecks(before);
  const conflictsAfter = runConflictChecks(after);
  const beforeIds = new Set(conflictsBefore.map((c) => c.id));
  const afterIds = new Set(conflictsAfter.map((c) => c.id));
  return {
    resolved: conflictsBefore.filter((c) => !afterIds.has(c.id)).length,
    introduced: conflictsAfter.filter((c) => !beforeIds.has(c.id)).length,
  };
}
