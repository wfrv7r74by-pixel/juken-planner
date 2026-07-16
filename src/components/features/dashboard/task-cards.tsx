"use client";

import { useTransition } from "react";
import { Check, Clock } from "lucide-react";
import { toast } from "sonner";
import { toggleTask } from "@/lib/actions/plan";
import { cn } from "@/lib/utils";
import type { TaskListItem } from "@/components/features/dashboard/task-list";

/** ホーム用: カード全体をタップして完了にできるタスクカード */
export function TaskCards({ tasks }: { tasks: TaskListItem[] }) {
  const [pending, startTransition] = useTransition();

  const onToggle = (task: TaskListItem) => {
    const done = task.status !== "done";
    startTransition(async () => {
      const res = await toggleTask(task.id, done);
      if (res.error) {
        toast.error(res.error);
      } else if (done) {
        toast.success(`「${task.materialTitle}」完了! おつかれさま 🎉`);
      }
    });
  };

  return (
    <ul className="space-y-2.5">
      {tasks.map((task) => {
        const done = task.status === "done";
        return (
          <li key={task.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => onToggle(task)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 bg-card p-3.5 text-left shadow-sm transition-all duration-200 active:scale-[0.98]",
                done
                  ? "border-success/40 bg-success/5 opacity-70"
                  : "border-border hover:border-primary/40 hover:shadow-md",
              )}
              style={{ borderLeftWidth: 6, borderLeftColor: task.subjectColor }}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                  done
                    ? "border-success bg-success text-success-foreground"
                    : "border-muted-foreground/40",
                )}
              >
                {done && <Check className="size-4" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span
                    className="text-xs font-bold"
                    style={{ color: task.subjectColor }}
                  >
                    {task.subjectName}
                  </span>
                  <span
                    className={cn(
                      "font-bold",
                      done && "text-muted-foreground line-through",
                    )}
                  >
                    {task.materialTitle}
                  </span>
                </span>
                <span className="block text-sm text-muted-foreground">
                  {task.unit_start === task.unit_end
                    ? task.unit_start
                    : `${task.unit_start}〜${task.unit_end}`}
                  {task.unitLabel}
                  <span className="mx-1.5 text-border">|</span>
                  <Clock className="mr-0.5 inline size-3.5 align-[-2px]" />
                  約{task.estimatedMinutes}分
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
