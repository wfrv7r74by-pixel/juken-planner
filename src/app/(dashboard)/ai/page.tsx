import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiHub } from "@/components/features/chat/ai-hub";

export const metadata: Metadata = { title: "AI相談 | 合格プランナー" };

export default async function AiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [messagesRes, milestonesRes, phasesRes] = await Promise.all([
    supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at")
      .limit(100),
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

  if (messagesRes.error || milestonesRes.error || phasesRes.error) {
    return (
      <p className="text-sm text-destructive">読み込みに失敗しました。</p>
    );
  }

  return (
    <AiHub
      messages={messagesRes.data}
      milestones={milestonesRes.data}
      phases={phasesRes.data}
    />
  );
}
