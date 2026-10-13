import { ChatPanel } from "@/components/ChatPanel";
import { createClient } from "@/lib/supabase/server";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, pending_change_ids")
    .eq("project_id", projectId)
    .order("created_at");

  const allPendingIds = (messages ?? []).flatMap((m) => m.pending_change_ids ?? []);
  const { data: pendingChanges } =
    allPendingIds.length > 0
      ? await supabase.from("pending_changes").select("id, title, description, status").in("id", allPendingIds)
      : { data: [] as { id: string; title: string; description: string; status: string }[] };

  const byId = new Map((pendingChanges ?? []).map((p) => [p.id, p]));

  const history = (messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    pendingChanges: (m.pending_change_ids ?? [])
      .map((id: string) => byId.get(id))
      .filter(Boolean) as { id: string; title: string; description: string; status: "pending" | "approved" | "rejected" }[],
  }));

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col py-0">
      <ChatPanel projectId={projectId} initialHistory={history} />
    </div>
  );
}
