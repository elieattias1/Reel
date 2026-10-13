import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("budget_lines")
    .select("category, description, amount, source_type, confidence, source_url")
    .eq("project_id", projectId)
    .order("category");

  const header = ["Category", "Description", "Amount", "Source Type", "Confidence", "Source URL"];
  const rows = (lines ?? []).map((l) => [
    l.category,
    l.description,
    l.amount,
    l.source_type,
    l.confidence,
    l.source_url ?? "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="budget-${projectId}.csv"`,
    },
  });
}
