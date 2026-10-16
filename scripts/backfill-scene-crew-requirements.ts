// One-off backfill for scenes persisted before `scene_crew_requirements`
// existed (migration 0005_schedule_v2.sql) — the table starts empty for
// every pre-existing project. New uploads get requirements derived
// directly by persistBreakdown; this re-derives them for existing scenes
// from their already-stored complexity_flags. Run once per environment
// after applying the migration:
//
//   npx tsx scripts/backfill-scene-crew-requirements.ts
//
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
import { mapComplexityFlagsToCrewRequirements } from "../src/lib/agents/persist-breakdown";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: scenes, error } = await supabase
    .from("scenes")
    .select("id, project_id, complexity_flags, scene_characters(character_id)");
  if (error) throw error;

  let inserted = 0;
  for (const scene of scenes ?? []) {
    const { data: existing } = await supabase
      .from("scene_crew_requirements")
      .select("id")
      .eq("scene_id", scene.id)
      .limit(1);
    if (existing && existing.length > 0) continue;

    const castCount = Array.isArray(scene.scene_characters) ? scene.scene_characters.length : 0;
    const requirements = mapComplexityFlagsToCrewRequirements(scene.complexity_flags ?? [], castCount);
    if (requirements.length === 0) continue;

    const { error: insertError } = await supabase
      .from("scene_crew_requirements")
      .insert(requirements.map((r) => ({ project_id: scene.project_id, scene_id: scene.id, ...r })));
    if (insertError) throw insertError;
    inserted += requirements.length;
  }

  console.log(`Backfilled ${inserted} scene_crew_requirements row(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
