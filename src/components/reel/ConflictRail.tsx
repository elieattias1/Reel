"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Panel, PanelBody, PanelHeader } from "@/components/reel/Panel";
import type { ScheduleConflict } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export interface ConflictRailProps {
  conflicts: ScheduleConflict[];
  onNavigate?: (conflict: ScheduleConflict) => void;
  className?: string;
}

/**
 * The always-on panel that earns the stripboard's "suggested order, not
 * optimized schedule" label some real trust: whatever's broken in the
 * current schedule, surfaced here rather than discovered on the day.
 */
export function ConflictRail({ conflicts, onNavigate, className }: ConflictRailProps) {
  return (
    <Panel className={cn("flex h-full flex-col", className)}>
      <PanelHeader>
        <h2 className="text-sm font-semibold text-zinc-900">Conflicts</h2>
        {conflicts.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-danger-50 px-2.5 py-1 text-[12px] font-medium text-danger-600">
            {conflicts.length}
          </span>
        )}
      </PanelHeader>
      <div className="flex-1 overflow-y-auto">
        {conflicts.length === 0 ? (
          <PanelBody className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-5 w-5 text-success-500" />
            <p className="text-[13px] text-zinc-500">No known conflicts in this version.</p>
          </PanelBody>
        ) : (
          conflicts.map((conflict) => (
            <div
              key={conflict.id}
              className={cn(
                "border-b border-zinc-100 border-l-2 px-4 py-3 last:border-b-0",
                conflict.severity === "error" ? "border-l-danger-500" : "border-l-warning-500"
              )}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    conflict.severity === "error" ? "text-danger-600" : "text-warning-600"
                  )}
                  strokeWidth={2.25}
                />
                <p className="text-[13px] text-zinc-700">{conflict.message}</p>
              </div>
              {(conflict.scene_id || conflict.schedule_day_id) && (
                <a
                  href={conflict.scene_id ? `#strip-${conflict.scene_id}` : `#day-${conflict.schedule_day_id}`}
                  onClick={() => onNavigate?.(conflict)}
                  className="mt-1.5 inline-block text-[12px] font-medium text-accent-700 hover:text-accent-800"
                >
                  View
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
