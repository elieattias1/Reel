import { NextResponse, type NextRequest } from "next/server";
import { loadOverheadSceneData } from "@/lib/overheads/load-scene";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sceneId: string }> }
) {
  const { id: projectId, sceneId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const data = await loadOverheadSceneData(supabase, projectId, sceneId);
  if (!data) return NextResponse.json({ error: "Scene not found" }, { status: 404 });

  return NextResponse.json(data);
}
