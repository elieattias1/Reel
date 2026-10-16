import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Direct producer edit: toggles whether a scene is pinned against drag and agent-proposed reschedules. Ungated, same as move — not an agent proposal. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { scene_id, locked } = await request.json();
  if (!scene_id || typeof locked !== "boolean") {
    return NextResponse.json({ error: "scene_id and locked are required" }, { status: 400 });
  }

  const { data: scene } = await supabase.from("scenes").select("id").eq("id", scene_id).eq("project_id", projectId).maybeSingle();
  if (!scene) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  const { error } = await supabase.from("schedule_scenes").update({ locked }).eq("scene_id", scene_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
