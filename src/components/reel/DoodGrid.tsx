"use client";

import { Panel } from "@/components/reel/Panel";
import type { DoodCellCode, DoodRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export interface DoodGridProps {
  days: { id: string; day_number: number; shoot_date: string | null }[];
  rows: DoodRow[];
  className?: string;
}

const CELL_STYLE: Record<DoodCellCode, string> = {
  W: "bg-zinc-100 text-zinc-700",
  H: "bg-warning-50 text-warning-600",
  T: "bg-accent-50 text-accent-700",
  SW: "bg-success-50 text-success-600",
  WF: "bg-success-50 text-success-600",
};

/** The report a UPM actually uses to sanity-check cast cost against the schedule — rows are confirmed cast, columns are shoot days. */
export function DoodGrid({ days, rows, className }: DoodGridProps) {
  return (
    <Panel className={cn("overflow-auto", className)}>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="sticky left-0 top-0 z-20 min-w-[160px] border-b border-r border-zinc-100 bg-white px-4 py-2.5 text-left font-medium text-zinc-500">
              Cast
            </th>
            {days.map((day) => (
              <th
                key={day.id}
                className="sticky top-0 z-10 min-w-[64px] border-b border-zinc-100 bg-white px-2 py-2.5 text-center font-medium text-zinc-500"
              >
                <div>Day {day.day_number}</div>
                {day.shoot_date && <div className="text-[11px] font-normal text-zinc-400">{day.shoot_date}</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.cast_role_id}>
              <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-4 py-2 font-medium text-zinc-800">
                {row.person_name ?? "Unnamed"}
              </td>
              {days.map((day) => {
                const code = row.cells[day.id];
                return (
                  <td key={day.id} className="border-b border-zinc-50 px-2 py-2 text-center">
                    {code && (
                      <span className={cn("inline-flex h-6 w-9 items-center justify-center rounded-[var(--radius-xs)] text-[11px] font-semibold", CELL_STYLE[code])}>
                        {code}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
