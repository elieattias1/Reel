import type { SupabaseClient } from "@supabase/supabase-js";
import type { PendingChange } from "@/lib/supabase/types";

/**
 * Applies (or rejects) a pending change created by the Reel chat agent's
 * canUseTool gate. Runs against the user's own request-scoped Supabase
 * client, so RLS enforces that only a project member can resolve it — no
 * service-role client needed here. On approval, the actual Postgres write
 * happens for the first time right here, and a change_log row records it.
 */
export async function applyPendingChange(
  supabase: SupabaseClient,
  pendingChange: PendingChange,
  decision: "approved" | "rejected",
  userId: string
) {
  if (decision === "approved") {
    await commitChange(supabase, pendingChange);
    await supabase.from("change_log").insert({
      project_id: pendingChange.project_id,
      change_type: pendingChange.tool_name,
      proposed_by: "agent",
      approved_by: userId,
      payload: pendingChange.proposed_input,
    });
  }

  await supabase
    .from("pending_changes")
    .update({ status: decision, resolved_at: new Date().toISOString(), resolved_by: userId })
    .eq("id", pendingChange.id);
}

async function commitChange(supabase: SupabaseClient, change: PendingChange) {
  const input = change.proposed_input as Record<string, unknown>;

  switch (change.tool_name) {
    case "mcp__reel__propose_budget_change": {
      const { data: existing } = await supabase
        .from("budget_lines")
        .select("amount, source_type")
        .eq("id", input.budget_line_id)
        .single();

      await supabase
        .from("budget_lines")
        .update({
          amount: input.new_amount,
          source_type: "manual_override",
          confidence: "confirmed",
          original_amount: existing?.amount ?? null,
          original_source_type: existing?.source_type ?? null,
        })
        .eq("id", input.budget_line_id);
      break;
    }

    case "mcp__reel__propose_schedule_change": {
      const projectId = change.project_id;
      const dayNumber = input.target_day_number as number;

      let { data: day } = await supabase
        .from("schedule_days")
        .select("id")
        .eq("project_id", projectId)
        .eq("day_number", dayNumber)
        .maybeSingle();

      if (!day) {
        const { data: created } = await supabase
          .from("schedule_days")
          .insert({ project_id: projectId, day_number: dayNumber })
          .select("id")
          .single();
        day = created;
      }

      await supabase.from("schedule_scenes").delete().eq("scene_id", input.scene_id);
      await supabase.from("schedule_scenes").insert({
        schedule_day_id: day!.id,
        scene_id: input.scene_id,
        position: 0,
      });
      break;
    }

    case "mcp__reel__propose_crew_change": {
      const table = input.role_table as "cast_roles" | "crew_roles";
      await supabase
        .from(table)
        .update({
          source: "confirmed",
          person_name: input.person_name,
          contact: input.contact ?? null,
          rate: input.rate ?? null,
          status: "confirmed",
        })
        .eq("id", input.role_id);
      break;
    }

    default:
      throw new Error(`Unknown pending change tool: ${change.tool_name}`);
  }
}
