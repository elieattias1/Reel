import { NextResponse, type NextRequest } from "next/server";
import { sendChatMessage } from "@/lib/agents/chat-agent";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { message, fork } = await request.json();
  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Missing message" }, { status: 400 });
  }

  // Filtered by kind: migration 0002 gives the blocking agent (lib/agents/blocking.ts)
  // its own session row per project, so project_id alone no longer uniquely
  // identifies a chat_sessions row.
  let { data: chatSession } = await supabase
    .from("chat_sessions")
    .select("id, agent_session_id")
    .eq("project_id", projectId)
    .eq("kind", "chat")
    .maybeSingle();

  if (!chatSession) {
    const { data: created } = await supabase
      .from("chat_sessions")
      .insert({ project_id: projectId, kind: "chat" })
      .select("id, agent_session_id")
      .single();
    chatSession = created!;
  }

  await supabase.from("chat_messages").insert({ project_id: projectId, role: "user", content: message });

  const result = await sendChatMessage(projectId, message, {
    resumeSessionId: chatSession.agent_session_id,
    fork: Boolean(fork),
    chatSessionId: chatSession.id,
  });

  // A forked "what if" exploration never becomes the project's primary
  // thread — only a non-forked turn's session id is persisted.
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
