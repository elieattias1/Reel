// Manually runs the blocking agent over every uncovered scene in a
// project — the same thing the upload pipeline now kicks off
// automatically for new scripts, exposed here for projects uploaded
// before that existed. Usage:
//
//   npx tsx scripts/auto-cover-scenes.ts <project-id>
//
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const projectId = process.argv[2];
  if (!projectId) {
    console.error("Usage: npx tsx scripts/auto-cover-scenes.ts <project-id>");
    process.exit(1);
  }

  const { autoCoverProjectScenes } = await import("../src/lib/agents/auto-cover");
  const results = await autoCoverProjectScenes(projectId);

  for (const r of results) {
    console.log(`Scene ${r.sceneNumber}: ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
  }
  const covered = results.filter((r) => r.status === "covered").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`\nDone: ${covered} covered, ${skipped} skipped, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
