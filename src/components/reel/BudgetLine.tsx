"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { ConfidenceBadge, SourceBadge, type Confidence, type SourceType } from "@/components/reel/Badge";
import { cn, formatDate, formatUSD } from "@/lib/utils";

export interface BudgetLineData {
  id: string;
  category: string;
  description: string;
  amount: number;
  source_type: SourceType;
  source_url: string | null;
  source_fetched_at: string | null;
  confidence: Confidence;
}

/** A clean list row, not an Excel grid: generous height, quiet dividers, badges inline. */
export function BudgetLine({ line }: { line: BudgetLineData }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">{line.description}</p>
          <p className="text-[12px] text-zinc-500">{line.category}</p>
        </div>
        <ConfidenceBadge value={line.confidence} className="shrink-0" />
        <span className="w-24 shrink-0 text-right text-sm font-semibold text-zinc-900">
          {formatUSD(line.amount)}
        </span>
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4 pl-12">
          <SourceBadge value={line.source_type} href={line.source_url ?? undefined} />
          {line.source_fetched_at && (
            <span className="text-[12px] text-zinc-400">
              Fetched {formatDate(line.source_fetched_at)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
