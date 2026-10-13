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
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  content: string;
  pendingChanges?: PendingChange[];
}

export interface BlockingAgentPanelProps {
  projectId: string;
  initialHistory: Turn[];
  viewingLabel: string;
  activeSceneId: string;
  activeShotId: string | null;
}

export function BlockingAgentPanel({ projectId, initialHistory, viewingLabel, activeSceneId, activeShotId }: BlockingAgentPanelProps) {
  const [turns, setTurns] = React.useState<Turn[]>(initialHistory);
  const [input, setInput] = React.useState("");
  const [whatIf, setWhatIf] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function send() {
    const message = input.trim();
    if (!message || sending) return;
    setInput("");
    setSending(true);

    const userTurn: Turn = { id: crypto.randomUUID(), role: "user", content: message };
    setTurns((t) => [...t, userTurn]);

    try {
      const res = await fetch(`/api/projects/${projectId}/overheads/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, fork: whatIf, active_scene_id: activeSceneId, active_shot_id: activeShotId }),
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => null);
        throw new Error(errorBody?.error ?? `Request failed (${res.status})`);
      }

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
          })),
        },
      ]);
    } catch (err) {
      setTurns((t) => [
        ...t,
        { id: crypto.randomUUID(), role: "assistant", content: `Something went wrong: ${err instanceof Error ? err.message : String(err)}` },
      ]);
    } finally {
      setSending(false);
    }
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
          : { ...turn, pendingChanges: turn.pendingChanges?.map((c) => (c.id === changeId ? { ...c, status: decision } : c)) }
      )
    );
  }

  return (
    <div className="flex h-full w-[320px] flex-shrink-0 flex-col border-l border-zinc-100">
      <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-zinc-100 px-4">
        <span className="text-[13px] font-semibold">Blocking agent</span>
        <span className="rounded-full bg-accent-50 px-2 py-1 text-[11px] font-semibold text-accent-600">Viewing {viewingLabel}</span>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
        {turns.length === 0 && (
          <p className="text-[13px] text-zinc-400">
            Ask the blocking agent to cover this scene — e.g. &quot;cover this scene&quot; or &quot;make this one an
            85&quot;.
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

      <div className="flex-shrink-0 border-t border-zinc-100 p-3">
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
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            placeholder="Message the blocking agent…"
          />
          <Button onClick={send} loading={sending} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
