"use client";

import { useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addPhase, deletePhase } from "@/lib/actions/masters";
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
import type { StudyPhase } from "@/types/database";

export function PhaseManager({ phases }: { phases: StudyPhase[] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const onAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await addPhase(formData);
      if (res.error) toast.error(res.error);
      else {
        toast.success("フェーズを追加しました");
        formRef.current?.reset();
      }
    });
  };

  const onDelete = (phase: StudyPhase) => {
    if (!confirm(`フェーズ「${phase.name}」を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deletePhase(phase.id);
      if (res.error) toast.error(res.error);
      else toast.success("削除しました");
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>フェーズ戦略</CardTitle>
        <CardDescription>
          期間ごとの重点戦略。AI相談からまとめて提案してもらうこともできます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <form ref={formRef} action={onAdd} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="phase-name">フェーズ名</Label>
            <Input
              id="phase-name"
              name="name"
              placeholder="英語立て直し+数学発展加速"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phase-start">開始日</Label>
            <Input id="phase-start" name="start_date" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phase-end">終了日</Label>
            <Input id="phase-end" name="end_date" type="date" required />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="phase-memo">狙い(任意)</Label>
            <Input
              id="phase-memo"
              name="memo"
              placeholder="長文毎日2題 / 数学は青チャ例題総ざらい"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              追加する
            </Button>
          </div>
        </form>

        <ul className="divide-y rounded-xl border">
          {phases.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              まだフェーズがありません。
            </li>
          )}
          {phases.map((phase, i) => (
            <li key={phase.id} className="flex items-center gap-3 p-3">
              <span className="font-mono text-xs text-success">
                {"①②③④⑤⑥⑦⑧⑨⑩"[i] ?? i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{phase.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {phase.start_date.replaceAll("-", "/")}〜
                  {phase.end_date.replaceAll("-", "/")}
                </p>
                {phase.memo && (
                  <p className="text-xs text-muted-foreground">{phase.memo}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() => onDelete(phase)}
                aria-label="削除"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
