"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Home, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { generateWeeklyTimetable } from "@/lib/actions/timetable";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoutineBlock, Subject } from "@/types/database";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

/** 今週の時間割プレビュー(ホームの予定に反映済み)。読み取り専用＋作り直し。 */
export function WeekTimetable({
  blocks,
  subjects,
}: {
  blocks: RoutineBlock[];
  subjects: Subject[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );

  const regenerate = () =>
    startTransition(async () => {
      const res = await generateWeeklyTimetable();
      if (res.error) toast.error(res.error);
      else {
        toast.success("今週の時間割を作り直しました");
        router.refresh();
      }
    });

  const byDay = new Map<number, RoutineBlock[]>();
  for (const b of blocks) {
    const arr = byDay.get(b.weekday) ?? [];
    arr.push(b);
    byDay.set(b.weekday, arr);
  }
  const [open, setOpen] = useState(false);
  const visibleDays = ORDER.filter((d) => (byDay.get(d)?.length ?? 0) > 0);
  const shownDays = open ? visibleDays : visibleDays.slice(0, 2);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <Home className="mr-1 inline size-3.5" />
          ホームの「予定」に反映済み。当日の完了チェックはホームで。
        </p>
        <Button variant="outline" size="sm" disabled={pending} onClick={regenerate}>
          <RefreshCw className={cn("size-4", pending && "animate-spin")} />
          作り直す
        </Button>
      </div>

      {blocks.length === 0 ? (
        <div className="rounded-2xl border bg-card p-5 text-center text-sm text-muted-foreground">
          今週の時間割がまだありません。「作り直す」で生成できます。
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {shownDays.map((wd) => {
              const day = (byDay.get(wd) ?? []).sort((a, b) =>
                a.start_time.localeCompare(b.start_time),
              );
              return (
                <div key={wd} className="rounded-xl border bg-card p-3">
                  <p className="mb-1.5 flex items-center gap-1.5 font-heading text-sm font-semibold">
                    <CalendarCheck className="size-3.5 text-muted-foreground" />
                    {WEEKDAYS[wd]}曜
                  </p>
                  <ul className="space-y-1">
                    {day.map((b) => {
                      const subject = b.subject_id
                        ? subjectById.get(b.subject_id)
                        : undefined;
                      return (
                        <li key={b.id} className="flex items-center gap-2 text-xs">
                          <span className="w-24 shrink-0 font-mono text-muted-foreground">
                            {b.start_time.slice(0, 5)}〜{b.end_time.slice(0, 5)}
                          </span>
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: subject?.color ?? "#64748b" }}
                          />
                          <span className="min-w-0 flex-1 truncate">{b.title}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {visibleDays.length > 2 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="w-full text-xs text-primary underline"
            >
              {open ? "閉じる" : `他 ${visibleDays.length - 2} 日分を表示`}
            </button>
          )}
        </>
      )}
    </div>
  );
}
