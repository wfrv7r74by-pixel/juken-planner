"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { toggleTask } from "@/lib/actions/plan";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { StudyTask } from "@/types/database";

export interface TaskListItem extends StudyTask {
  materialTitle: string;
  unitLabel: string;
  subjectName: string;
  subjectColor: string;
  estimatedMinutes: number;
}

export function TaskList({ tasks }: { tasks: TaskListItem[] }) {
  const [pending, startTransition] = useTransition();

  const onToggle = (task: TaskListItem, done: boolean) => {
    startTransition(async () => {
      const res = await toggleTask(task.id, done);
      if (res.error) {
        toast.error(res.error);
      } else if (done) {
        toast.success(`「${task.materialTitle}」を完了しました!`);
      }
    });
  };

  if (tasks.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        今日のタスクはありません
      </p>
    );
  }

  return (
    <ul className="divide-y">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center gap-3 py-3">
          <Checkbox
            checked={task.status === "done"}
            disabled={pending}
            onCheckedChange={(checked) => onToggle(task, checked === true)}
            aria-label={`${task.materialTitle}を完了にする`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: task.subjectColor }}
              >
                {task.subjectName}
              </span>
              <span
                className={cn(
                  "font-medium",
                  task.status === "done" &&
                    "text-muted-foreground line-through",
                )}
              >
                {task.materialTitle}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {task.unit_start === task.unit_end
                ? `${task.unit_start}`
                : `${task.unit_start}〜${task.unit_end}`}
              {task.unitLabel}({task.planned_units}
              {task.unitLabel}・約{task.estimatedMinutes}分)
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
