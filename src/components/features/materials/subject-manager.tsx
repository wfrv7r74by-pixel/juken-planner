"use client";

import { useRef, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addSubject, deleteSubject } from "@/lib/actions/masters";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Subject } from "@/types/database";

const PRESET_COLORS = [
  "#4f46e5",
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#db2777",
  "#0891b2",
  "#7c3aed",
  "#ca8a04",
];

export function SubjectManager({ subjects }: { subjects: Subject[] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const onAdd = (formData: FormData) => {
    startTransition(async () => {
      const res = await addSubject(formData);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("科目を追加しました");
        formRef.current?.reset();
      }
    });
  };

  const onDelete = (id: string) => {
    if (!confirm("この科目と、紐づく教材・タスクをすべて削除します。よろしいですか?")) {
      return;
    }
    startTransition(async () => {
      const res = await deleteSubject(id);
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
        <CardTitle>科目</CardTitle>
        <CardDescription>英語・数学・国語など受験科目を登録します</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form ref={formRef} action={onAdd} className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <Input name="name" placeholder="科目名(例: 英語)" required />
          </div>
          <select
            name="color"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            defaultValue={PRESET_COLORS[0]}
            aria-label="科目の色"
          >
            {PRESET_COLORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={pending}>
            追加
          </Button>
        </form>

        <div className="flex flex-wrap gap-2">
          {subjects.length === 0 && (
            <p className="text-sm text-muted-foreground">
              まだ科目がありません。
            </p>
          )}
          {subjects.map((s) => (
            <span
              key={s.id}
              className="flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-sm"
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              {s.name}
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                disabled={pending}
                onClick={() => onDelete(s.id)}
                aria-label={`${s.name}を削除`}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
