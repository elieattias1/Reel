"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { DayHeader } from "@/components/reel/DayHeader";
import { Panel } from "@/components/reel/Panel";
import { Strip, type StripData } from "@/components/reel/Strip";
import { cn } from "@/lib/utils";
import { DayDetailPanel } from "./DayDetailPanel";

export interface StripboardDay {
  id: string;
  day_number: number;
  shoot_date: string | null;
  general_crew_call_time: string | null;
  general_crew_wrap_time: string | null;
  location_cluster: string | null;
  company_move: boolean;
  estimated_total_eighths: number | null;
  conflictCount: number;
  strips: StripData[];
}

/**
 * The stripboard: a vertical list of day panels, each holding its scenes in
 * shoot order — replaces the old 4-column calendar grid. Drag a strip onto
 * another strip to reorder/move it there; drop it on a day's empty area to
 * send it to the end of that day.
 */
export function StripboardBoard({ projectId, days }: { projectId: string; days: StripboardDay[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [openDayId, setOpenDayId] = React.useState<string | null>(null);
  const [overDayId, setOverDayId] = React.useState<string | null>(null);

  async function moveScene(sceneId: string, targetDayId: string, position: number) {
    setPending(true);
    await fetch(`/api/projects/${projectId}/schedule/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_id: sceneId, target_day_id: targetDayId, position }),
    });
    setPending(false);
    router.refresh();
  }

  async function toggleLock(sceneId: string, locked: boolean) {
    setPending(true);
    await fetch(`/api/projects/${projectId}/schedule/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_id: sceneId, locked }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className={cn("space-y-4", pending && "opacity-60 transition-opacity")}>
      {days.map((day) => (
        <Panel key={day.id} id={`day-${day.id}`} className={overDayId === day.id ? "border-accent-400" : undefined}>
          <DayHeader
            dayNumber={day.day_number}
            shootDate={day.shoot_date}
            callTime={day.general_crew_call_time}
            wrapTime={day.general_crew_wrap_time}
            locationCluster={day.location_cluster}
            companyMove={day.company_move}
            totalEighths={day.estimated_total_eighths}
            conflictCount={day.conflictCount}
            onClick={() => setOpenDayId((id) => (id === day.id ? null : day.id))}
          />
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setOverDayId(day.id);
            }}
            onDragLeave={() => setOverDayId((id) => (id === day.id ? null : id))}
            onDrop={(e) => {
              e.preventDefault();
              setOverDayId(null);
              const sceneId = e.dataTransfer.getData("text/scene-id");
              if (sceneId) moveScene(sceneId, day.id, day.strips.length);
            }}
          >
            {day.strips.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-zinc-300">No scenes</p>
            ) : (
              day.strips.map((strip, i) => (
                <div
                  key={strip.scene_id}
                  id={`strip-${strip.scene_id}`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOverDayId(null);
                    const sceneId = e.dataTransfer.getData("text/scene-id");
                    if (sceneId) moveScene(sceneId, day.id, i);
                  }}
                >
                  <Strip strip={strip} sourceDayId={day.id} onToggleLock={toggleLock} />
                </div>
              ))
            )}
          </div>
          {openDayId === day.id && <DayDetailPanel projectId={projectId} dayId={day.id} />}
        </Panel>
      ))}
    </div>
  );
}
