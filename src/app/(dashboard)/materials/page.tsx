import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MaterialList } from "@/components/features/materials/material-list";
import { MaterialSearch } from "@/components/features/materials/material-search";

export const metadata: Metadata = { title: "教材 | 合格プランナー" };

export default async function MaterialsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [materialsRes, sectionsRes, subjectsRes] = await Promise.all([
    supabase
      .from("materials")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at"),
    supabase.from("material_sections").select("*").eq("user_id", user.id),
    supabase.from("subjects").select("*").eq("user_id", user.id),
  ]);

  if (materialsRes.error || sectionsRes.error || subjectsRes.error) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">教材</h1>
        <p className="text-sm text-muted-foreground">
          検索して追加すると、教科の分類と章立ては AI が自動で行います
        </p>
      </div>

      <MaterialSearch />

      {materialsRes.data.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            まだ教材がありません。上の検索窓に教材名を入れると、
            Web から目次を調べて教科ごとに整理します。
          </p>
          <p className="text-xs text-muted-foreground">
            どの教材を使うか迷っている場合は{" "}
            <Link href="/ai" className="text-primary underline">
              <Sparkles className="inline size-3.5" /> AI相談
            </Link>{" "}
            でおすすめを聞けます
          </p>
        </div>
      ) : (
        <MaterialList
          materials={materialsRes.data}
          sections={sectionsRes.data}
          subjects={subjectsRes.data}
        />
      )}
    </div>
  );
}
