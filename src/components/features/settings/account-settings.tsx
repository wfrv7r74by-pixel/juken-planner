"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateDisplayName } from "@/lib/actions/masters";
import { clearChat } from "@/lib/actions/chat";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountSettings({
  email,
  displayName,
}: {
  email: string;
  displayName: string;
}) {
  const [pending, startTransition] = useTransition();

  const onSave = (formData: FormData) => {
    startTransition(async () => {
      const res = await updateDisplayName(formData);
      if (res.error) toast.error(res.error);
      else toast.success("名前を更新しました");
    });
  };

  const onClearChat = () => {
    if (!confirm("AI相談のチャット履歴をすべて削除しますか?(計画データは消えません)"))
      return;
    startTransition(async () => {
      const res = await clearChat();
      if (res.error) toast.error(res.error);
      else toast.success("チャット履歴を削除しました");
    });
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>アカウント</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>メールアドレス</Label>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
          <form action={onSave} className="space-y-1.5">
            <Label htmlFor="display-name">表示名</Label>
            <div className="flex gap-2">
              <Input
                id="display-name"
                name="display_name"
                defaultValue={displayName}
                maxLength={30}
                required
              />
              <Button type="submit" variant="outline" disabled={pending}>
                保存
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>データ管理</CardTitle>
          <CardDescription>
            計画・記録データは各画面から個別に削除できます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            disabled={pending}
            onClick={onClearChat}
            className="text-destructive"
          >
            <Trash2 className="size-4" /> AI相談の履歴を全削除
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
