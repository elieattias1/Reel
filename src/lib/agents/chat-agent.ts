import { createSdkMcpServer, query, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { buildReadTools, READ_TOOL_NAMES } from "@/lib/agents/chat-tools/read";
import { buildWriteTools, WRITE_TOOL_INFO } from "@/lib/agents/chat-tools/write";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Builds the in-process SDK MCP server exposing this project's data to the
 * Reel chat agent: read tools the model can call freely (chat-tools/read.ts),
 * and write tools that only ever get as far as `canUseTool` (see
 * buildCanUseTool below) — they never actually execute against the database
 * from inside the agent turn. Approval is handled out-of-band by the
 * application once the producer clicks Approve on the resulting
 * ApprovalCard.
 */
export function buildReelMcpServer(projectId: string) {
  return createSdkMcpServer({
    name: "reel",
    version: "0.2.0",
    tools: [...buildReadTools(projectId), ...buildWriteTools()],
  });
}

/**
 * The approval gate. Read tools (pre-allowed via `allowedTools`, so this
 * only runs for the rest) and WebSearch are allowed outright. Every write
 * tool is denied immediately — but denial is paired with creating a
 * `pending_changes` row, so the agent's turn completes (rather than the
 * HTTP request blocking indefinitely on an unresolved promise) while the
 * proposal survives as a Reel ApprovalCard for the producer to resolve
 * later via POST /api/projects/[id]/chat/resolve.
 */
export function buildCanUseTool(projectId: string, chatSessionId: string | null, onPending: (id: string) => void): CanUseTool {
  return async (toolName, input) => {
    if (toolName === "WebSearch" || READ_TOOL_NAMES.includes(toolName)) {
      return { behavior: "allow" };
    }

    const describe = WRITE_TOOL_INFO[toolName];
    if (describe) {
      const supabase = createServiceClient();
      const { title, description } = await describe(input, { supabase, projectId });
      const { data } = await supabase
        .from("pending_changes")
        .insert({
          project_id: projectId,
          chat_session_id: chatSessionId,
          tool_name: toolName,
          title,
          description,
          proposed_input: input,
        })
        .select("id")
        .single();

      if (data?.id) onPending(data.id);

      return {
        behavior: "deny",
        message: `Proposed as a pending change ("${title}") for the producer to review. Do not retry this tool — wait for their decision and move on with the rest of your answer.`,
      };
    }

    return { behavior: "deny", message: `Tool ${toolName} is not permitted in Reel chat.` };
  };
}

export interface ChatTurnResult {
  reply: string;
  sessionId: string | null;
  pendingChangeIds: string[];
}

/**
 * Sends one chat turn to the Reel agent for a project, resuming its
 * persistent session (full prior context) unless `fork` is set, in which
 * case the SDK forks a new session from the resume point to explore a
 * hypothetical without the fork session ID ever being persisted as the
 * project's primary thread.
 */
export async function sendChatMessage(
  projectId: string,
  message: string,
  opts: { resumeSessionId?: string | null; fork?: boolean; chatSessionId?: string | null } = {}
): Promise<ChatTurnResult> {
  const server = buildReelMcpServer(projectId);
  const pendingChangeIds: string[] = [];
  const canUseTool = buildCanUseTool(projectId, opts.chatSessionId ?? null, (id) => pendingChangeIds.push(id));

  let reply = "";
  let sessionId: string | null = null;

  for await (const msg of query({
    prompt: message,
    options: {
      resume: opts.resumeSessionId ?? undefined,
      forkSession: opts.fork ?? false,
      mcpServers: { reel: server },
      allowedTools: ["WebSearch", ...READ_TOOL_NAMES],
      canUseTool,
      model: process.env.REEL_CHAT_MODEL || "claude-sonnet-4-5",
      systemPrompt:
        "You are the Reel chat agent for an independent film producer. You have full read access to this project's script breakdown, budget, schedule (stripboard), Day-Out-of-Days, and cast/crew via your tools. Answer questions precisely and cite the data you pulled. Before using any propose_* tool for a schedule change, call check_conflicts and preview_impact yourself first and reference what you found in your `reason` argument — the producer should see the consequence of a change, not just the raw fields being changed. When one request implies more than one write (e.g. moving a scene and reassigning the crew it now needs), use propose_change_bundle instead of separate propose_* calls, so the producer approves it as one atomic unit. Never claim a change has been made; it has only been proposed until approved.",
    },
  })) {
    const m = msg as { type: string; subtype?: string; message?: { content?: Array<{ type: string; text?: string }> }; session_id?: string; result?: string };

    if (m.type === "assistant" && m.message?.content) {
      for (const block of m.message.content) {
        if (block.type === "text" && block.text) reply += block.text;
      }
    }
    if (m.type === "result" && m.subtype === "success") {
      if (typeof m.result === "string" && !reply) reply = m.result;
    }
    if (m.session_id) sessionId = m.session_id;
  }

  return { reply: reply.trim(), sessionId, pendingChangeIds };
}
