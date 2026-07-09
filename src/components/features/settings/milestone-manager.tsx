"use client";

import { useRef, useTransition } from "react";
import { Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addMilestone, deleteMilestone } from "@/lib/actions/masters";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Milestone, MilestoneKind } from "@/types/database";

const KIND_LABELS: Record<MilestoneKind, string> = {
  exam: "試験",
  mock: "模試",
  application: "出願",
  other: "その他",
};

export function MilestoneManager({ milestones }: { milestones: Milestone[] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const onAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await addMilestone(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("マイルストーンを追加しました");
        formRef.current?.reset();
      }
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteMilestone(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("削除しました");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>試験日程・マイルストーン</CardTitle>
        <CardDescription>
          「本命」に設定した試験日を基準に逆算プランが作られます
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form ref={formRef} action={onAdd} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ms-title">名称</Label>
            <Input
              id="ms-title"
              name="title"
              placeholder="○○大学 一般入試"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-date">日付</Label>
            <Input id="ms-date" name="date" type="date" required />
          </div>
          <div className="space-y-1.5">
            <Label>区分</Label>
            <Select name="kind" defaultValue="exam">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_target" className="size-4" />
            本命の試験日にする(逆算の基準)
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              追加する
            </Button>
          </div>
        </form>

        <ul className="divide-y rounded-md border">
          {milestones.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">
              まだ登録がありません。まずは本命の試験日を登録しましょう。
            </li>
          )}
          {milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.title}</span>
                  <Badge variant="secondary">{KIND_LABELS[m.kind]}</Badge>
                  {m.is_target && (
                    <Badge className="bg-milestone text-white">
                      <Star className="size-3" /> 本命
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{m.date}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={pending}
                onClick={() => onDelete(m.id)}
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
