"use client";

import { Baby, Car, Clapperboard, Flame, Lock, PawPrint, ShieldAlert, Sparkles, Swords, Unlock, Users, Waves } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface StripData {
  scene_id: string;
  scene_number: number;
  int_ext: "INT" | "EXT" | "INT/EXT";
  day_night: "DAY" | "NIGHT" | "DAWN" | "DUSK" | "UNSPECIFIED";
  location: string;
  synopsis: string | null;
  eighths: number | null;
  castInitials: { id: string; initials: string }[];
  complexityFlags: string[];
  locked: boolean;
  order_in_day: number;
}

const FLAG_CONFIG: Record<string, { icon: React.ElementType; label: string }> = {
  stunts: { icon: ShieldAlert, label: "Stunts" },
  vfx: { icon: Sparkles, label: "VFX" },
  animals: { icon: PawPrint, label: "Animals" },
  minors: { icon: Baby, label: "Minors" },
  fire: { icon: Flame, label: "Fire" },
  water: { icon: Waves, label: "Water" },
  weapons: { icon: Swords, label: "Weapons" },
  vehicles: { icon: Car, label: "Vehicles" },
  crowd: { icon: Users, label: "Crowd" },
  large_cast: { icon: Users, label: "Large cast" },
};

/** INT/EXT • DAY/NIGHT — a neutral classification, not a confidence/status axis, so it gets its own quiet pill rather than reusing StatusIndicator. */
function SceneTypeBadge({ intExt, dayNight }: { intExt: string; dayNight: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[12px] font-medium text-zinc-600">
      {intExt} &bull; {dayNight}
    </span>
  );
}

/**
 * One scene, one row. Draggable to reorder within a day or move to another
 * day — sets the same `"text/scene-id"` dataTransfer key CalendarCell.tsx
 * used, plus `"text/source-day-id"` so the drop handler can tell an in-day
 * reorder from a cross-day move.
 */
export function Strip({
  strip,
  sourceDayId,
  onToggleLock,
  draggable = true,
  className,
}: {
  strip: StripData;
  sourceDayId: string;
  onToggleLock?: (sceneId: string, locked: boolean) => void;
  draggable?: boolean;
  className?: string;
}) {
  const canDrag = draggable && !strip.locked;

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/scene-id", strip.scene_id);
        e.dataTransfer.setData("text/source-day-id", sourceDayId);
      }}
      className={cn(
        "flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-0",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-default",
        className
      )}
    >
      <Clapperboard className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
      <span className="w-8 shrink-0 text-[13px] font-semibold text-zinc-700">{strip.scene_number}</span>
      <SceneTypeBadge intExt={strip.int_ext} dayNight={strip.day_night} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-zinc-900">{strip.location}</p>
        {strip.synopsis && <p className="truncate text-[12px] text-zinc-500">{strip.synopsis}</p>}
      </div>

      {strip.castInitials.length > 0 && (
        <div className="flex shrink-0 items-center -space-x-1.5">
          {strip.castInitials.slice(0, 5).map((c) => (
            <span
              key={c.id}
              className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-zinc-100 text-[10px] font-semibold text-zinc-600"
            >
              {c.initials}
            </span>
          ))}
        </div>
      )}

      {strip.complexityFlags.length > 0 && (
        <div className="flex shrink-0 items-center gap-1">
          {strip.complexityFlags.map((flag) => {
            const config = FLAG_CONFIG[flag];
            if (!config) return null;
            const Icon = config.icon;
            return (
              <span
                key={flag}
                title={config.label}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-warning-50 text-warning-600"
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
              </span>
            );
          })}
        </div>
      )}

      {typeof strip.eighths === "number" && (
        <span className="w-10 shrink-0 text-right text-[12px] text-zinc-400">{strip.eighths}/8</span>
      )}

      <button
        type="button"
        onClick={() => onToggleLock?.(strip.scene_id, !strip.locked)}
        title={strip.locked ? "Locked — click to unlock" : "Click to lock against drag/agent reschedule"}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
          strip.locked ? "bg-accent-50 text-accent-600" : "text-zinc-300 hover:bg-zinc-100 hover:text-zinc-500"
        )}
      >
        {strip.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
