import { Sparkles, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type RoleSource = "ai_projected" | "confirmed";

/** Distinguishes an AI-projected role from a confirmed, named person at a glance. */
export function StatusIndicator({ source, className }: { source: RoleSource; className?: string }) {
  const isConfirmed = source === "confirmed";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        isConfirmed ? "bg-accent-50 text-accent-700" : "bg-zinc-100 text-zinc-500",
        className
      )}
    >
      {isConfirmed ? (
        <UserCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
      ) : (
        <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
      )}
      {isConfirmed ? "Confirmed" : "AI projected"}
    </span>
  );
}
