"use client";

import { Pencil, Trash2 } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/reel/Button";
import { Input } from "@/components/reel/Input";
import { cn, formatUSD } from "@/lib/utils";
import { deleteRole, updateRole } from "./actions";

export interface RoleRowData {
  id: string;
  table: "cast_roles" | "crew_roles";
  title: string;
  subtitle?: string;
  headcount?: number;
  person_name: string | null;
  contact: string | null;
  rate: number | null;
}

export function RoleRow({ role, projectId }: { role: RoleRowData; projectId: string }) {
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  if (editing) {
    return (
      <form
        action={async (fd) => {
          await updateRole(role.table, role.id, projectId, fd);
          setEditing(false);
        }}
        className="border-b border-zinc-100 bg-zinc-50 px-5 py-3.5 last:border-0"
      >
        <div className={cn("grid gap-2", role.table === "crew_roles" ? "grid-cols-5" : "grid-cols-4")}>
          <Input name="title" defaultValue={role.title} placeholder="Role" required />
          {role.table === "crew_roles" && (
            <Input name="headcount" type="number" min={1} defaultValue={role.headcount ?? 1} placeholder="Headcount" />
          )}
          <Input name="person_name" defaultValue={role.person_name ?? ""} placeholder="Name" />
          <Input name="contact" defaultValue={role.contact ?? ""} placeholder="Contact" />
          <Input name="rate" type="number" defaultValue={role.rate ?? ""} placeholder="Rate (USD)" />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Save
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex items-center gap-4 border-b border-zinc-100 px-5 py-3.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">
          {role.title}
          {role.headcount && role.headcount > 1 && <span className="ml-1.5 font-normal text-zinc-400">× {role.headcount}</span>}
        </p>
        {(role.subtitle || role.person_name) && <p className="truncate text-[13px] text-zinc-500">{role.person_name ?? role.subtitle}</p>}
      </div>
      {role.rate != null && <span className="shrink-0 text-[13px] font-medium text-zinc-700">{formatUSD(role.rate)}</span>}
      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={deleting}
          onClick={async () => {
            setDeleting(true);
            await deleteRole(role.table, role.id, projectId);
          }}
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5 text-danger-500" />
        </Button>
      </div>
    </div>
  );
}
