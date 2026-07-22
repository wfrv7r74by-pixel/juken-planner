import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GradingHub } from "@/components/features/grading/grading-hub";

export const metadata: Metadata = { title: "採点 | 合格プランナー" };

export default async function GradingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [historyRes, reviewRes] = await Promise.all([
    supabase
      .from("grading_results")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("review_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  // テーブル未作成(migration 未適用)でも画面は表示する
  if (historyRes.error) {
    console.error("failed to load grading history:", historyRes.error.message);
  }
  if (reviewRes.error) {
    console.error("failed to load review items:", reviewRes.error.message);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">解答採点</h1>
        <p className="text-sm text-muted-foreground">
          高校範囲を基準に採点。手書き答案の写真も読み取れます
        </p>
      </div>
      <GradingHub
        userId={user.id}
        history={historyRes.data ?? []}
        reviewItems={reviewRes.data ?? []}
      />
    </div>
  );
}
