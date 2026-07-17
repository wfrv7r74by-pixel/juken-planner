import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MilestoneManager } from "@/components/features/settings/milestone-manager";
import { PhaseManager } from "@/components/features/settings/phase-manager";

export const metadata: Metadata = { title: "計画 | 合格プランナー" };

export default async function PlanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [milestonesRes, phasesRes] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .order("date"),
    supabase
      .from("phases")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date"),
  ]);

  if (milestonesRes.error || phasesRes.error) {
    return (
      <p className="text-sm text-destructive">計画の読み込みに失敗しました。</p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-black">計画</h1>
        <p className="text-sm text-muted-foreground">
          試験日程とフェーズ戦略の管理
        </p>
      </div>

      {/* AI 相談への第一導線 */}
      <Link
        href="/ai"
        className="flex items-center gap-3 rounded-2xl border border-primary/50 bg-primary/10 p-4 transition-colors hover:bg-primary/20"
      >
        <Sparkles className="size-6 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-primary">
            まずは AI と相談して決めるのがおすすめ
          </span>
          <span className="block text-xs text-muted-foreground">
            現状を分析して、フェーズ戦略や模試日程をまとめて提案してくれます
          </span>
        </span>
        <ArrowRight className="size-5 shrink-0 text-primary" />
      </Link>

      <p className="text-xs text-muted-foreground">
        手動で細かく調整したい場合はこちらから:
      </p>
      <MilestoneManager milestones={milestonesRes.data} />
      <PhaseManager phases={phasesRes.data} />
    </div>
  );
}
