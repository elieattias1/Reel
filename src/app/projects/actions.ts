"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createProject(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  const logline = String(formData.get("logline") ?? "").trim() || null;
  if (!name) return;

  const { data, error } = await supabase
    .from("projects")
    .insert({ name, logline, owner_id: auth.user!.id })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to create project");

  redirect(`/projects/${data.id}/script`);
}
