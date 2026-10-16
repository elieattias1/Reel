import { NextResponse, type NextRequest } from "next/server";
import { getDayDetail } from "@/lib/schedule/day-detail";
import { createClient } from "@/lib/supabase/server";

/** Backs the Day detail panel. Same getDayDetail the chat agent's get_day tool calls — no duplicated logic. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; dayId: string }> }) {
  const { id: projectId, dayId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const detail = await getDayDetail(supabase, projectId, dayId);
  if (!detail) return NextResponse.json({ error: "Day not found" }, { status: 404 });

  return NextResponse.json(detail);
}
