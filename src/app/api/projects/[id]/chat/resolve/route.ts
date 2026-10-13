import { NextResponse, type NextRequest } from "next/server";
import { applyPendingChange } from "@/lib/agents/apply-change";
import { createClient } from "@/lib/supabase/server";
import type { PendingChange } from "@/lib/supabase/types";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { pending_change_id, decision } = await request.json();
  if (decision !== "approved" && decision !== "rejected") {
    return NextResponse.json({ error: "decision must be 'approved' or 'rejected'" }, { status: 400 });
  }

  const { data: pendingChange } = await supabase
    .from("pending_changes")
    .select("*")
    .eq("id", pending_change_id)
    .eq("project_id", projectId)
    .single();

  if (!pendingChange) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (pendingChange.status !== "pending") {
    return NextResponse.json({ error: "Already resolved" }, { status: 409 });
  }

  await applyPendingChange(supabase, pendingChange as PendingChange, decision, auth.user.id);

  return NextResponse.json({ ok: true });
}
