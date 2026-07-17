import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatPanel } from "@/components/features/chat/chat-panel";

export const metadata: Metadata = { title: "AI相談 | 合格プランナー" };

export default async function AiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: messages, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at")
    .limit(100);

  if (error) {
    return (
      <p className="text-sm text-destructive">
        チャット履歴の読み込みに失敗しました。
      </p>
    );
  }

  return <ChatPanel messages={messages} />;
}
