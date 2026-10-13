import { FileText } from "lucide-react";
import { ProcessingState } from "@/components/ProcessingState";
import { ScriptUploadForm } from "@/components/ScriptUploadForm";
import { EmptyState } from "@/components/reel/EmptyState";
import { Panel } from "@/components/reel/Panel";
import { createClient } from "@/lib/supabase/server";
import { SceneRow, type SceneRowData } from "./SceneRow";

export default async function ScriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: latestVersion } = await supabase
    .from("script_versions")
    .select("id, breakdown_status, breakdown_error")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestVersion) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ScriptUploadForm projectId={projectId} />
      </div>
    );
  }

  if (latestVersion.breakdown_status === "processing" || latestVersion.breakdown_status === "pending") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <ProcessingState label="Breaking down your script…" />
      </div>
    );
  }

  if (latestVersion.breakdown_status === "failed") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="Breakdown failed"
          description={latestVersion.breakdown_error ?? "Something went wrong. Try uploading again."}
          action={<ScriptUploadForm projectId={projectId} />}
        />
      </div>
    );
  }

  const { data: scenes } = await supabase
    .from("scenes")
    .select(
      "id, scene_number, int_ext, day_night, synopsis, complexity_flags, locations:primary_location_id(name), scene_characters(characters(name)), scene_props(props(name))"
    )
    .eq("script_version_id", latestVersion.id)
    .order("scene_number");

  const rows: SceneRowData[] = (scenes ?? []).map((s) => ({
    id: s.id,
    scene_number: s.scene_number,
    int_ext: s.int_ext,
    day_night: s.day_night,
    synopsis: s.synopsis,
    complexity_flags: s.complexity_flags ?? [],
    location_name: (s.locations as unknown as { name: string } | null)?.name ?? null,
    characters: ((s.scene_characters as unknown as { characters: { name: string } }[]) ?? []).map(
      (sc) => sc.characters.name
    ),
    props: ((s.scene_props as unknown as { props: { name: string } }[]) ?? []).map((sp) => sp.props.name),
  }));

  if (rows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No scenes extracted" description="The breakdown completed but found no scenes." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-sm font-semibold text-zinc-900">{rows.length} scenes</h1>
      </div>
      <Panel>
        {rows.map((scene) => (
          <SceneRow key={scene.id} scene={scene} />
        ))}
      </Panel>
    </div>
  );
}
