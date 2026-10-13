import { NextResponse, type NextRequest } from "next/server";
import { sendBlockingMessage } from "@/lib/agents/blocking";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { message, fork, active_scene_id, active_shot_id } = await request.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  let { data: chatSession } = await supabase
    .from("chat_sessions")
    .select("id, agent_session_id")
    .eq("project_id", projectId)
    .eq("kind", "blocking")
    .maybeSingle();

  if (!chatSession) {
    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({ project_id: projectId, kind: "blocking" })
      .select("id, agent_session_id")
      .single();
    chatSession = created!;
  }

  await supabase.from("chat_messages").insert({ project_id: projectId, role: "user", content: message, kind: "blocking" });

  const result = await sendBlockingMessage(projectId, message, {
    resumeSessionId: chatSession.agent_session_id,
    fork: Boolean(fork),
    chatSessionId: chatSession.id,
    activeSceneId: active_scene_id ?? null,
    activeShotId: active_shot_id ?? null,
  });

  if (!fork && result.sessionId && result.sessionId !== chatSession.agent_session_id) {
    await supabase.from("chat_sessions").update({ agent_session_id: result.sessionId }).eq("id", chatSession.id);
  }

  const { data: savedReply } = await supabase
    .from("chat_messages")
    .insert({
      project_id: projectId,
      role: "assistant",
      content: result.reply || "(No response — the agent may have only proposed changes below.)",
      pending_change_ids: result.pendingChangeIds,
      kind: "blocking",
    })
    .select("id")
    .single();

  let pendingChanges: unknown[] = [];
  if (result.pendingChangeIds.length > 0) {
    const { data } = await supabase.from("pending_changes").select("*").in("id", result.pendingChangeIds);
    pendingChanges = data ?? [];
  }

  return NextResponse.json({
    reply: result.reply,
    messageId: savedReply?.id,
    pendingChanges,
  });
}
