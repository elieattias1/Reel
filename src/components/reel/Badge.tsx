import { AlertTriangle, CheckCircle2, Globe, HelpCircle, PenLine, TableProperties } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export type Confidence = "confirmed" | "estimated" | "low_confidence";
export type SourceType = "web_search" | "rate_card" | "manual_override";

const confidenceConfig: Record<Confidence, { label: string; dot: string; text: string; bg: string }> = {
  confirmed: { label: "Confirmed", dot: "bg-success-500", text: "text-success-600", bg: "bg-success-50" },
  estimated: { label: "Estimated", dot: "bg-warning-500", text: "text-warning-600", bg: "bg-warning-50" },
  low_confidence: { label: "Low confidence", dot: "bg-danger-500", text: "text-danger-600", bg: "bg-danger-50" },
};

/**
 * The confidence badge is the one place minimalism yields to legibility: a
 * producer should never miss an unverified number. Small and quiet in form,
 * but unmistakable in color.
 */
export function ConfidenceBadge({ value, className }: { value: Confidence; className?: string }) {
  const c = confidenceConfig[value];
  const Icon = value === "confirmed" ? CheckCircle2 : value === "estimated" ? HelpCircle : AlertTriangle;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium",
        c.bg,
        c.text,
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {c.label}
    </span>
  );
}

const sourceConfig: Record<SourceType, { label: string; icon: React.ElementType }> = {
  web_search: { label: "Web search", icon: Globe },
  rate_card: { label: "Rate card", icon: TableProperties },
  manual_override: { label: "Manual", icon: PenLine },
};

export function SourceBadge({
  value,
  href,
  className,
}: {
  value: SourceType;
  href?: string;
  className?: string;
}) {
  const c = sourceConfig[value];
  const Icon = c.icon;
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-2.5 py-1 text-[12px] font-medium text-zinc-600",
        href && "hover:border-accent-300 hover:text-accent-700",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      {c.label}
    </span>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }
  return content;
}
