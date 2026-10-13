import { notFound, redirect } from "next/navigation";
import { TopNav } from "@/components/layout/TopNav";
import { WorkspaceTabs } from "@/components/layout/WorkspaceTabs";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: project } = await supabase.from("projects").select("id, name").eq("id", id).maybeSingle();
  if (!project) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <TopNav email={auth.user.email} title={project.name} />
      <WorkspaceTabs projectId={id} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
