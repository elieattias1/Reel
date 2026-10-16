import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/reel/EmptyState";
import { checkConflicts } from "@/lib/schedule/conflicts";
import { createClient } from "@/lib/supabase/server";
import { StripboardBoard, type StripboardDay } from "./StripboardBoard";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || "?";
}

export default async function SchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
}) {
  const { id: projectId } = await params;
  const { version } = await searchParams;
  const supabase = await createClient();

  let versionId = version;
  if (!versionId) {
    const { data: latest } = await supabase
      .from("schedule_versions")
      .select("id")
      .eq("project_id", projectId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionId = latest?.id;
  }

  if (!versionId) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title="No schedule yet"
        description="Upload a script on the Script tab — a suggested shoot order is generated automatically."
      />
    );
  }

  const { data: dayRows } = await supabase
    .from("schedule_days")
    .select(
      "id, day_number, shoot_date, general_crew_call_time, general_crew_wrap_time, location_cluster, company_move, estimated_total_eighths, schedule_scenes(scene_id, order_in_day, locked, scenes(id, scene_number, int_ext, day_night, synopsis, eighths, complexity_flags, locations:primary_location_id(name)))"
    )
    .eq("schedule_version_id", versionId)
    .order("day_number");

  if (!dayRows || dayRows.length === 0) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-6 w-6" />}
        title="No schedule yet"
        description="Upload a script on the Script tab — a suggested shoot order is generated automatically."
      />
    );
  }

  type SceneRow = {
    id: string;
    scene_number: number;
    int_ext: "INT" | "EXT" | "INT/EXT";
    day_night: "DAY" | "NIGHT" | "DAWN" | "DUSK" | "UNSPECIFIED";
    synopsis: string | null;
    eighths: number | null;
    complexity_flags: string[];
    locations: { name: string } | null;
  };
  type ScheduleSceneRow = { scene_id: string; order_in_day: number; locked: boolean; scenes: SceneRow | null };

  const sceneIds = dayRows.flatMap((d) => ((d.schedule_scenes as unknown as ScheduleSceneRow[]) ?? []).map((ss) => ss.scene_id));

  const { data: sceneCharacters } = sceneIds.length
    ? await supabase.from("scene_characters").select("scene_id, character_id").in("scene_id", sceneIds)
    : { data: [] };
  const characterIds = Array.from(new Set((sceneCharacters ?? []).map((sc) => sc.character_id)));

  const { data: castRoles } = characterIds.length
    ? await supabase.from("cast_roles").select("id, character_id, role_name, person_name, status").in("character_id", characterIds)
    : { data: [] };

  const castRolesByCharacter = new Map<string, { id: string; initials: string }[]>();
  for (const role of castRoles ?? []) {
    if (!role.character_id) continue;
    const list = castRolesByCharacter.get(role.character_id) ?? [];
    list.push({ id: role.id, initials: initialsFor(role.person_name ?? role.role_name) });
    castRolesByCharacter.set(role.character_id, list);
  }

  const castByScene = new Map<string, { id: string; initials: string }[]>();
  for (const sc of sceneCharacters ?? []) {
    const roles = castRolesByCharacter.get(sc.character_id) ?? [];
    const list = castByScene.get(sc.scene_id) ?? [];
    list.push(...roles);
    castByScene.set(sc.scene_id, list);
  }

  const conflicts = await checkConflicts(supabase, projectId, { scheduleVersionId: versionId });
  const conflictCountByDay = new Map<string, number>();
  for (const conflict of conflicts) {
    if (!conflict.schedule_day_id) continue;
    conflictCountByDay.set(conflict.schedule_day_id, (conflictCountByDay.get(conflict.schedule_day_id) ?? 0) + 1);
  }

  const days: StripboardDay[] = dayRows.map((d) => ({
    id: d.id,
    day_number: d.day_number,
    shoot_date: d.shoot_date,
    general_crew_call_time: d.general_crew_call_time,
    general_crew_wrap_time: d.general_crew_wrap_time,
    location_cluster: d.location_cluster,
    company_move: d.company_move,
    estimated_total_eighths: d.estimated_total_eighths,
    conflictCount: conflictCountByDay.get(d.id) ?? 0,
    strips: (((d.schedule_scenes as unknown as ScheduleSceneRow[]) ?? [])
      .filter((ss) => ss.scenes)
      .sort((a, b) => a.order_in_day - b.order_in_day)
      .map((ss) => ({
        scene_id: ss.scene_id,
        scene_number: ss.scenes!.scene_number,
        int_ext: ss.scenes!.int_ext,
        day_night: ss.scenes!.day_night,
        location: ss.scenes!.locations?.name ?? "Unspecified",
        synopsis: ss.scenes!.synopsis,
        eighths: ss.scenes!.eighths,
        castInitials: castByScene.get(ss.scene_id) ?? [],
        complexityFlags: ss.scenes!.complexity_flags ?? [],
        locked: ss.locked,
        order_in_day: ss.order_in_day,
      }))),
  }));

  return (
    <div>
      <h1 className="mb-4 text-sm font-semibold text-zinc-900">Stripboard</h1>
      <StripboardBoard projectId={projectId} days={days} />
    </div>
  );
}
