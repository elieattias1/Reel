import { createSdkMcpServer, query, tool, type CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

const READ_TOOLS = [
  "mcp__reel__get_scenes",
  "mcp__reel__get_budget",
  "mcp__reel__get_schedule",
  "mcp__reel__get_cast_crew",
];

const WRITE_TOOL_INFO: Record<string, (input: Record<string, unknown>) => { title: string; description: string }> = {
  mcp__reel__propose_budget_change: (input) => ({
    title: `Change budget line to $${input.new_amount}`,
    description: String(input.reason ?? "The agent proposes updating a budget line."),
  }),
  mcp__reel__propose_schedule_change: (input) => ({
    title: `Move scene to day ${input.target_day_number}`,
    description: String(input.reason ?? "The agent proposes rescheduling a scene."),
  }),
  mcp__reel__propose_crew_change: (input) => ({
    title: `Confirm ${input.role_table === "cast_roles" ? "cast" : "crew"} role`,
    description: String(input.reason ?? "The agent proposes confirming a cast/crew role with a named person."),
  }),
};

/**
 * Builds the in-process SDK MCP server exposing this project's data to the
 * Reel chat agent: read tools the model can call freely, and write tools
 * that only ever get as far as `canUseTool` (see buildCanUseTool below) —
 * they never actually execute against the database from inside the agent
 * turn. Approval is handled out-of-band by the application once the
 * producer clicks Approve on the resulting ApprovalCard.
 */
export function buildReelMcpServer(projectId: string) {
  const supabase = createServiceClient();

  return createSdkMcpServer({
    name: "reel",
    version: "0.1.0",
    tools: [
      tool(
        "get_scenes",
        "Get every scene in the project's current script breakdown, including int/ext, day/night, location, characters, props, and complexity flags.",
        {},
        async () => {
          const { data } = await supabase
            .from("scenes")
            .select("*, scene_characters(characters(name)), scene_props(props(name)), locations:primary_location_id(name)")
            .eq("project_id", projectId)
            .order("scene_number");
          return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
        }
      ),
      tool(
        "get_budget",
        "Get every budget line for the project: category, description, amount, source, and confidence.",
        {},
        async () => {
          const { data } = await supabase.from("budget_lines").select("*").eq("project_id", projectId);
          return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
        }
      ),
      tool(
        "get_schedule",
        "Get the project's suggested shoot schedule: days and the scenes assigned to each.",
        {},
        async () => {
          const { data } = await supabase
            .from("schedule_days")
            .select("*, schedule_scenes(scene_id, position)")
            .eq("project_id", projectId)
            .order("day_number");
          return { content: [{ type: "text", text: JSON.stringify(data ?? []) }] };
        }
      ),
      tool(
        "get_cast_crew",
        "Get the project's cast and crew roles, both AI-projected and producer-confirmed.",
        {},
        async () => {
          const [cast, crew] = await Promise.all([
            supabase.from("cast_roles").select("*").eq("project_id", projectId),
            supabase.from("crew_roles").select("*").eq("project_id", projectId),
          ]);
          return {
            content: [
              { type: "text", text: JSON.stringify({ cast: cast.data ?? [], crew: crew.data ?? [] }) },
            ],
          };
        }
      ),
      tool(
        "propose_budget_change",
        "Propose changing the amount of an existing budget line. Never commits directly — the producer must approve the resulting pending-change card.",
        {
          budget_line_id: z.string().describe("id of the budget_lines row to change"),
          new_amount: z.number().describe("the proposed new total amount in USD"),
          reason: z.string().describe("one sentence explaining why this change is proposed"),
        },
        async () => ({ content: [{ type: "text", text: "Proposal recorded; awaiting producer approval." }] })
      ),
      tool(
        "propose_schedule_change",
        "Propose moving a scene to a different shoot day. Never commits directly.",
        {
          scene_id: z.string(),
          target_day_number: z.number().int(),
          reason: z.string(),
        },
        async () => ({ content: [{ type: "text", text: "Proposal recorded; awaiting producer approval." }] })
      ),
      tool(
        "propose_crew_change",
        "Propose confirming a cast or crew role with a named person, contact, and rate. Never commits directly.",
        {
          role_table: z.enum(["cast_roles", "crew_roles"]),
          role_id: z.string(),
          person_name: z.string(),
          contact: z.string().optional(),
          rate: z.number().optional(),
          reason: z.string(),
        },
        async () => ({ content: [{ type: "text", text: "Proposal recorded; awaiting producer approval." }] })
      ),
    ],
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
    if (toolName === "WebSearch" || READ_TOOLS.includes(toolName)) {
      return { behavior: "allow" };
    }

    const describe = WRITE_TOOL_INFO[toolName];
    if (describe) {
      const { title, description } = describe(input);
      const supabase = createServiceClient();
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
      allowedTools: ["WebSearch", ...READ_TOOLS],
      canUseTool,
      model: process.env.REEL_CHAT_MODEL || "claude-sonnet-4-5",
      systemPrompt:
        "You are the Reel chat agent for an independent film producer. You have full read access to this project's script breakdown, budget, schedule, and cast/crew via your tools. Answer questions precisely and cite the data you pulled. When the producer's request implies a change to budget, schedule, or cast/crew, use the matching propose_* tool rather than describing the change in prose only — the producer approves or rejects it from a card in the UI. Never claim a change has been made; it has only been proposed until approved.",
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
