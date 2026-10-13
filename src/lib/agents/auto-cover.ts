import { sendBlockingMessage } from "@/lib/agents/blocking";
import { createServiceClient } from "@/lib/supabase/service";

export interface AutoCoverResult {
  sceneId: string;
  sceneNumber: number;
  status: "covered" | "skipped" | "failed";
  detail?: string;
}

/**
 * Runs the blocking agent once per scene in a project, in scene-number
 * order, so every scene gets a first-pass set of overhead shots without
 * the producer asking for each one by hand. Scenes that already have
 * shots are skipped (idempotent — safe to re-run, e.g. after a partial
 * failure). Runs sequentially, not in parallel: scenes at the same
 * location share a `sets` row (create_set errors if one already exists),
 * and resuming one blocking session across scenes keeps its coverage
 * style consistent rather than starting cold each time.
 *
 * This is real, serial LLM work — multiple tool calls per scene, easily
 * a minute or more each — so callers should treat it as a long-running
 * background job, not something to await inside a request handler.
 */
export async function autoCoverProjectScenes(projectId: string): Promise<AutoCoverResult[]> {
  const supabase = createServiceClient();
  const results: AutoCoverResult[] = [];

  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number")
    .eq("project_id", projectId)
    .order("scene_number");
  if (!scenes || scenes.length === 0) return results;

  const { data: existingShots } = await supabase.from("shots").select("scene_id").eq("project_id", projectId);
  const coveredSceneIds = new Set((existingShots ?? []).map((s) => s.scene_id));

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

  for (const scene of scenes) {
    if (coveredSceneIds.has(scene.id)) {
      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "skipped", detail: "already has shots" });
      continue;
    }

    const message = "Cover this scene.";
    try {
      await supabase.from("chat_messages").insert({ project_id: projectId, role: "user", content: message, kind: "blocking" });

      const result = await sendBlockingMessage(projectId, message, {
        resumeSessionId: chatSession.agent_session_id,
        chatSessionId: chatSession.id,
        activeSceneId: scene.id,
        activeShotId: null,
      });

      if (result.sessionId && result.sessionId !== chatSession.agent_session_id) {
        await supabase.from("chat_sessions").update({ agent_session_id: result.sessionId }).eq("id", chatSession.id);
        chatSession = { ...chatSession, agent_session_id: result.sessionId };
      }

      await supabase.from("chat_messages").insert({
        project_id: projectId,
        role: "assistant",
        content: result.reply || "(No response.)",
        pending_change_ids: result.pendingChangeIds,
        kind: "blocking",
      });

      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "covered" });
    } catch (err) {
      console.error(`[auto-cover] scene ${scene.scene_number} failed:`, err);
      results.push({ sceneId: scene.id, sceneNumber: scene.scene_number, status: "failed", detail: String(err) });
    }
  }

  return results;
}
