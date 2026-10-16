import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInRanges, resolveVersionId } from "@/lib/schedule/conflicts";
import type { DoodCellCode, DoodRow } from "@/lib/supabase/types";

export interface DoodDayInfo {
  id: string;
  day_number: number;
  shoot_date?: string | null;
}

/**
 * Classifies every day from a cast member's first to last worked day
 * (inclusive). Pure and deterministic — the only place the W/H/T/SW/WF
 * derivation rule lives, so the API route and the get_day_out_of_days agent
 * tool can't drift from each other, and so it's unit-testable without
 * Supabase.
 *
 * Decision: a single-day engagement (first worked day is also the last)
 * gets "SW" (start+work), not "WF" — both conventions exist in the
 * industry; this codebase has no prior precedent, so start-priority is
 * documented here rather than left implicit.
 */
export function computeDoodCells(
  sortedDayIds: string[],
  workedDayIds: ReadonlySet<string>,
  travelDayIds: ReadonlySet<string>
): Record<string, DoodCellCode> {
  const workedIndices = sortedDayIds
    .map((id, i) => ({ id, i }))
    .filter((x) => workedDayIds.has(x.id))
    .map((x) => x.i);

  if (workedIndices.length === 0) return {};

  const firstIndex = workedIndices[0];
  const lastIndex = workedIndices[workedIndices.length - 1];
  const cells: Record<string, DoodCellCode> = {};

  for (let i = firstIndex; i <= lastIndex; i++) {
    const dayId = sortedDayIds[i];
    if (workedDayIds.has(dayId)) {
      cells[dayId] = i === firstIndex ? "SW" : i === lastIndex ? "WF" : "W";
    } else if (travelDayIds.has(dayId)) {
      cells[dayId] = "T";
    } else {
      cells[dayId] = "H";
    }
  }

  return cells;
}

export function computeDoodRows(
  days: DoodDayInfo[],
  castList: { cast_role_id: string; person_name: string | null }[],
  workedDaysByCast: Map<string, Set<string>>,
  travelDaysByCast: Map<string, Set<string>>
): DoodRow[] {
  const sortedDayIds = [...days].sort((a, b) => a.day_number - b.day_number).map((d) => d.id);
  return castList.map((cast) => ({
    cast_role_id: cast.cast_role_id,
    person_name: cast.person_name,
    cells: computeDoodCells(sortedDayIds, workedDaysByCast.get(cast.cast_role_id) ?? new Set(), travelDaysByCast.get(cast.cast_role_id) ?? new Set()),
  }));
}

/**
 * Loads the version's days/scenes/cast and derives the full DOOD grid.
 * Shared by the DOOD API route and the get_day_out_of_days agent tool —
 * same "one function, two callers" treatment as lib/schedule/conflicts.ts.
 * Unconfirmed cast roles are excluded: nothing to compute cost against yet.
 */
export async function getDayOutOfDays(
  supabase: SupabaseClient,
  projectId: string,
  scheduleVersionId?: string
): Promise<{ days: DoodDayInfo[]; rows: DoodRow[] }> {
  const versionId = await resolveVersionId(supabase, projectId, scheduleVersionId);
  if (!versionId) return { days: [], rows: [] };

  const { data: dayRows } = await supabase
    .from("schedule_days")
    .select("id, day_number, shoot_date")
    .eq("schedule_version_id", versionId)
    .order("day_number");
  const days: DoodDayInfo[] = dayRows ?? [];
  const dayIds = days.map((d) => d.id);

  const { data: scheduleScenes } = dayIds.length
    ? await supabase.from("schedule_scenes").select("schedule_day_id, scene_id").in("schedule_day_id", dayIds)
    : { data: [] };

  const sceneIds = Array.from(new Set((scheduleScenes ?? []).map((ss) => ss.scene_id)));
  const { data: sceneCharacters } = sceneIds.length
    ? await supabase.from("scene_characters").select("scene_id, character_id").in("scene_id", sceneIds)
    : { data: [] };

  const characterIdsByScene = new Map<string, string[]>();
  for (const sc of sceneCharacters ?? []) {
    const list = characterIdsByScene.get(sc.scene_id) ?? [];
    list.push(sc.character_id);
    characterIdsByScene.set(sc.scene_id, list);
  }

  const { data: castRoles } = await supabase
    .from("cast_roles")
    .select("id, character_id, person_name")
    .eq("project_id", projectId)
    .eq("status", "confirmed");

  const castRoleIdsByCharacter = new Map<string, string[]>();
  for (const role of castRoles ?? []) {
    if (!role.character_id) continue;
    const list = castRoleIdsByCharacter.get(role.character_id) ?? [];
    list.push(role.id);
    castRoleIdsByCharacter.set(role.character_id, list);
  }

  const workedDaysByCast = new Map<string, Set<string>>();
  for (const ss of scheduleScenes ?? []) {
    for (const characterId of characterIdsByScene.get(ss.scene_id) ?? []) {
      for (const castRoleId of castRoleIdsByCharacter.get(characterId) ?? []) {
        const set = workedDaysByCast.get(castRoleId) ?? new Set<string>();
        set.add(ss.schedule_day_id);
        workedDaysByCast.set(castRoleId, set);
      }
    }
  }

  const castRoleIds = (castRoles ?? []).map((r) => r.id);
  const { data: availabilityRows } = castRoleIds.length
    ? await supabase
        .from("availability")
        .select("cast_role_id, reason, unavailable_date_ranges")
        .eq("project_id", projectId)
        .eq("person_type", "cast")
        .in("cast_role_id", castRoleIds)
    : { data: [] };

  // v1 limitation: there's no dedicated travel flag in the data model. A
  // hold day only becomes "T" when the producer has written "travel" into
  // that cast member's availability reason and the day's shoot_date falls
  // inside the matching unavailable_date_ranges entry — otherwise it's "H".
  const travelDaysByCast = new Map<string, Set<string>>();
  for (const row of availabilityRows ?? []) {
    if (!row.cast_role_id || !row.reason || !/travel/i.test(row.reason)) continue;
    const set = travelDaysByCast.get(row.cast_role_id) ?? new Set<string>();
    for (const day of days) {
      if (day.shoot_date && dateInRanges(day.shoot_date, row.unavailable_date_ranges ?? [])) set.add(day.id);
    }
    travelDaysByCast.set(row.cast_role_id, set);
  }

  const castList = (castRoles ?? []).map((r) => ({ cast_role_id: r.id, person_name: r.person_name }));
  const rows = computeDoodRows(days, castList, workedDaysByCast, travelDaysByCast);

  return { days, rows };
}
