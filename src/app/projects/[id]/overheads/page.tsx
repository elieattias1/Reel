import { Camera } from "lucide-react";
import { EmptyState } from "@/components/reel/EmptyState";
import { OverheadWorkspace } from "@/components/overheads/OverheadWorkspace";
import { listOverheadScenes, loadOverheadSceneData } from "@/lib/overheads/load-scene";
import { createClient } from "@/lib/supabase/server";

export default async function OverheadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  const { id: projectId } = await params;
  const { scene: sceneIdParam } = await searchParams;
  const supabase = await createClient();

  const scenes = await listOverheadScenes(supabase, projectId);

  if (scenes.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          icon={<Camera className="h-6 w-6" />}
          title="No scenes yet"
          description="Upload and break down a script on the Script tab before blocking overhead shots."
        />
      </div>
    );
  }

  const initialSceneId = sceneIdParam && scenes.some((s) => s.id === sceneIdParam) ? sceneIdParam : scenes[0].id;
  const initialSceneData = await loadOverheadSceneData(supabase, projectId, initialSceneId);

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, pending_change_ids")
    .eq("project_id", projectId)
    .eq("kind", "blocking")
    .order("created_at");

  const allPendingIds = (messages ?? []).flatMap((m) => m.pending_change_ids ?? []);
  const { data: pendingChanges } =
    allPendingIds.length > 0
      ? await supabase.from("pending_changes").select("id, title, description, status").in("id", allPendingIds)
      : { data: [] as { id: string; title: string; description: string; status: string }[] };

  const byId = new Map((pendingChanges ?? []).map((p) => [p.id, p]));
  const initialChatHistory = (messages ?? []).map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
    pendingChanges: (m.pending_change_ids ?? [])
      .map((id: string) => byId.get(id))
      .filter(Boolean) as { id: string; title: string; description: string; status: "pending" | "approved" | "rejected" }[],
  }));

  return (
    <OverheadWorkspace
      projectId={projectId}
      scenes={scenes}
      initialSceneData={initialSceneData}
      initialChatHistory={initialChatHistory}
    />
  );
}
