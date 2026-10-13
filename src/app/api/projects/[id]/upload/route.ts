import { NextResponse, type NextRequest } from "next/server";
import { runBreakdownAgent } from "@/lib/agents/breakdown";
import { buildBudgetRequests, runBudgetingAgent } from "@/lib/agents/budgeting";
import { persistBreakdown, seedSuggestedSchedule } from "@/lib/agents/persist-breakdown";
import { extractScriptText } from "@/lib/scripts/extract";
import { createClient } from "@/lib/supabase/server";

// This pipeline (text extraction -> breakdown agent -> budgeting agent with
// live WebSearch calls per line) runs for real minutes, not seconds. Run
// Reel on a long-lived Node server rather than a short-timeout serverless
// platform, or move this to a background job before going past MVP.
// (API routes run on the Node runtime by default; no explicit `runtime`
// export here since it's incompatible with Next's Cache Components.)
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const fileType: "pdf" | "fdx" | null = file.name.toLowerCase().endsWith(".pdf")
    ? "pdf"
    : file.name.toLowerCase().endsWith(".fdx")
      ? "fdx"
      : null;
  if (!fileType) {
    return NextResponse.json({ error: "Only .pdf and .fdx files are supported" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `${projectId}/${Date.now()}-${file.name}`;

  const { error: storageError } = await supabase.storage.from("scripts").upload(storagePath, buffer, {
    contentType: fileType === "pdf" ? "application/pdf" : "application/xml",
  });
  if (storageError) {
    return NextResponse.json({ error: `Upload failed: ${storageError.message}` }, { status: 500 });
  }

  const { data: script, error: scriptError } = await supabase
    .from("scripts")
    .insert({ project_id: projectId, filename: file.name, file_type: fileType, storage_path: storagePath })
    .select("id")
    .single();
  if (scriptError || !script) {
    return NextResponse.json({ error: scriptError?.message ?? "Failed to record script" }, { status: 500 });
  }

  const rawText = await extractScriptText(buffer, fileType);

  const { data: scriptVersion, error: versionError } = await supabase
    .from("script_versions")
    .insert({ script_id: script.id, project_id: projectId, raw_text: rawText, breakdown_status: "processing" })
    .select("id")
    .single();
  if (versionError || !scriptVersion) {
    return NextResponse.json({ error: versionError?.message ?? "Failed to record script version" }, { status: 500 });
  }

  try {
    const breakdown = await runBreakdownAgent(rawText);
    const { locationNames, crew, castCount } = await persistBreakdown(
      supabase,
      projectId,
      scriptVersion.id,
      breakdown,
      rawText
    );
    const shootDays = await seedSuggestedSchedule(supabase, projectId);

    const budgetRequests = buildBudgetRequests({
      locations: locationNames,
      crew,
      shootDays: Math.max(shootDays, 1),
      castCount,
    });
    await runBudgetingAgent(projectId, budgetRequests);

    await supabase.from("script_versions").update({ breakdown_status: "complete" }).eq("id", scriptVersion.id);
  } catch (err) {
    console.error("[upload] breakdown/budgeting pipeline failed:", err);
    await supabase
      .from("script_versions")
      .update({ breakdown_status: "failed", breakdown_error: String(err) })
      .eq("id", scriptVersion.id);
    return NextResponse.json({ error: "Breakdown failed", scriptVersionId: scriptVersion.id }, { status: 500 });
  }

  return NextResponse.json({ scriptVersionId: scriptVersion.id });
}
