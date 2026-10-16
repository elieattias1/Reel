"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type RoleTable = "cast_roles" | "crew_roles";

/** role_name on cast_roles, role_type on crew_roles — the one column that differs between the two tables. */
function titleColumn(table: RoleTable) {
  return table === "cast_roles" ? "role_name" : "role_type";
}

export async function addRole(table: RoleTable, projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  await supabase.from(table).insert({
    project_id: projectId,
    [titleColumn(table)]: title,
    ...(table === "crew_roles" ? { headcount: 1 } : {}),
    source: "confirmed",
    status: "offered",
  });

  revalidatePath(`/projects/${projectId}/cast-crew`);
}

export async function updateRole(table: RoleTable, id: string, projectId: string, formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const person_name = String(formData.get("person_name") ?? "").trim() || null;
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const rateRaw = formData.get("rate");
  const rate = rateRaw ? Number(rateRaw) : null;

  const patch: Record<string, unknown> = {
    [titleColumn(table)]: title,
    person_name,
    contact,
    rate,
    status: person_name ? "confirmed" : "offered",
  };

  if (table === "crew_roles") {
    const headcountRaw = formData.get("headcount");
    patch.headcount = headcountRaw ? Math.max(1, Number(headcountRaw)) : 1;
  }

  const supabase = await createClient();
  await supabase.from(table).update(patch).eq("id", id);

  revalidatePath(`/projects/${projectId}/cast-crew`);
}

export async function deleteRole(table: RoleTable, id: string, projectId: string) {
  const supabase = await createClient();
  await supabase.from(table).delete().eq("id", id);
  revalidatePath(`/projects/${projectId}/cast-crew`);
}
