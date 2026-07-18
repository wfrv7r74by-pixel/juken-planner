import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MaterialList } from "@/components/features/materials/material-list";
import { Button } from "@/components/ui/button";

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">教材</h1>
          <p className="text-sm text-muted-foreground">
            章をタップして進捗を更新(未着手→進行中→完了)
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/ai">
            <Sparkles className="size-4" /> AIで追加
          </Link>
        </Button>
      </div>

      {materialsRes.data.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            まだ教材がありません。AI に「〇〇(教材名)を追加して」と話すと、
            ネットで目次を調べて章ごとに分割してくれます。
          </p>
          <Button asChild>
            <Link href="/ai">
              <Sparkles className="size-4" /> AI に教材を追加してもらう
            </Link>
          </Button>
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
