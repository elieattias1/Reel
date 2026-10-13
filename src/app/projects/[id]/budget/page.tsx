import { DollarSign } from "lucide-react";
import Link from "next/link";
import { BudgetLine, type BudgetLineData } from "@/components/reel/BudgetLine";
import { Button } from "@/components/reel/Button";
import { EmptyState } from "@/components/reel/EmptyState";
import { Panel, PanelHeader } from "@/components/reel/Panel";
import { createClient } from "@/lib/supabase/server";
import { formatUSD } from "@/lib/utils";

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const supabase = await createClient();

  const { data: lines } = await supabase
    .from("budget_lines")
    .select("*")
    .eq("project_id", projectId)
    .order("category");

  if (!lines || lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <EmptyState
          icon={<DollarSign className="h-6 w-6" />}
          title="No budget yet"
          description="Upload a script on the Script tab — a sourced first-pass budget is generated automatically."
        />
      </div>
    );
  }

  const total = lines.reduce((sum, l) => sum + Number(l.amount), 0);
  const byCategory = groupBy(lines as BudgetLineData[], (l) => l.category);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-zinc-900">Total budget</h1>
          <p className="text-2xl font-semibold text-zinc-900">{formatUSD(total)}</p>
        </div>
        <Link href={`/api/projects/${projectId}/export/csv`}>
          <Button variant="outline" size="sm">
            Export CSV
          </Button>
        </Link>
      </div>

      {Object.entries(byCategory).map(([category, categoryLines]) => (
        <Panel key={category}>
          <PanelHeader>
            <h2 className="text-sm font-semibold text-zinc-900">{category}</h2>
            <span className="text-[13px] font-medium text-zinc-500">
              {formatUSD(categoryLines.reduce((sum, l) => sum + Number(l.amount), 0))}
            </span>
          </PanelHeader>
          {categoryLines.map((line) => (
            <BudgetLine key={line.id} line={line} />
          ))}
        </Panel>
      ))}
    </div>
  );
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ??= []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}
