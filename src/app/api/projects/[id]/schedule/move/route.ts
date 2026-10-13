import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Direct producer edit: drag-and-drop moves a scene to a different day. No approval needed — this isn't an agent proposal. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { scene_id, target_day_number } = await request.json();

  let { data: day } = await supabase
    .from("schedule_days")
    .select("id")
    .eq("project_id", projectId)
    .eq("day_number", target_day_number)
    .maybeSingle();

  if (!day) {
    const { data: created, error } = await supabase
      .from("schedule_days")
      .insert({ project_id: projectId, day_number: target_day_number })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    day = created;
  }

  await supabase.from("schedule_scenes").delete().eq("scene_id", scene_id);
  const { error } = await supabase
    .from("schedule_scenes")
    .insert({ schedule_day_id: day!.id, scene_id, position: 0 });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
