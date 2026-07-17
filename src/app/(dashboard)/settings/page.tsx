import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MilestoneManager } from "@/components/features/settings/milestone-manager";
import { PhaseManager } from "@/components/features/settings/phase-manager";

export const metadata: Metadata = { title: "設定 | 合格プランナー" };

export default async function SettingsPage() {
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
      <p className="text-sm text-destructive">
        設定の読み込みに失敗しました。
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-black">設定</h1>
      <MilestoneManager milestones={milestonesRes.data} />
      <PhaseManager phases={phasesRes.data} />
    </div>
  );
}
