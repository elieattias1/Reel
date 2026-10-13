"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface SceneRowData {
  id: string;
  scene_number: number;
  int_ext: string;
  day_night: string;
  synopsis: string | null;
  complexity_flags: string[];
  location_name: string | null;
  characters: string[];
  props: string[];
}

export function SceneRow({ scene }: { scene: SceneRowData }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="border-b border-zinc-100 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
        <span className="w-8 shrink-0 text-[13px] font-semibold text-zinc-400">{scene.scene_number}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">
            {scene.int_ext} — {scene.location_name ?? "Unspecified"}{" "}
            <span className="font-normal text-zinc-400">· {scene.day_night}</span>
          </p>
          {scene.synopsis && <p className="truncate text-[13px] text-zinc-500">{scene.synopsis}</p>}
        </div>
        {scene.complexity_flags.length > 0 && (
          <span className="shrink-0 rounded-full bg-warning-50 px-2.5 py-1 text-[11px] font-medium text-warning-600">
            {scene.complexity_flags.length} flag{scene.complexity_flags.length > 1 ? "s" : ""}
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 px-5 pb-4 pl-[4.25rem] text-[13px]">
          <Field label="Characters" value={scene.characters.join(", ") || "—"} />
          <Field label="Props / requirements" value={scene.props.join(", ") || "—"} />
          {scene.complexity_flags.length > 0 && (
            <Field label="Complexity" value={scene.complexity_flags.join(", ")} />
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-zinc-400">{label}: </span>
      <span className="text-zinc-700">{value}</span>
    </p>
  );
}
