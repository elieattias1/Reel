import { NextResponse, type NextRequest } from "next/server";
import { checkConflicts } from "@/lib/schedule/conflicts";
import { createClient } from "@/lib/supabase/server";

/** Backs both the Conflict rail and the WorkspaceTabs badge count. Same checkConflicts the chat agent's check_conflicts tool calls — no duplicated logic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const versionId = request.nextUrl.searchParams.get("version_id") ?? undefined;
  const dayId = request.nextUrl.searchParams.get("day_id") ?? undefined;

  const conflicts = await checkConflicts(supabase, projectId, { scheduleVersionId: versionId, dayId });
  return NextResponse.json({ conflicts });
}
