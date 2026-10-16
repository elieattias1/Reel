import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Direct producer edit: drag-and-drop reorders a scene within a day or
 * moves it to a different day. No approval needed — this isn't an agent
 * proposal (only chat-agent-initiated writes go through pending_changes).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { scene_id, target_day_id, position } = await request.json();
  if (!scene_id || !target_day_id || typeof position !== "number") {
    return NextResponse.json({ error: "scene_id, target_day_id, and position are required" }, { status: 400 });
  }

  const { data: targetDay } = await supabase
    .from("schedule_days")
    .select("id")
    .eq("id", target_day_id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!targetDay) return NextResponse.json({ error: "Target day not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("schedule_scenes")
    .select("locked")
    .eq("scene_id", scene_id)
    .maybeSingle();
  if (existing?.locked) {
    return NextResponse.json({ error: "This scene is locked and can't be moved." }, { status: 400 });
  }

  // Shift scenes already in the target day at/after the drop position to
  // make room — the move route has no real transaction primitive, so this
  // is best-effort sequential, matching the rest of this route.
  const { data: siblings } = await supabase
    .from("schedule_scenes")
    .select("scene_id, order_in_day")
    .eq("schedule_day_id", target_day_id)
    .neq("scene_id", scene_id)
    .gte("order_in_day", position)
    .order("order_in_day", { ascending: false });

  for (const sibling of siblings ?? []) {
    await supabase
      .from("schedule_scenes")
      .update({ order_in_day: sibling.order_in_day + 1 })
      .eq("scene_id", sibling.scene_id);
  }

  await supabase.from("schedule_scenes").delete().eq("scene_id", scene_id);
  const { error } = await supabase
    .from("schedule_scenes")
    .insert({ schedule_day_id: target_day_id, scene_id, position, order_in_day: position, locked: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
