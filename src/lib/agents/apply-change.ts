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
    const payload =
      pendingChange.tool_name === "mcp__reel__propose_change_bundle"
        ? { bundle: true, changes: pendingChange.proposed_input.changes }
        : pendingChange.proposed_input;
    await supabase.from("change_log").insert({
      project_id: pendingChange.project_id,
      change_type: pendingChange.tool_name,
      proposed_by: "agent",
      approved_by: userId,
      payload,
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
    case "mcp__reel__propose_budget_change":
    case "mcp__reel__propose_budget_line_change":
      await commitBudgetLineChange(supabase, input);
      break;

    case "mcp__reel__propose_schedule_change":
      // Superseded by propose_move_scene, but a pending row created before
      // this migration may still be sitting unresolved — keep committing it
      // the old way (day_number lookup-or-create) rather than breaking it.
      await commitLegacyScheduleChange(supabase, change.project_id, input);
      break;

    case "mcp__reel__propose_move_scene":
      await commitMoveScene(supabase, input);
      break;

    case "mcp__reel__propose_swap_days":
      await commitSwapDays(supabase, input);
      break;

    case "mcp__reel__propose_lock_scene":
      await commitLockScene(supabase, input);
      break;

    case "mcp__reel__propose_reassign_crew":
      await commitReassignCrew(supabase, input);
      break;

    case "mcp__reel__propose_crew_change":
      await commitCrewChange(supabase, input);
      break;

    case "mcp__reel__propose_change_bundle":
      await commitChangeBundle(supabase, change);
      break;

    default:
      throw new Error(`Unknown pending change tool: ${change.tool_name}`);
  }
}

async function commitBudgetLineChange(supabase: SupabaseClient, input: Record<string, unknown>) {
  const { data: existing } = await supabase
    .from("budget_lines")
    .select("amount, source_type")
    .eq("id", input.budget_line_id ?? input.line_id)
    .single();

  await supabase
    .from("budget_lines")
    .update({
      amount: input.new_amount ?? existing?.amount,
      source_type: "manual_override",
      confidence: "confirmed",
      original_amount: existing?.amount ?? null,
      original_source_type: existing?.source_type ?? null,
    })
    .eq("id", input.budget_line_id ?? input.line_id);
}

async function commitLegacyScheduleChange(supabase: SupabaseClient, projectId: string, input: Record<string, unknown>) {
  const dayNumber = input.target_day_number as number;

  const { data: version } = await supabase
    .from("schedule_versions")
    .select("id")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return;

  let { data: day } = await supabase
    .from("schedule_days")
    .select("id")
    .eq("schedule_version_id", version.id)
    .eq("day_number", dayNumber)
    .maybeSingle();

  if (!day) {
    const { data: created } = await supabase
      .from("schedule_days")
      .insert({ project_id: projectId, schedule_version_id: version.id, day_number: dayNumber })
      .select("id")
      .single();
    day = created;
  }

  await supabase.from("schedule_scenes").delete().eq("scene_id", input.scene_id);
  await supabase.from("schedule_scenes").insert({
    schedule_day_id: day!.id,
    scene_id: input.scene_id,
    position: 0,
    order_in_day: 0,
  });
}

async function commitMoveScene(supabase: SupabaseClient, input: Record<string, unknown>) {
  const sceneId = input.scene_id as string;
  const targetDayId = input.target_day_id as string;
  const position = (input.position as number) ?? 0;

  const { data: existing } = await supabase.from("schedule_scenes").select("locked").eq("scene_id", sceneId).maybeSingle();
  if (existing?.locked) throw new Error("Scene is locked — cannot move.");

  const { data: siblings } = await supabase
    .from("schedule_scenes")
    .select("scene_id, order_in_day")
    .eq("schedule_day_id", targetDayId)
    .neq("scene_id", sceneId)
    .gte("order_in_day", position);

  for (const sibling of siblings ?? []) {
    await supabase.from("schedule_scenes").update({ order_in_day: sibling.order_in_day + 1 }).eq("scene_id", sibling.scene_id);
  }

  await supabase.from("schedule_scenes").delete().eq("scene_id", sceneId);
  await supabase
    .from("schedule_scenes")
    .insert({ schedule_day_id: targetDayId, scene_id: sceneId, position, order_in_day: position, locked: false });
}

async function commitSwapDays(supabase: SupabaseClient, input: Record<string, unknown>) {
  const dayIdA = input.day_id_a as string;
  const dayIdB = input.day_id_b as string;

  const [scenesA, scenesB] = await Promise.all([
    supabase.from("schedule_scenes").select("scene_id, order_in_day, locked").eq("schedule_day_id", dayIdA),
    supabase.from("schedule_scenes").select("scene_id, order_in_day, locked").eq("schedule_day_id", dayIdB),
  ]);

  for (const row of scenesA.data ?? []) {
    if (row.locked) continue;
    await supabase.from("schedule_scenes").update({ schedule_day_id: dayIdB }).eq("scene_id", row.scene_id);
  }
  for (const row of scenesB.data ?? []) {
    if (row.locked) continue;
    await supabase.from("schedule_scenes").update({ schedule_day_id: dayIdA }).eq("scene_id", row.scene_id);
  }
}

async function commitLockScene(supabase: SupabaseClient, input: Record<string, unknown>) {
  await supabase.from("schedule_scenes").update({ locked: input.locked }).eq("scene_id", input.scene_id as string);
}

async function commitReassignCrew(supabase: SupabaseClient, input: Record<string, unknown>) {
  await supabase
    .from("crew_roles")
    .update({
      source: "confirmed",
      person_name: input.person_name,
      contact: input.contact ?? null,
      rate: input.rate ?? null,
      status: "confirmed",
    })
    .eq("id", input.crew_role_id as string);
}

async function commitCrewChange(supabase: SupabaseClient, input: Record<string, unknown>) {
  const table = input.role_table as "cast_roles" | "crew_roles";
  const update: Record<string, unknown> = { status: input.status ?? "confirmed" };
  if (input.person_name !== undefined) {
    update.source = "confirmed";
    update.person_name = input.person_name;
  }
  if (input.contact !== undefined) update.contact = input.contact;
  if (input.rate !== undefined) update.rate = input.rate;

  await supabase.from(table).update(update).eq("id", input.role_id as string);
}

/**
 * supabase-js has no multi-statement transaction primitive, so this runs
 * each sub-change sequentially and reports partial failure rather than
 * silently partial-committing. A single `change_log` row covers the whole
 * bundle, per the spec's "approved/rejected as a unit" requirement — the
 * caller (applyPendingChange) already inserts that row from the bundle's
 * own `proposed_input`, so this function only performs the writes.
 */
async function commitChangeBundle(supabase: SupabaseClient, change: PendingChange) {
  const input = change.proposed_input as Record<string, unknown>;
  const changes = Array.isArray(input.changes) ? (input.changes as { tool_name: string; input: Record<string, unknown> }[]) : [];

  const failures: string[] = [];
  for (const sub of changes) {
    try {
      await commitChange(supabase, {
        ...change,
        tool_name: `mcp__reel__${sub.tool_name}`,
        proposed_input: sub.input,
      });
    } catch (err) {
      failures.push(`${sub.tool_name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Bundle partially committed — ${changes.length - failures.length}/${changes.length} succeeded. Failures: ${failures.join("; ")}`);
  }
}
