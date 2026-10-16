import type { SupabaseClient } from "@supabase/supabase-js";
import { checkConflicts } from "@/lib/schedule/conflicts";

/**
 * One day's full detail: required cast resolved to actual confirmed people
 * (or flagged "unconfirmed role"), required crew by department resolved
 * against confirmed crew_roles, and this day's own conflicts. Shared by the
 * Day detail panel's API route and the chat agent's get_day tool — same
 * "one function, two callers" treatment as checkConflicts/getDayOutOfDays.
 */
export async function getDayDetail(supabase: SupabaseClient, projectId: string, dayId: string) {
  const { data: day } = await supabase.from("schedule_days").select("*").eq("id", dayId).eq("project_id", projectId).maybeSingle();
  if (!day) return null;

  const { data: scheduleScenes } = await supabase
    .from("schedule_scenes")
    .select("scene_id, order_in_day, locked, scenes(id, scene_number, synopsis, complexity_flags)")
    .eq("schedule_day_id", dayId)
    .order("order_in_day");

  const sceneIds = (scheduleScenes ?? []).map((ss) => ss.scene_id);

  const { data: sceneCharacters } = sceneIds.length
    ? await supabase.from("scene_characters").select("scene_id, character_id").in("scene_id", sceneIds)
    : { data: [] };
  const characterIds = Array.from(new Set((sceneCharacters ?? []).map((sc) => sc.character_id)));

  const { data: castRoles } = characterIds.length
    ? await supabase.from("cast_roles").select("*").in("character_id", characterIds)
    : { data: [] };

  const requiredCast = (castRoles ?? []).map((role) => ({
    cast_role_id: role.id,
    role_name: role.role_name,
    person_name: role.person_name,
    status: role.status,
    unconfirmed: role.status !== "confirmed",
  }));

  const { data: crewRequirements } = sceneIds.length
    ? await supabase.from("scene_crew_requirements").select("*").in("scene_id", sceneIds)
    : { data: [] };

  const { data: crewRoles } = await supabase.from("crew_roles").select("*").eq("project_id", projectId);
  const confirmedByType = new Map<string, { id: string; person_name: string | null }[]>();
  for (const crew of crewRoles ?? []) {
    if (crew.status !== "confirmed") continue;
    const list = confirmedByType.get(crew.role_type) ?? [];
    list.push({ id: crew.id, person_name: crew.person_name });
    confirmedByType.set(crew.role_type, list);
  }

  const requiredCrew = (crewRequirements ?? []).map((req) => ({
    crew_role_type: req.crew_role_type,
    headcount: req.headcount,
    reason: req.reason,
    confirmed: confirmedByType.get(req.crew_role_type) ?? [],
  }));

  const conflicts = await checkConflicts(supabase, projectId, { dayId });

  return {
    day,
    scenes: (scheduleScenes ?? []).map((ss) => ({ scene_id: ss.scene_id, order_in_day: ss.order_in_day, locked: ss.locked, scene: ss.scenes })),
    requiredCast,
    requiredCrew,
    conflicts,
  };
}
