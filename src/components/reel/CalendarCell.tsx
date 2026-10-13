"use client";

import { Clapperboard } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SceneChip {
  id: string;
  scene_number: number;
  location: string;
  int_ext: "INT" | "EXT";
}

export function CalendarCell({
  dayNumber,
  date,
  scenes,
  onDropScene,
  className,
}: {
  dayNumber: number;
  date?: string;
  scenes: SceneChip[];
  onDropScene?: (sceneId: string) => void;
  className?: string;
}) {
  const [over, setOver] = React.useState(false);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const sceneId = e.dataTransfer.getData("text/scene-id");
        if (sceneId) onDropScene?.(sceneId);
      }}
      className={cn(
        "flex min-h-[132px] flex-col gap-1.5 rounded-[var(--radius-sm)] border p-2.5 transition-colors",
        over ? "border-accent-400 bg-accent-50/60" : "border-zinc-200 bg-white",
        className
      )}
    >
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[12px] font-semibold text-zinc-700">Day {dayNumber}</span>
        {date && <span className="text-[11px] text-zinc-400">{date}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {scenes.length === 0 && (
          <span className="mt-2 text-center text-[11px] text-zinc-300">No scenes</span>
        )}
        {scenes.map((s) => (
          <div
            key={s.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/scene-id", s.id)}
            className="flex cursor-grab items-center gap-1.5 rounded-[var(--radius-xs)] bg-zinc-50 px-2 py-1 text-[11px] text-zinc-700 active:cursor-grabbing"
          >
            <Clapperboard className="h-3 w-3 shrink-0 text-zinc-400" />
            <span className="truncate">
              {s.scene_number}. {s.int_ext} — {s.location}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
