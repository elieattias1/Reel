"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function confirmRole(
  table: "cast_roles" | "crew_roles",
  id: string,
  projectId: string,
  formData: FormData
) {
  const supabase = await createClient();
  const person_name = String(formData.get("person_name") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim() || null;
  const rateRaw = formData.get("rate");
  const rate = rateRaw ? Number(rateRaw) : null;

  if (!person_name) return;

  await supabase
    .from(table)
    .update({ source: "confirmed", status: "confirmed", person_name, contact, rate })
    .eq("id", id);

  revalidatePath(`/projects/${projectId}/cast-crew`);
}
