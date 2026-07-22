"use client";

import { useRef, useState, useTransition } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  addReviewItem,
  deleteReviewItem,
  toggleReviewItem,
} from "@/lib/actions/review";
import { GRADING_SUBJECT_LABELS } from "@/lib/grading/types";
import type { GradingSubject } from "@/lib/grading/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReviewItem } from "@/types/database";

function subjectLabel(subject: string): string {
  return GRADING_SUBJECT_LABELS[subject as GradingSubject] ?? subject;
}

export function ReviewList({ items }: { items: ReviewItem[] }) {
  const [pending, startTransition] = useTransition();
  const [showDone, setShowDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const todo = items.filter((i) => i.status === "todo");
  const done = items.filter((i) => i.status === "done");

  const onAdd = (formData: FormData) => {
    const topic = String(formData.get("topic") ?? "").trim();
    if (!topic) return;
    startTransition(async () => {
      const res = await addReviewItem({ topic });
      if (res.error) toast.error(res.error);
      else {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  };

  const onToggle = (item: ReviewItem) => {
    startTransition(async () => {
      const res = await toggleReviewItem(item.id, item.status !== "done");
      if (res.error) toast.error(res.error);
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deleteReviewItem(id);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-4">
      <form action={onAdd} className="flex gap-2">
        <Input
          ref={inputRef}
          name="topic"
          placeholder="復習したい項目を追加(例: 不定形の極限)"
        />
        <Button type="submit" disabled={pending} size="icon" aria-label="追加">
          <Plus className="size-4" />
        </Button>
      </form>

      {todo.length === 0 && done.length === 0 && (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          復習リストは空です。採点結果から「復習に追加」するか、上の欄から手動で追加できます。
        </p>
      )}

      <ul className="space-y-2">
        {todo.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-3 rounded-xl border bg-card p-3"
          >
            <button
              type="button"
              disabled={pending}
              onClick={() => onToggle(item)}
              className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-success"
              aria-label="完了にする"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.topic}</p>
              <p className="text-xs text-muted-foreground">
                {subjectLabel(item.subject)}
                {item.source === "grading" && " ・採点から"}
              </p>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => onDelete(item.id)}
              className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
              aria-label="削除"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {done.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="text-xs text-muted-foreground underline"
          >
            完了済み {done.length} 件を{showDone ? "隠す" : "表示"}
          </button>
          {showDone && (
            <ul className="mt-2 space-y-2">
              {done.map((item) => (
                <li
                  key={item.id}
                  className="group flex items-center gap-3 rounded-xl border bg-card p-3 opacity-60"
                >
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onToggle(item)}
                    className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-success bg-success text-success-foreground"
                    aria-label="未完了に戻す"
                  >
                    <Check className="size-4" strokeWidth={3} />
                  </button>
                  <p className="min-w-0 flex-1 truncate text-sm line-through">
                    {item.topic}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onDelete(item.id)}
                    className={cn(
                      "hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block",
                    )}
                    aria-label="削除"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
