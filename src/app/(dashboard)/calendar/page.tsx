import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parse,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computePhaseWindows, PHASE_LABELS } from "@/lib/plan/engine";
import {
  TaskList,
  type TaskListItem,
} from "@/components/features/dashboard/task-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Phase } from "@/types/database";

export const metadata: Metadata = { title: "カレンダー | 合格プランナー" };

const PHASE_BAND_CLASS: Record<Phase, string> = {
  basic: "bg-phase-basic",
  advance: "bg-phase-advance",
  final: "bg-phase-final",
};

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  let monthDate = params.month
    ? parse(params.month, "yyyy-MM", new Date())
    : today;
  if (!isValid(monthDate)) monthDate = today;

  const gridStart = startOfWeek(startOfMonth(monthDate));
  const gridEnd = endOfWeek(endOfMonth(monthDate));
  const gridStartStr = format(gridStart, "yyyy-MM-dd");
  const gridEndStr = format(gridEnd, "yyyy-MM-dd");

  const selectedDay =
    params.day && isValid(parse(params.day, "yyyy-MM-dd", new Date()))
      ? params.day
      : null;

  const [tasksRes, milestonesRes, materialsRes, subjectsRes, targetRes, settingsRes] =
    await Promise.all([
      supabase
        .from("study_tasks")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", gridStartStr)
        .lte("date", gridEndStr),
      supabase
        .from("milestones")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", gridStartStr)
        .lte("date", gridEndStr),
      supabase.from("materials").select("*").eq("user_id", user.id),
      supabase.from("subjects").select("*").eq("user_id", user.id),
      supabase
        .from("milestones")
        .select("date")
        .eq("user_id", user.id)
        .eq("is_target", true)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plan_settings")
        .select("*")
        .eq("user_id", user.id)
        .single(),
    ]);

  if (
    tasksRes.error ||
    milestonesRes.error ||
    materialsRes.error ||
    subjectsRes.error ||
    targetRes.error ||
    settingsRes.error ||
    !settingsRes.data
  ) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  const materialById = new Map(materialsRes.data.map((m) => [m.id, m]));
  const subjectById = new Map(subjectsRes.data.map((s) => [s.id, s]));

  // 日付 → フェーズ(今日以降のみ)
  const phaseByDate = new Map<string, Phase>();
  if (targetRes.data) {
    const windows = computePhaseWindows(
      today,
      new Date(`${targetRes.data.date}T00:00:00`),
      settingsRes.data.basic_ratio,
      settingsRes.data.advance_ratio,
    );
    for (const w of windows) {
      for (
        let d = new Date(`${w.start}T00:00:00`);
        format(d, "yyyy-MM-dd") <= w.end;
        d = addDays(d, 1)
      ) {
        phaseByDate.set(format(d, "yyyy-MM-dd"), w.phase);
      }
    }
  }

  // 日付ごとの集計
  interface DaySummary {
    minutes: number;
    total: number;
    done: number;
    subjectColors: string[];
  }
  const summaryByDate = new Map<string, DaySummary>();
  for (const t of tasksRes.data) {
    const material = materialById.get(t.material_id);
    const subject = material ? subjectById.get(material.subject_id) : undefined;
    const s = summaryByDate.get(t.date) ?? {
      minutes: 0,
      total: 0,
      done: 0,
      subjectColors: [],
    };
    s.minutes += Math.round(t.planned_units * (material?.minutes_per_unit ?? 0));
    s.total += 1;
    if (t.status === "done") s.done += 1;
    const color = subject?.color ?? "#64748b";
    if (!s.subjectColors.includes(color)) s.subjectColors.push(color);
    summaryByDate.set(t.date, s);
  }
  const milestonesByDate = new Map<string, typeof milestonesRes.data>();
  for (const m of milestonesRes.data) {
    milestonesByDate.set(m.date, [...(milestonesByDate.get(m.date) ?? []), m]);
  }

  // カレンダーグリッド
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const monthLabel = format(monthDate, "yyyy年M月");
  const prevMonth = format(addMonths(monthDate, -1), "yyyy-MM");
  const nextMonth = format(addMonths(monthDate, 1), "yyyy-MM");
  const currentMonthStr = format(monthDate, "yyyy-MM");

  // 選択日の詳細
  const selectedTasks: TaskListItem[] = selectedDay
    ? tasksRes.data
        .filter((t) => t.date === selectedDay)
        .map((t) => {
          const material = materialById.get(t.material_id);
          const subject = material
            ? subjectById.get(material.subject_id)
            : undefined;
          return {
            ...t,
            materialTitle: material?.title ?? "不明な教材",
            unitLabel: material?.unit_label ?? "",
            subjectName: subject?.name ?? "-",
            subjectColor: subject?.color ?? "#64748b",
            estimatedMinutes: Math.round(
              t.planned_units * (material?.minutes_per_unit ?? 0),
            ),
          };
        })
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{monthLabel}</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="icon" aria-label="前の月">
            <Link href={`/calendar?month=${prevMonth}`}>
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/calendar">今月</Link>
          </Button>
          <Button asChild variant="outline" size="icon" aria-label="次の月">
            <Link href={`/calendar?month=${nextMonth}`}>
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {(Object.keys(PHASE_LABELS) as Phase[]).map((p) => (
          <span key={p} className="flex items-center gap-1">
            <span
              className={`${PHASE_BAND_CLASS[p]} inline-block h-1.5 w-4 rounded-full`}
            />
            {PHASE_LABELS[p]}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-milestone" />
          マイルストーン
        </span>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium">
          {WEEKDAY_LABELS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "py-2",
                i === 0 && "text-destructive",
                i === 6 && "text-phase-basic",
              )}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            const inMonth = format(d, "yyyy-MM") === currentMonthStr;
            const summary = summaryByDate.get(dateStr);
            const dayMilestones = milestonesByDate.get(dateStr) ?? [];
            const phase = phaseByDate.get(dateStr);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDay;

            return (
              <Link
                key={dateStr}
                href={`/calendar?month=${currentMonthStr}&day=${dateStr}`}
                className={cn(
                  "flex min-h-20 flex-col gap-1 border-b border-r p-1.5 text-left transition-colors hover:bg-accent/50",
                  !inMonth && "bg-muted/30 text-muted-foreground",
                  isSelected && "bg-accent",
                )}
              >
                {phase ? (
                  <span
                    className={`${PHASE_BAND_CLASS[phase]} h-1 w-full rounded-full opacity-70`}
                  />
                ) : (
                  <span className="h-1 w-full" />
                )}
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs",
                    isToday && "bg-primary font-bold text-primary-foreground",
                  )}
                >
                  {d.getDate()}
                </span>
                {dayMilestones.map((m) => (
                  <span
                    key={m.id}
                    className="truncate rounded bg-milestone/15 px-1 text-[10px] font-medium text-milestone"
                    title={m.title}
                  >
                    {m.is_target ? "★" : "●"} {m.title}
                  </span>
                ))}
                {summary && (
                  <div className="mt-auto space-y-0.5">
                    <div className="flex gap-0.5">
                      {summary.subjectColors.slice(0, 5).map((c) => (
                        <span
                          key={c}
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {summary.done}/{summary.total}件・
                      {Math.round(summary.minutes / 60) > 0
                        ? `${(summary.minutes / 60).toFixed(1)}h`
                        : `${summary.minutes}分`}
                    </p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {selectedDay && (
        <Card>
          <CardHeader>
            <CardTitle>{selectedDay} のタスク</CardTitle>
            {(milestonesByDate.get(selectedDay) ?? []).map((m) => (
              <CardDescription key={m.id} className="text-milestone">
                {m.is_target ? "★" : "●"} {m.title}
              </CardDescription>
            ))}
          </CardHeader>
          <CardContent>
            <TaskList tasks={selectedTasks} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
