import type { SupabaseClient } from "@supabase/supabase-js";
import type { BreakdownResult } from "@/lib/agents/breakdown";
import { computeSceneLineRanges, type LineRange } from "@/lib/scripts/line-numbers";
import { locateSceneLinesWithAI } from "@/lib/scripts/locate-scene-lines";

/**
 * Persists a breakdown result: upserts normalized locations/characters/
 * props, inserts scenes with their join rows, and seeds AI-projected
 * cast_roles/crew_roles. Returns the data the budgeting agent and the
 * default schedule need (unique locations, projected crew, counts).
 *
 * `rawText` is the script's extracted text (same string already stored on
 * `script_versions.raw_text`) — passed through so each scene's line_start/
 * line_end can be computed once, here, rather than re-parsed later. Needed
 * by Overhead Shots' coverage validator (lib/overheads/validators.ts),
 * which checks a scene's shots against its actual script line numbers.
 */
export async function persistBreakdown(
  supabase: SupabaseClient,
  projectId: string,
  scriptVersionId: string,
  breakdown: BreakdownResult,
  rawText: string
) {
  const locationNames = Array.from(new Set(breakdown.scenes.map((s) => s.location).filter(Boolean)));
  const characterNames = Array.from(new Set(breakdown.scenes.flatMap((s) => s.characters)));
  const propNames = Array.from(new Set(breakdown.scenes.flatMap((s) => s.props)));

  const locationIdByName = await upsertNamed(supabase, "locations", projectId, locationNames);
  const characterIdByName = await upsertNamed(supabase, "characters", projectId, characterNames);
  const propIdByName = await upsertNamed(supabase, "props", projectId, propNames);

  const lineRanges = await resolveSceneLineRanges(rawText, breakdown.scenes);

  const sceneRows = breakdown.scenes.map((s, i) => {
    const eighths = computeEighths(lineRanges[i]);
    return {
      script_version_id: scriptVersionId,
      project_id: projectId,
      scene_number: s.scene_number,
      int_ext: s.int_ext,
      day_night: s.day_night,
      primary_location_id: locationIdByName.get(s.location) ?? null,
      synopsis: s.synopsis,
      complexity_flags: s.complexity_flags,
      line_start: lineRanges[i]?.start ?? null,
      line_end: lineRanges[i]?.end ?? null,
      eighths,
      page_count: eighths !== null ? eighths / 8 : null,
    };
  });

  const { data: insertedScenes, error: sceneError } = await supabase
    .from("scenes")
    .insert(sceneRows)
    .select("id, scene_number");
  if (sceneError) throw sceneError;

  const sceneIdByNumber = new Map(insertedScenes!.map((s) => [s.scene_number, s.id]));

  const castCountByScene = new Map(breakdown.scenes.map((s) => [s.scene_number, s.characters.length]));
  const crewRequirementRows = breakdown.scenes.flatMap((s) => {
    const sceneId = sceneIdByNumber.get(s.scene_number);
    if (!sceneId) return [];
    return mapComplexityFlagsToCrewRequirements(s.complexity_flags, castCountByScene.get(s.scene_number) ?? 0).map(
      (req) => ({ project_id: projectId, scene_id: sceneId, ...req })
    );
  });
  if (crewRequirementRows.length) await supabase.from("scene_crew_requirements").insert(crewRequirementRows);

  const sceneCharacterRows: { scene_id: string; character_id: string }[] = [];
  const scenePropRows: { scene_id: string; prop_id: string }[] = [];
  const sceneLocationRows: { scene_id: string; location_id: string }[] = [];

  for (const scene of breakdown.scenes) {
    const sceneId = sceneIdByNumber.get(scene.scene_number);
    if (!sceneId) continue;
    for (const c of scene.characters) {
      const cid = characterIdByName.get(c);
      if (cid) sceneCharacterRows.push({ scene_id: sceneId, character_id: cid });
    }
    for (const p of scene.props) {
      const pid = propIdByName.get(p);
      if (pid) scenePropRows.push({ scene_id: sceneId, prop_id: pid });
    }
    const lid = locationIdByName.get(scene.location);
    if (lid) sceneLocationRows.push({ scene_id: sceneId, location_id: lid });
  }

  if (sceneCharacterRows.length) await supabase.from("scene_characters").insert(sceneCharacterRows);
  if (scenePropRows.length) await supabase.from("scene_props").insert(scenePropRows);
  if (sceneLocationRows.length) await supabase.from("scene_locations").insert(sceneLocationRows);

  if (breakdown.projected_cast.length) {
    await supabase.from("cast_roles").insert(
      breakdown.projected_cast.map((c) => ({
        project_id: projectId,
        role_name: c.role_name,
        character_id: characterIdByName.get(c.character_name) ?? null,
        source: "ai_projected" as const,
      }))
    );
  }

  if (breakdown.projected_crew.length) {
    await supabase.from("crew_roles").insert(
      breakdown.projected_crew.map((c) => ({
        project_id: projectId,
        role_type: c.role_type,
        headcount: c.headcount,
        source: "ai_projected" as const,
      }))
    );
  }

  return {
    locationNames,
    sceneIdByNumber,
    crew: breakdown.projected_crew,
    castCount: breakdown.projected_cast.length,
  };
}

/**
 * The regex heading scan (computeSceneLineRanges) is free and works for
 * any normally-formatted screenplay, but finds nothing in source text
 * with no INT./EXT. sluglines at all — a stage play transcript, an OCR'd
 * book, a loosely formatted draft. If it can't find a heading for every
 * scene, fall back to asking Claude to locate them directly.
 */
async function resolveSceneLineRanges(
  rawText: string,
  scenes: { scene_number: number; synopsis: string }[]
): Promise<(LineRange | null)[]> {
  const regexRanges = computeSceneLineRanges(rawText, scenes.length);
  if (regexRanges.every((r) => r !== null)) return regexRanges;

  try {
    const aiRanges = await locateSceneLinesWithAI(rawText, scenes);
    return scenes.map((s) => aiRanges.get(s.scene_number) ?? null);
  } catch (err) {
    console.error("[persist-breakdown] AI line-location fallback failed:", err);
    return regexRanges;
  }
}

/**
 * Industry convention: a script page is 8 eighths; at roughly 55 lines per
 * standard screenplay page, each eighth is ~7 lines. Scenes without a
 * resolved line range (heading-detection failure, not yet backfilled) get
 * null rather than a guessed value.
 */
export function computeEighths(range: LineRange | null): number | null {
  if (!range) return null;
  const lines = range.end - range.start + 1;
  return Math.max(1, Math.round((lines / 55) * 8));
}

/**
 * Maps a scene's complexity_flags (breakdown.ts's closed vocabulary) to the
 * specialized crew a 1st AD would need to confirm before shooting it. Pure
 * and deterministic so the conflict rail's "missing_required_crew" check and
 * the chat agent's get_day tool see the same requirements persist-breakdown
 * derived at upload time — these aren't hand-entered.
 */
export function mapComplexityFlagsToCrewRequirements(
  flags: string[],
  castCount: number
): { crew_role_type: string; headcount: number; reason: string }[] {
  const requirements: { crew_role_type: string; headcount: number; reason: string }[] = [];
  const add = (flag: string, crewRoleType: string, headcount: number, note: string) => {
    if (flags.includes(flag)) {
      requirements.push({ crew_role_type: crewRoleType, headcount, reason: `${note} — scene flagged ${flag}` });
    }
  };

  add("stunts", "stunt_coordinator", 1, "stunt coordinator × 1");
  add("vfx", "vfx_supervisor", 1, "VFX supervisor × 1");
  add("animals", "animal_wrangler", 1, "animal wrangler × 1");
  add("minors", "studio_teacher", 1, "studio teacher × 1 (minor welfare requirement)");
  add("fire", "sfx_supervisor", 1, "SFX supervisor × 1");
  add("water", "safety_diver", 1, "safety diver/water safety × 1");
  add("weapons", "armorer", 1, "armorer × 1");
  add("vehicles", "transportation_captain", 1, "transportation captain × 1");
  if (flags.includes("crowd")) {
    const headcount = Math.max(2, Math.ceil(castCount / 10));
    requirements.push({
      crew_role_type: "additional_pa",
      headcount,
      reason: `additional PAs × ${headcount} — scene flagged crowd`,
    });
  }
  // `large_cast`/`night_exterior` inform other estimates, not a dedicated
  // crew requirement — intentionally no entry for either.

  return requirements;
}

async function upsertNamed(
  supabase: SupabaseClient,
  table: "locations" | "characters" | "props",
  projectId: string,
  names: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (names.length === 0) return map;

  const { data, error } = await supabase
    .from(table)
    .upsert(
      names.map((name) => ({ project_id: projectId, name })),
      { onConflict: "project_id,name", ignoreDuplicates: false }
    )
    .select("id, name");
  if (error) throw error;

  for (const row of data ?? []) map.set(row.name, row.id);
  return map;
}

/**
 * Seeds a simple suggested shoot order: groups scenes by primary location
 * (then int/ext) to minimize company moves, and splits into days of a
 * fixed scene count. This is explicitly a "suggested order," not a
 * constraint-solved schedule.
 */
export async function seedSuggestedSchedule(
  supabase: SupabaseClient,
  projectId: string,
  scenesPerDay = 5
) {
  const { data: scenes } = await supabase
    .from("scenes")
    .select("id, scene_number, int_ext, primary_location_id")
    .eq("project_id", projectId)
    .order("scene_number");
  if (!scenes || scenes.length === 0) return 0;

  const sorted = [...scenes].sort((a, b) => {
    const locA = a.primary_location_id ?? "";
    const locB = b.primary_location_id ?? "";
    if (locA !== locB) return locA.localeCompare(locB);
    if (a.int_ext !== b.int_ext) return a.int_ext.localeCompare(b.int_ext);
    return a.scene_number - b.scene_number;
  });

  const { data: version, error: versionError } = await supabase
    .from("schedule_versions")
    .insert({ project_id: projectId, version_number: 1, note: "Suggested order from upload" })
    .select("id")
    .single();
  if (versionError) throw versionError;

  const dayCount = Math.ceil(sorted.length / scenesPerDay);
  const { data: days, error } = await supabase
    .from("schedule_days")
    .insert(
      Array.from({ length: dayCount }, (_, i) => ({
        project_id: projectId,
        schedule_version_id: version!.id,
        day_number: i + 1,
      }))
    )
    .select("id, day_number")
    .order("day_number");
  if (error) throw error;

  const scheduleRows = sorted.map((scene, i) => {
    const dayIndex = Math.floor(i / scenesPerDay);
    const position = i % scenesPerDay;
    return {
      schedule_day_id: days![dayIndex].id,
      scene_id: scene.id,
      position,
      order_in_day: position,
    };
  });
  await supabase.from("schedule_scenes").insert(scheduleRows);

  return dayCount;
}
