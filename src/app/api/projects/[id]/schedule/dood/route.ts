import { NextResponse, type NextRequest } from "next/server";
import { getDayOutOfDays } from "@/lib/schedule/dood";
import { createClient } from "@/lib/supabase/server";

/** Backs the DOOD grid tab. Same getDayOutOfDays the chat agent's get_day_out_of_days tool calls — no duplicated logic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const versionId = request.nextUrl.searchParams.get("version_id") ?? undefined;
  const result = await getDayOutOfDays(supabase, projectId, versionId);
  return NextResponse.json(result);
}
