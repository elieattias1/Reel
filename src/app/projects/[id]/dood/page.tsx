import { CalendarRange } from "lucide-react";
import { DoodGrid } from "@/components/reel/DoodGrid";
import { EmptyState } from "@/components/reel/EmptyState";
import { getDayOutOfDays } from "@/lib/schedule/dood";
import { createClient } from "@/lib/supabase/server";

export default async function DoodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { days, rows } = await getDayOutOfDays(supabase, projectId);

  if (days.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title="No schedule yet"
          description="Day-Out-of-Days is computed from the shoot schedule — upload a script and assign scenes to days first."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-4 text-sm font-semibold text-zinc-900">Day-Out-of-Days</h1>
      <DoodGrid days={days.map((d) => ({ id: d.id, day_number: d.day_number, shoot_date: d.shoot_date ?? null }))} rows={rows} />
      {rows.length === 0 && (
        <p className="mt-4 text-[12px] text-zinc-400">No confirmed cast yet — DOOD only tracks confirmed roles.</p>
      )}
    </div>
  );
}
