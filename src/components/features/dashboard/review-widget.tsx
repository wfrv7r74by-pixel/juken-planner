"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { toggleReviewItem } from "@/lib/actions/review";
import { GRADING_SUBJECT_LABELS, type GradingSubject } from "@/lib/grading/types";
import type { ReviewItem } from "@/types/database";

function subjectLabel(subject: string): string {
  return GRADING_SUBJECT_LABELS[subject as GradingSubject] ?? subject;
}

/** ホーム用: 未完了の復習項目を数件表示し、タップで完了できる */
export function ReviewWidget({
  items,
  totalTodo,
}: {
  items: ReviewItem[];
  totalTodo: number;
}) {
  const [pending, startTransition] = useTransition();

  const onDone = (item: ReviewItem) => {
    startTransition(async () => {
      const res = await toggleReviewItem(item.id, true);
      if (res.error) toast.error(res.error);
      else toast.success("復習完了!");
    });
  };

  if (totalTodo === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ListChecks className="size-4 text-primary" />
          復習リスト
          <span className="rounded-full bg-primary/15 px-1.5 text-xs text-primary">
            {totalTodo}
          </span>
        </p>
        <Link
          href="/grading"
          className="flex items-center text-xs text-muted-foreground hover:text-foreground"
        >
          すべて見る <ChevronRight className="size-3" />
        </Link>
      </div>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => onDone(item)}
              className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-success"
              aria-label="復習完了にする"
            />
            <span className="min-w-0 flex-1 truncate text-sm">{item.topic}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {subjectLabel(item.subject)}
            </span>
          </li>
        ))}
      </ul>

      {totalTodo > items.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          ほか {totalTodo - items.length} 件
        </p>
      )}
    </div>
  );
}
