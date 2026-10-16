// One-off backfill for scenes persisted before `scenes.eighths` existed
// (migration 0005_schedule_v2.sql). New uploads get it filled in directly
// by persistBreakdown from line_start/line_end; this script re-derives it
// for existing scenes that already have those line numbers. Run once per
// environment after applying the migration:
//
//   npx tsx scripts/backfill-scene-eighths.ts
//
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
import { computeEighths } from "../src/lib/agents/persist-breakdown";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: scenes, error } = await supabase
    .from("scenes")
    .select("id, line_start, line_end, eighths")
    .is("eighths", null);
  if (error) throw error;

  let updated = 0;
  for (const scene of scenes ?? []) {
    if (scene.line_start === null || scene.line_end === null) continue;
    const eighths = computeEighths({ start: scene.line_start, end: scene.line_end });
    if (eighths === null) continue;
    const { error: updateError } = await supabase
      .from("scenes")
      .update({ eighths, page_count: eighths / 8 })
      .eq("id", scene.id);
    if (updateError) throw updateError;
    updated++;
  }

  console.log(`Backfilled eighths for ${updated} scene(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
