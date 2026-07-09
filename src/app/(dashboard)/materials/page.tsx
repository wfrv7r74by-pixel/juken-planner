import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubjectManager } from "@/components/features/materials/subject-manager";
import {
  MaterialManager,
  type MaterialWithProgress,
} from "@/components/features/materials/material-manager";
import { RegenerateButton } from "@/components/features/plan/regenerate-button";

export const metadata: Metadata = { title: "教材 | 合格プランナー" };

export default async function MaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [subjectsRes, materialsRes, doneTasksRes] = await Promise.all([
    supabase
      .from("subjects")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("materials")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase
      .from("study_tasks")
      .select("material_id, planned_units")
      .eq("user_id", user.id)
      .eq("status", "done"),
  ]);

  if (subjectsRes.error || materialsRes.error || doneTasksRes.error) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  const doneByMaterial = new Map<string, number>();
  for (const t of doneTasksRes.data) {
    doneByMaterial.set(
      t.material_id,
      (doneByMaterial.get(t.material_id) ?? 0) + t.planned_units,
    );
  }
  const materials: MaterialWithProgress[] = materialsRes.data.map((m) => ({
    ...m,
    doneUnits: Math.min(doneByMaterial.get(m.id) ?? 0, m.total_units),
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">教材・科目</h1>
        <RegenerateButton variant="outline" />
      </div>
      <SubjectManager subjects={subjectsRes.data} />
      <MaterialManager subjects={subjectsRes.data} materials={materials} />
    </div>
  );
}
