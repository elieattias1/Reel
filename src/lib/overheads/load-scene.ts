import type { SupabaseClient } from "@supabase/supabase-js";
import { assignCharacterPalette } from "./characters";
import { rowToSet, rowToShot } from "./db";
import type { Character, Set, Shot } from "./schema";

export interface OverheadSceneSummary {
  id: string;
  number: number;
  locationId: string | null;
  locationName: string | null;
  synopsis: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  shotCount: number;
}

export interface OverheadSceneData {
  scene: OverheadSceneSummary;
  set: Set | null;
  shots: Shot[];
  characters: Character[];
}

/** Every scene in the project, for the sidebar — cheap enough to load in full for an MVP-sized script. */
export async function listOverheadScenes(
  supabase: SupabaseClient,
  projectId: string
): Promise<OverheadSceneSummary[]> {
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number, synopsis, line_start, line_end, primary_location_id, locations:primary_location_id(name)")
    .eq("project_id", projectId)
    .order("scene_number");

  if (!scenes || scenes.length === 0) return [];

  const { data: shotCounts } = await supabase
    .from("shots")
    .select("scene_id")
    .eq("project_id", projectId)
    .in("scene_id", scenes.map((s) => s.id));

  const countBySceneId = new Map<string, number>();
  for (const row of shotCounts ?? []) {
    countBySceneId.set(row.scene_id, (countBySceneId.get(row.scene_id) ?? 0) + 1);
  }

  return scenes.map((s) => ({
    id: s.id,
    number: s.scene_number,
    locationId: s.primary_location_id,
    locationName: (s.locations as unknown as { name: string } | null)?.name ?? null,
    synopsis: s.synopsis,
    lineStart: s.line_start,
    lineEnd: s.line_end,
    shotCount: countBySceneId.get(s.id) ?? 0,
  }));
}

/** One scene's full overhead data: its set (if any), shots in order, and the project's characters (palette-assigned). */
export async function loadOverheadSceneData(
  supabase: SupabaseClient,
  projectId: string,
  sceneId: string
): Promise<OverheadSceneData | null> {
  const { data: sceneRow } = await supabase
    .from("scenes")
    .select("id, scene_number, synopsis, line_start, line_end, primary_location_id, locations:primary_location_id(name)")
    .eq("id", sceneId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!sceneRow) return null;

  const [setResult, shotsResult, charactersResult] = await Promise.all([
    sceneRow.primary_location_id
      ? supabase.from("sets").select("*").eq("project_id", projectId).eq("location_id", sceneRow.primary_location_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("shots").select("*").eq("scene_id", sceneId).order("position"),
    supabase.from("characters").select("id, name").eq("project_id", projectId).order("created_at"),
  ]);

  const set = setResult.data ? rowToSet(setResult.data) : null;
  const shots = (shotsResult.data ?? []).map((row) => rowToShot(row, String(sceneRow.scene_number)));
  const characters = assignCharacterPalette(charactersResult.data ?? []);

  return {
    scene: {
      id: sceneRow.id,
      number: sceneRow.scene_number,
      locationId: sceneRow.primary_location_id,
      locationName: (sceneRow.locations as unknown as { name: string } | null)?.name ?? null,
      synopsis: sceneRow.synopsis,
      lineStart: sceneRow.line_start,
      lineEnd: sceneRow.line_end,
      shotCount: shots.length,
    },
    set,
    shots,
    characters,
  };
}
