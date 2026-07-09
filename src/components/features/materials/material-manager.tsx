"use client";

import { useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addMaterial, deleteMaterial } from "@/lib/actions/masters";
import { PHASE_LABELS } from "@/lib/plan/engine";
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
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Material, Phase, Subject } from "@/types/database";

const PHASE_BADGE_CLASS: Record<Phase, string> = {
  basic: "bg-phase-basic text-white",
  advance: "bg-phase-advance text-white",
  final: "bg-phase-final text-white",
};

export interface MaterialWithProgress extends Material {
  doneUnits: number;
}

export function MaterialManager({
  subjects,
  materials,
}: {
  subjects: Subject[];
  materials: MaterialWithProgress[];
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const onAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await addMaterial(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("教材を追加しました。プランを再生成して反映してください。");
        formRef.current?.reset();
      }
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("この教材と関連タスクを削除します。よろしいですか?")) return;
    startTransition(async () => {
      const res = await deleteMaterial(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("削除しました");
      }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>教材を追加</CardTitle>
          <CardDescription>
            総量と1単位あたりの時間から、フェーズ期間内に終わるよう日割りされます
          </CardDescription>
        </CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              先に科目を登録してください。
            </p>
          ) : (
            <form
              ref={formRef}
              action={onAdd}
              className="grid gap-3 sm:grid-cols-2"
            >
              <div className="space-y-1.5">
                <Label>科目</Label>
                <Select name="subject_id" defaultValue={subjects[0].id}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-title">教材名</Label>
                <Input
                  id="mat-title"
                  name="title"
                  placeholder="システム英単語"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-total">総量</Label>
                <Input
                  id="mat-total"
                  name="total_units"
                  type="number"
                  min={1}
                  placeholder="200"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-unit">単位</Label>
                <Input
                  id="mat-unit"
                  name="unit_label"
                  placeholder="ページ / 問 / 章"
                  defaultValue="ページ"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mat-mpu">1単位あたりの時間(分)</Label>
                <Input
                  id="mat-mpu"
                  name="minutes_per_unit"
                  type="number"
                  min={0.5}
                  step={0.5}
                  placeholder="5"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>取り組むフェーズ</Label>
                <Select name="phase" defaultValue="basic">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PHASE_LABELS) as Phase[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {PHASE_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Button type="submit" disabled={pending}>
                  追加する
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>登録済みの教材</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {materials.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                まだ教材がありません。
              </li>
            )}
            {materials.map((m) => {
              const subject = subjectById.get(m.subject_id);
              const pct =
                m.total_units > 0
                  ? Math.round((m.doneUnits / m.total_units) * 100)
                  : 0;
              return (
                <li key={m.id} className="flex items-center gap-4 py-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {subject && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: subject.color }}
                        >
                          {subject.name}
                        </span>
                      )}
                      <span className="font-medium">{m.title}</span>
                      <Badge className={PHASE_BADGE_CLASS[m.phase]}>
                        {PHASE_LABELS[m.phase]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="whitespace-nowrap text-xs text-muted-foreground">
                        {m.doneUnits}/{m.total_units} {m.unit_label}({pct}%)
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={pending}
                    onClick={() => onDelete(m.id)}
                    aria-label={`${m.title}を削除`}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
