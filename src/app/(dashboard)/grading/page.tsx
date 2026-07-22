import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GradingPanel } from "@/components/features/grading/grading-panel";

export const metadata: Metadata = { title: "採点 | 合格プランナー" };

export default async function GradingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: history, error } = await supabase
    .from("grading_results")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // grading_results テーブル未作成(migration 0005 未適用)でも採点自体は動くようにする
  if (error) {
    console.error("failed to load grading history:", error.message);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">解答採点</h1>
        <p className="text-sm text-muted-foreground">
          高校範囲を基準に採点。背景の大学範囲や難関大で必要な技能も添えます
        </p>
      </div>
      <GradingPanel history={history ?? []} />
    </div>
  );
}
