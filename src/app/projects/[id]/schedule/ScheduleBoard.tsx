"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { CalendarCell, type SceneChip } from "@/components/reel/CalendarCell";

export interface DayData {
  day_number: number;
  shoot_date: string | null;
  scenes: SceneChip[];
}

export function ScheduleBoard({ projectId, days }: { projectId: string; days: DayData[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  async function moveScene(sceneId: string, targetDay: number) {
    setPending(true);
    await fetch(`/api/projects/${projectId}/schedule/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scene_id: sceneId, target_day_number: targetDay }),
    });
    setPending(false);
    router.refresh();
  }

  return (
    <div className={pending ? "opacity-60 transition-opacity" : ""}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day) => (
          <CalendarCell
            key={day.day_number}
            dayNumber={day.day_number}
            date={day.shoot_date ?? undefined}
            scenes={day.scenes}
            onDropScene={(sceneId) => moveScene(sceneId, day.day_number)}
          />
        ))}
      </div>
      <p className="mt-4 text-[12px] text-zinc-400">
        Suggested order — grouped by location to minimize moves. Drag scenes between days to
        adjust; this does not solve for cast/crew/location conflicts.
      </p>
    </div>
  );
}
