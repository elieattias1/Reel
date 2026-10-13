"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

/** Polls the server every few seconds while the breakdown/budgeting pipeline runs. */
export function ProcessingState({ label }: { label: string }) {
  const router = useRouter();

  React.useEffect(() => {
    const interval = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(interval);
  }, [router]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-[var(--radius-md)] border border-dashed border-zinc-200 px-6 py-14 text-center">
      <Loader2 className="h-5 w-5 animate-spin text-accent-500" />
      <p className="text-sm font-medium text-zinc-800">{label}</p>
      <p className="max-w-sm text-sm text-zinc-500">
        This runs for real minutes — extraction, scene breakdown, then live pricing research for
        every budget line. This page updates automatically.
      </p>
    </div>
  );
}
