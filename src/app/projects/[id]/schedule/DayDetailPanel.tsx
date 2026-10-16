"use client";

import * as React from "react";
import { PanelBody } from "@/components/reel/Panel";
import { cn } from "@/lib/utils";

interface RequiredCast {
  cast_role_id: string;
  role_name: string;
  person_name: string | null;
  unconfirmed: boolean;
}

interface RequiredCrew {
  crew_role_type: string;
  headcount: number;
  reason: string;
  confirmed: { id: string; person_name: string | null }[];
}

interface DayConflict {
  id: string;
  message: string;
  severity: "warning" | "error";
}

interface DayDetailData {
  requiredCast: RequiredCast[];
  requiredCrew: RequiredCrew[];
  conflicts: DayConflict[];
}

/**
 * Inline-expand below the day header when clicked — consistent with
 * BudgetLine's collapsible-row precedent, since no modal exists in the
 * design system. Required cast resolved to actual confirmed people (or
 * flagged "unconfirmed role"), required crew by department, and this
 * day's own conflicts.
 */
export function DayDetailPanel({ projectId, dayId }: { projectId: string; dayId: string }) {
  const [data, setData] = React.useState<DayDetailData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // `loading` starts true and this component is only ever mounted fresh
    // (StripboardBoard conditionally renders it per day), so there's no
    // stale-dayId case to reset for here — avoids a synchronous setState
    // inside the effect body.
    let cancelled = false;
    fetch(`/api/projects/${projectId}/schedule/days/${dayId}`)
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, dayId]);

  if (loading) return <PanelBody className="border-t border-zinc-100 text-[12px] text-zinc-400">Loading day detail&hellip;</PanelBody>;
  if (!data) return null;

  return (
    <PanelBody className="space-y-5 border-t border-zinc-100">
      <section>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">Required cast</h3>
        {data.requiredCast.length === 0 ? (
          <p className="text-[13px] text-zinc-400">No cast required.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.requiredCast.map((c) => (
              <li key={c.cast_role_id} className="flex items-center justify-between text-[13px]">
                <span className="text-zinc-700">{c.role_name}</span>
                {c.unconfirmed ? (
                  <span className="text-[12px] font-medium text-warning-600">Unconfirmed role</span>
                ) : (
                  <span className="font-medium text-zinc-900">{c.person_name}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">Required crew</h3>
        {data.requiredCrew.length === 0 ? (
          <p className="text-[13px] text-zinc-400">No specialized crew required.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.requiredCrew.map((req) => (
              <li key={req.crew_role_type} className="flex items-center justify-between text-[13px]">
                <span className="text-zinc-700">{req.reason}</span>
                <span className={cn("font-medium", req.confirmed.length >= req.headcount ? "text-zinc-900" : "text-danger-600")}>
                  {req.confirmed.length}/{req.headcount} confirmed
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.conflicts.length > 0 && (
        <section>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-zinc-400">Conflicts on this day</h3>
          <ul className="space-y-1.5">
            {data.conflicts.map((c) => (
              <li key={c.id} className={cn("text-[13px]", c.severity === "error" ? "text-danger-600" : "text-warning-600")}>
                {c.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </PanelBody>
  );
}
