"use client";

import { AlertTriangle, ArrowRightLeft, CalendarDays } from "lucide-react";
import { PanelHeader } from "@/components/reel/Panel";
import { cn } from "@/lib/utils";

export interface DayHeaderProps {
  dayNumber: number;
  shootDate?: string | null;
  callTime?: string | null;
  wrapTime?: string | null;
  locationCluster?: string | null;
  companyMove?: boolean;
  totalEighths?: number | null;
  conflictCount?: number;
  onClick?: () => void;
  className?: string;
}

/** Formats "HH:MM:SS" (Postgres `time`) down to "HH:MM" for display. */
function formatTime(t?: string | null) {
  return t ? t.slice(0, 5) : null;
}

/** A stripboard day header: the data a 1st AD actually checks before shooting — call/wrap, cluster, move flag, eighths, conflicts. */
export function DayHeader({
  dayNumber,
  shootDate,
  callTime,
  wrapTime,
  locationCluster,
  companyMove,
  totalEighths,
  conflictCount = 0,
  onClick,
  className,
}: DayHeaderProps) {
  return (
    <PanelHeader
      role={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("flex-wrap gap-2 bg-zinc-50/60", onClick && "cursor-pointer hover:bg-zinc-50", className)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-zinc-900">Day {dayNumber}</span>
            {shootDate && <span className="text-[12px] text-zinc-500">{shootDate}</span>}
            {(callTime || wrapTime) && (
              <span className="text-[12px] text-zinc-400">
                {formatTime(callTime) ?? "—"}&ndash;{formatTime(wrapTime) ?? "—"}
              </span>
            )}
          </div>
          {locationCluster && <p className="truncate text-[12px] text-zinc-500">{locationCluster}</p>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {companyMove && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-50 px-2.5 py-1 text-[12px] font-medium text-warning-600">
            <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            Company move
          </span>
        )}
        {typeof totalEighths === "number" && (
          <span className="text-[12px] text-zinc-500">{totalEighths.toFixed(1)}/8 pages</span>
        )}
        {conflictCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-danger-50 px-2.5 py-1 text-[12px] font-medium text-danger-600">
            <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2.25} />
            {conflictCount}
          </span>
        )}
      </div>
    </PanelHeader>
  );
}
