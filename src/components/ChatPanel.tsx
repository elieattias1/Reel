"use client";

import { GitCompareArrows, Send } from "lucide-react";
import * as React from "react";
import { ApprovalCard } from "@/components/reel/ApprovalCard";
import { Button } from "@/components/reel/Button";
import { ChatBubble } from "@/components/reel/ChatBubble";
import { Textarea } from "@/components/reel/Input";

interface PendingChange {
  id: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  diff?: { label: string; before?: string; after: string }[];
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingChanges?: PendingChange[];
}

export function ChatPanel({ projectId, initialHistory }: { projectId: string; initialHistory: Turn[] }) {
  const [turns, setTurns] = React.useState<Turn[]>(initialHistory);
  const [input, setInput] = React.useState("");
  const [whatIf, setWhatIf] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", content: message };
    setTurns((t) => [...t, userTurn]);

    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, fork: whatIf }),
    });
    const body = await res.json();

    setTurns((t) => [
      ...t,
      {
        id: body.messageId ?? crypto.randomUUID(),
        role: "assistant",
        content: body.reply || "(No reply.)",
        pendingChanges: (body.pendingChanges ?? []).map((p: PendingChange) => ({
          id: p.id,
          title: p.title,
          description: p.description,
          status: p.status,
          diff: p.diff,
        })),
      },
    ]);
    setSending(false);
  }

  async function resolve(turnId: string, changeId: string, decision: "approved" | "rejected") {
    await fetch(`/api/projects/${projectId}/chat/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pending_change_id: changeId, decision }),
    });
    setTurns((t) =>
      t.map((turn) =>
        turn.id !== turnId
          ? turn
          : {
              ...turn,
              pendingChanges: turn.pendingChanges?.map((c) => (c.id === changeId ? { ...c, status: decision } : c)),
            }
      )
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {turns.length === 0 && (
          <p className="text-[13px] text-zinc-400">
            Ask about this project&apos;s budget, schedule, or cast & crew — e.g. &quot;why is the
            camera package $1,500?&quot; or &quot;what happens if I cut the diner scene?&quot;
          </p>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className="space-y-2">
            <ChatBubble role={turn.role}>{turn.content}</ChatBubble>
            {turn.pendingChanges?.map((change) => (
              <div key={change.id} className="pl-8">
                <ApprovalCard
                  title={change.title}
                  description={change.description}
                  diff={change.diff}
                  status={change.status}
                  onApprove={() => resolve(turn.id, change.id, "approved")}
                  onReject={() => resolve(turn.id, change.id, "rejected")}
                />
              </div>
            ))}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-100 p-4">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setWhatIf((w) => !w)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors ${
              whatIf ? "bg-accent-100 text-accent-700" : "bg-zinc-100 text-zinc-500"
            }`}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            What-if mode{whatIf ? " on" : ""}
          </button>
        </div>
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder={whatIf ? "Explore a hypothetical — nothing is applied until you approve." : "Ask Reel…"}
          />
          <Button onClick={send} loading={sending} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
