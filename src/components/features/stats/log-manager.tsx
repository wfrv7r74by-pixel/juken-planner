"use client";

import { useRef, useTransition } from "react";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addStudyLog, deleteStudyLog } from "@/lib/actions/masters";
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
import type { StudyLog, Subject } from "@/types/database";

export function LogManager({
  subjects,
  logs,
}: {
  subjects: Subject[];
  logs: StudyLog[];
}) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  const onAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await addStudyLog(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("学習時間を記録しました");
        formRef.current?.reset();
      }
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteStudyLog(id);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("削除しました");
      }
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>学習時間を記録</CardTitle>
          <CardDescription>
            タスク完了時は自動で記録されます。それ以外の学習はこちらから。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form ref={formRef} action={onAdd} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>科目</Label>
              <Select name="subject_id" defaultValue={subjects[0]?.id}>
                <SelectTrigger>
                  <SelectValue placeholder="科目を選択" />
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
              <Label htmlFor="log-date">日付</Label>
              <Input
                id="log-date"
                name="date"
                type="date"
                defaultValue={format(new Date(), "yyyy-MM-dd")}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-minutes">学習時間(分)</Label>
              <Input
                id="log-minutes"
                name="minutes"
                type="number"
                min={1}
                placeholder="60"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="log-memo">メモ(任意)</Label>
              <Input id="log-memo" name="memo" placeholder="過去問 2019年度" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={pending}>
                記録する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近の記録</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {logs.length === 0 && (
              <li className="py-3 text-sm text-muted-foreground">
                まだ記録がありません。
              </li>
            )}
            {logs.map((log) => {
              const subject = log.subject_id
                ? subjectById.get(log.subject_id)
                : undefined;
              return (
                <li key={log.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground">
                    {log.date.slice(5).replace("-", "/")}
                  </span>
                  {subject && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: subject.color }}
                    >
                      {subject.name}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {log.minutes}分
                    {log.memo && (
                      <span className="text-muted-foreground"> — {log.memo}</span>
                    )}
                  </span>
                  {log.source === "task" ? (
                    <Badge variant="secondary">自動</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={pending}
                      onClick={() => onDelete(log.id)}
                      aria-label="記録を削除"
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
