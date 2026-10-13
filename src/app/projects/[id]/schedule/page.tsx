import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/reel/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { ScheduleBoard, type DayData } from "./ScheduleBoard";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: days } = await supabase
    .from("schedule_days")
    .select(
      "day_number, shoot_date, schedule_scenes(scene_id, scenes(id, scene_number, int_ext, locations:primary_location_id(name)))"
    )
    .eq("project_id", projectId)
    .order("day_number");

  if (!days || days.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <EmptyState
          icon={<CalendarDays className="h-6 w-6" />}
          title="No schedule yet"
          description="Upload a script on the Script tab — a suggested shoot order is generated automatically."
        />
      </div>
    );
  }

  const dayData: DayData[] = days.map((d) => ({
    day_number: d.day_number,
    shoot_date: d.shoot_date,
    scenes: ((d.schedule_scenes as unknown as Array<{
      scenes: { id: string; scene_number: number; int_ext: "INT" | "EXT"; locations: { name: string } | null };
    }>) ?? []).map((ss) => ({
      id: ss.scenes.id,
      scene_number: ss.scenes.scene_number,
      int_ext: ss.scenes.int_ext,
      location: ss.scenes.locations?.name ?? "Unspecified",
    })),
  }));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-4 text-sm font-semibold text-zinc-900">Suggested schedule</h1>
      <ScheduleBoard projectId={projectId} days={dayData} />
    </div>
  );
}
