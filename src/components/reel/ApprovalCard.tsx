"use client";

import { Check, GitCompareArrows, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/reel/Button";
import { cn } from "@/lib/utils";

export interface ApprovalCardProps {
  title: string;
  description: string;
  diff?: { label: string; before?: string; after: string }[];
  onApprove: () => void | Promise<void>;
  onReject: () => void | Promise<void>;
  status?: "pending" | "approved" | "rejected";
  className?: string;
}

/**
 * The other place minimalism yields to legibility: a pending write the agent
 * wants to make, never committed until the producer clicks Approve. This is
 * the single most attention-grabbing component in Reel on purpose.
 */
export function ApprovalCard({
  title,
  description,
  diff,
  onApprove,
  onReject,
  status = "pending",
  className,
}: ApprovalCardProps) {
  const [busy, setBusy] = React.useState<"approve" | "reject" | null>(null);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-md)] border-2 p-4",
        status === "pending" && "border-accent-300 bg-accent-50/40",
        status === "approved" && "border-success-500/30 bg-success-50",
        status === "rejected" && "border-zinc-200 bg-zinc-50",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
            status === "pending" && "bg-accent-500 text-white",
            status === "approved" && "bg-success-500 text-white",
            status === "rejected" && "bg-zinc-300 text-zinc-600"
          )}
        >
          <GitCompareArrows className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-900">{title}</p>
          <p className="mt-0.5 text-[13px] text-zinc-600">{description}</p>

          {diff && diff.length > 0 && (
            <dl className="mt-3 space-y-1.5 rounded-[var(--radius-sm)] bg-white/70 p-3 text-[13px]">
              {diff.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-3">
                  <dt className="text-zinc-500">{row.label}</dt>
                  <dd className="flex items-center gap-2 font-medium text-zinc-900">
                    {row.before && <span className="text-zinc-400 line-through">{row.before}</span>}
                    <span>{row.after}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {status === "pending" ? (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="success"
                loading={busy === "approve"}
                onClick={async () => {
                  setBusy("approve");
                  await onApprove();
                  setBusy(null);
                }}
              >
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                loading={busy === "reject"}
                onClick={async () => {
                  setBusy("reject");
                  await onReject();
                  setBusy(null);
                }}
              >
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          ) : (
            <p
              className={cn(
                "mt-3 text-[12px] font-medium",
                status === "approved" ? "text-success-600" : "text-zinc-500"
              )}
            >
              {status === "approved" ? "Approved and committed." : "Rejected — no changes made."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
