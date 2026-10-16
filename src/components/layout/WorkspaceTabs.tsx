"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "script", label: "Script" },
  { href: "cast-crew", label: "Cast & Crew" },
  { href: "budget", label: "Budget" },
  { href: "schedule", label: "Schedule" },
  { href: "dood", label: "Day-Out-of-Days" },
  { href: "overheads", label: "Overhead Shots" },
  { href: "chat", label: "Chat" },
];

export function WorkspaceTabs({
  projectId,
  badgeCounts,
}: {
  projectId: string;
  badgeCounts?: Partial<Record<string, number>>;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 border-b border-zinc-100 px-6">
      {TABS.map((tab) => {
        const href = `/projects/${projectId}/${tab.href}`;
        const active = pathname?.startsWith(href);
        const count = badgeCounts?.[tab.href];
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "relative flex items-center gap-1.5 px-3 py-3 text-[13px] font-medium transition-colors",
              active ? "text-accent-700" : "text-zinc-500 hover:text-zinc-800"
            )}
          >
            {tab.label}
            {!!count && (
              <span className="inline-flex items-center rounded-full bg-danger-50 px-1.5 py-0.5 text-[11px] font-semibold text-danger-600">
                {count}
              </span>
            )}
            {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent-600" />}
          </Link>
        );
      })}
    </nav>
  );
}
