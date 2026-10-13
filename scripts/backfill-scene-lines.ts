// One-off backfill for scenes persisted before `scenes.line_start`/`line_end`
// existed (migration 0002_overhead_shots.sql). New uploads get these columns
// filled in directly by persistBreakdown; this script re-derives them for
// scenes that predate that change, from each scene's own script_versions
// row's raw_text. Run once per environment after applying the migration:
//
//   npx tsx scripts/backfill-scene-lines.ts
//
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
import { computeSceneLineRanges } from "../src/lib/scripts/line-numbers";
import { locateSceneLinesWithAI } from "../src/lib/scripts/locate-scene-lines";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: versions, error } = await supabase
    .from("script_versions")
    .select("id, raw_text");
  if (error) throw error;

  let updated = 0;
  for (const version of versions ?? []) {
    if (!version.raw_text) continue;

    const { data: scenes, error: scenesError } = await supabase
      .from("scenes")
      .select("id, scene_number, synopsis, line_start, line_end")
      .eq("script_version_id", version.id)
      .order("scene_number");
    if (scenesError) throw scenesError;
    if (!scenes || scenes.length === 0) continue;
    if (scenes.every((s) => s.line_start !== null)) continue;

    let ranges = computeSceneLineRanges(version.raw_text, scenes.length);
    if (ranges.some((r) => r === null)) {
      console.log(`  No heading match for every scene in version ${version.id} — falling back to AI line location.`);
      const aiRanges = await locateSceneLinesWithAI(
        version.raw_text,
        scenes.map((s) => ({ scene_number: s.scene_number, synopsis: s.synopsis ?? "" }))
      );
      ranges = scenes.map((s) => aiRanges.get(s.scene_number) ?? null);
    }

    for (let i = 0; i < scenes.length; i++) {
      const range = ranges[i];
      if (!range) continue;
      const { error: updateError } = await supabase
        .from("scenes")
        .update({ line_start: range.start, line_end: range.end })
        .eq("id", scenes[i].id);
      if (updateError) throw updateError;
      updated++;
    }
  }

  console.log(`Backfilled line numbers for ${updated} scene(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
