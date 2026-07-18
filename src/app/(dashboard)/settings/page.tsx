import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleCheck, CircleAlert, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AccountSettings } from "@/components/features/settings/account-settings";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "設定 | 合格プランナー" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const aiConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-heading text-2xl font-semibold">設定</h1>

      <AccountSettings
        email={user.email ?? ""}
        displayName={profile?.display_name ?? ""}
      />

      <Card>
        <CardHeader>
          <CardTitle>AI 利用状況</CardTitle>
          <CardDescription>
            AI相談は Anthropic API(従量課金)を使用します
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            {aiConfigured ? (
              <>
                <CircleCheck className="size-4 text-success" />
                API キー設定済み
              </>
            ) : (
              <>
                <CircleAlert className="size-4 text-milestone" />
                API キー未設定(.env.local に ANTHROPIC_API_KEY を設定)
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            料金目安: 1回の相談で数円〜十数円。クレジット残高の確認・チャージは
            Anthropic Console から行えます。
          </p>
          <a
            href="https://console.anthropic.com/settings/billing"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-primary underline"
          >
            残高の確認・クレジット購入 <ExternalLink className="size-3.5" />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>アプリについて</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>合格プランナー v3 — AI と一緒に作る受験ダッシュボード</p>
          <p>
            試験日程・フェーズの編集は{" "}
            <Link href="/plan" className="text-primary underline">
              計画ページ
            </Link>
            、科目・教材は{" "}
            <Link href="/materials" className="text-primary underline">
              教材ページ
            </Link>{" "}
            から。
          </p>
          <a
            href="https://github.com/wfrv7r74by-pixel/juken-planner"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            GitHub リポジトリ <ExternalLink className="size-3.5" />
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
