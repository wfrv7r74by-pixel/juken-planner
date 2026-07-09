import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MilestoneManager } from "@/components/features/settings/milestone-manager";
import { PlanSettingsForm } from "@/components/features/settings/plan-settings-form";
import { RegenerateButton } from "@/components/features/plan/regenerate-button";

export const metadata: Metadata = { title: "設定 | 合格プランナー" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [milestonesRes, settingsRes] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .order("date"),
    supabase.from("plan_settings").select("*").eq("user_id", user.id).single(),
  ]);

  if (milestonesRes.error || settingsRes.error || !settingsRes.data) {
    return (
      <p className="text-sm text-destructive">
        設定の読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">設定</h1>
        <RegenerateButton variant="outline" />
      </div>
      <MilestoneManager milestones={milestonesRes.data} />
      <PlanSettingsForm settings={settingsRes.data} />
    </div>
  );
}
