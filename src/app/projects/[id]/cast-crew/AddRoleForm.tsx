"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/reel/Button";
import { Input } from "@/components/reel/Input";
import { addRole } from "./actions";

export function AddRoleForm({
  table,
  projectId,
  placeholder,
}: {
  table: "cast_roles" | "crew_roles";
  projectId: string;
  placeholder: string;
}) {
  const [adding, setAdding] = React.useState(false);

  if (!adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full items-center gap-1.5 px-5 py-3 text-[13px] font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
      >
        <Plus className="h-3.5 w-3.5" /> {placeholder}
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await addRole(table, projectId, fd);
        setAdding(false);
      }}
      className="flex gap-2 border-t border-zinc-100 bg-zinc-50 px-5 py-3"
    >
      <Input name="title" placeholder={table === "cast_roles" ? "Role name (e.g. Stanley)" : "Crew role (e.g. Gaffer)"} autoFocus required />
      <Button type="submit" size="sm">
        Add
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
        Cancel
      </Button>
    </form>
  );
}
