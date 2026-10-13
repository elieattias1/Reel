"use client";

import * as React from "react";
import { StatusIndicator, type RoleSource } from "@/components/reel/StatusIndicator";
import { Button } from "@/components/reel/Button";
import { Input } from "@/components/reel/Input";
import { cn, formatUSD } from "@/lib/utils";
import { confirmRole } from "./actions";

export interface RoleRowData {
  id: string;
  table: "cast_roles" | "crew_roles";
  title: string;
  subtitle?: string;
  headcount?: number;
  source: RoleSource;
  person_name: string | null;
  contact: string | null;
  rate: number | null;
}

export function RoleRow({ role, projectId }: { role: RoleRowData; projectId: string }) {
  const [editing, setEditing] = React.useState(false);

  return (
    <div className={cn("border-b border-zinc-100 px-5 py-3.5 last:border-0", editing && "bg-zinc-50")}>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900">
            {role.title}
            {role.headcount && role.headcount > 1 && (
              <span className="ml-1.5 font-normal text-zinc-400">× {role.headcount}</span>
            )}
          </p>
          {(role.subtitle || role.person_name) && (
            <p className="truncate text-[13px] text-zinc-500">{role.person_name ?? role.subtitle}</p>
          )}
        </div>
        {role.rate != null && (
          <span className="shrink-0 text-[13px] font-medium text-zinc-700">{formatUSD(role.rate)}</span>
        )}
        <StatusIndicator source={role.source} />
        {role.source === "ai_projected" && !editing && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Confirm
          </Button>
        )}
      </div>

      {editing && (
        <form
          action={async (fd) => {
            await confirmRole(role.table, role.id, projectId, fd);
            setEditing(false);
          }}
          className="mt-3 grid grid-cols-3 gap-2"
        >
          <Input name="person_name" placeholder="Name" required />
          <Input name="contact" placeholder="Contact" />
          <div className="flex gap-2">
            <Input name="rate" type="number" placeholder="Rate (USD)" />
            <Button type="submit" size="sm">
              Save
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
