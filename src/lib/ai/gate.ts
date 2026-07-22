// AI 機能の利用可否を判定する単一のチョークポイント。
// すべての AI 呼び出し(相談・提案・教材検索)はここを通す。
//
// 今は全ログインユーザーに許可。将来の公開・課金化(Stripe サブスク等)では、
// この関数の中にサブスク状態や利用回数クォータの判定を足すだけでよく、
// 各 Server Action 側のコードは変更不要。
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AiAccess =
  | { allowed: true }
  | { allowed: false; reason: string };

export async function checkAiAccess(
  _supabase: Supa,
  _userId: string,
): Promise<AiAccess> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      allowed: false,
      reason:
        "AI 機能が未設定です。設定ページから API キーの状態を確認してください。",
    };
  }

  // TODO(公開・課金化時): ここに subscriptions テーブルの確認や
  // 1日あたりの利用回数クォータ判定を追加する。
  // 例:
  //   const { data } = await _supabase.from("subscriptions")
  //     .select("status").eq("user_id", _userId).maybeSingle();
  //   if (data?.status !== "active") {
  //     return { allowed: false, reason: "AI 機能は有料プランでご利用いただけます。" };
  //   }

  return { allowed: true };
}
