import { Users } from "lucide-react";
import { EmptyState } from "@/components/reel/EmptyState";
import { Panel, PanelHeader } from "@/components/reel/Panel";
import { createClient } from "@/lib/supabase/server";
import { RoleRow, type RoleRowData } from "./RoleRow";

export default async function CastCrewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const [cast, crew] = await Promise.all([
    supabase.from("cast_roles").select("*").eq("project_id", projectId).order("role_name"),
    supabase.from("crew_roles").select("*").eq("project_id", projectId).order("role_type"),
  ]);

  const castRows: RoleRowData[] = (cast.data ?? []).map((c) => ({
    id: c.id,
    table: "cast_roles",
    title: c.role_name,
    source: c.source,
    person_name: c.person_name,
    contact: c.contact,
    rate: c.rate,
  }));

  const crewRows: RoleRowData[] = (crew.data ?? []).map((c) => ({
    id: c.id,
    table: "crew_roles",
    title: c.role_type,
    headcount: c.headcount,
    source: c.source,
    person_name: c.person_name,
    contact: c.contact,
    rate: c.rate,
  }));

  if (castRows.length === 0 && crewRows.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No cast or crew yet"
          description="Upload a script on the Script tab to get a projected cast and crew list."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <section>
        <Panel>
          <PanelHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Cast</h2>
          </PanelHeader>
          {castRows.map((r) => (
            <RoleRow key={r.id} role={r} projectId={projectId} />
          ))}
        </Panel>
      </section>
      <section>
        <Panel>
          <PanelHeader>
            <h2 className="text-sm font-semibold text-zinc-900">Crew</h2>
          </PanelHeader>
          {crewRows.map((r) => (
            <RoleRow key={r.id} role={r} projectId={projectId} />
          ))}
        </Panel>
      </section>
    </div>
  );
}
