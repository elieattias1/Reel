import { ConflictRail } from "@/components/reel/ConflictRail";
import { checkConflicts } from "@/lib/schedule/conflicts";
import { createClient } from "@/lib/supabase/server";

/** The always-on Conflict rail sits alongside every schedule sub-view (stripboard today). */
export default async function ScheduleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const conflicts = await checkConflicts(supabase, projectId);

  return (
    <div className="mx-auto flex max-w-6xl gap-6 px-6 py-10">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="hidden w-80 shrink-0 lg:sticky lg:top-6 lg:block lg:self-start">
        <ConflictRail conflicts={conflicts} className="max-h-[calc(100vh-8rem)]" />
      </div>
    </div>
  );
}
