import { Film, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { Button } from "@/components/reel/Button";
import { EmptyState } from "@/components/reel/EmptyState";
import { Panel } from "@/components/reel/Panel";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: projects } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-1 flex-col">
      <TopNav email={auth.user.email} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-zinc-900">Projects</h1>
          <Link href="/projects/new">
            <Button size="sm">
              <Plus className="h-4 w-4" /> New project
            </Button>
          </Link>
        </div>

        {!projects || projects.length === 0 ? (
          <EmptyState
            icon={<Film className="h-6 w-6" />}
            title="No projects yet"
            description="Create a project and upload a script to get a breakdown, cast & crew projection, and a sourced first-pass budget within minutes."
            action={
              <Link href="/projects/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> New project
                </Button>
              </Link>
            }
          />
        ) : (
          <Panel className="divide-y divide-zinc-100">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}/script`}
                className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-zinc-50"
              >
                <div>
                  <p className="text-sm font-medium text-zinc-900">{p.name}</p>
                  {p.logline && <p className="mt-0.5 text-[13px] text-zinc-500">{p.logline}</p>}
                </div>
                <span className="text-[12px] text-zinc-400">Updated {formatDate(p.updated_at)}</span>
              </Link>
            ))}
          </Panel>
        )}
      </main>
    </div>
  );
}
