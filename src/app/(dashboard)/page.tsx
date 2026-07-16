import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { ja } from "date-fns/locale";
import {
  CalendarClock,
  ChevronRight,
  Flame,
  PartyPopper,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computePhaseWindows } from "@/lib/plan/engine";
import { PhaseTimeline } from "@/components/features/dashboard/phase-timeline";
import { ProgressRing } from "@/components/features/dashboard/progress-ring";
import { TaskCards } from "@/components/features/dashboard/task-cards";
import type { TaskListItem } from "@/components/features/dashboard/task-list";
import { RegenerateButton } from "@/components/features/plan/regenerate-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "今日 | 合格プランナー" };

/** 学習記録の日付一覧から連続学習日数を計算(今日または昨日から遡る) */
function calcStreak(logDates: Set<string>, today: Date): number {
  let cursor = logDates.has(format(today, "yyyy-MM-dd"))
    ? today
    : addDays(today, -1);
  let streak = 0;
  while (logDates.has(format(cursor, "yyyy-MM-dd"))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export default async function TodayPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");
  const tomorrowStr = format(addDays(today, 1), "yyyy-MM-dd");
  const streakFrom = format(addDays(today, -120), "yyyy-MM-dd");

  const [
    targetRes,
    settingsRes,
    tasksRes,
    materialsRes,
    subjectsRes,
    doneTasksRes,
    overdueRes,
    upcomingRes,
    logDatesRes,
    nextTaskRes,
  ] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_target", true)
      .limit(1)
      .maybeSingle(),
    supabase.from("plan_settings").select("*").eq("user_id", user.id).single(),
    supabase
      .from("study_tasks")
      .select("*")
      .eq("user_id", user.id)
      .in("date", [todayStr, tomorrowStr])
      .order("created_at"),
    supabase.from("materials").select("*").eq("user_id", user.id),
    supabase.from("subjects").select("*").eq("user_id", user.id),
    supabase
      .from("study_tasks")
      .select("material_id, planned_units")
      .eq("user_id", user.id)
      .eq("status", "done"),
    supabase
      .from("study_tasks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lt("date", todayStr),
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .gte("date", todayStr)
      .order("date")
      .limit(3),
    supabase
      .from("study_logs")
      .select("date")
      .eq("user_id", user.id)
      .gte("date", streakFrom),
    supabase
      .from("study_tasks")
      .select("date")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .gt("date", todayStr)
      .order("date")
      .limit(1)
      .maybeSingle(),
  ]);

  const anyError =
    targetRes.error ||
    settingsRes.error ||
    tasksRes.error ||
    materialsRes.error ||
    subjectsRes.error ||
    doneTasksRes.error ||
    overdueRes.error ||
    upcomingRes.error ||
    logDatesRes.error ||
    nextTaskRes.error;
  if (anyError || !settingsRes.data) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  // 目標未設定ならウィザードへ
  const target = targetRes.data;
  if (!target) redirect("/setup");

  const materials = materialsRes.data;
  const subjects = subjectsRes.data;
  const settings = settingsRes.data;

  const examDate = new Date(`${target.date}T00:00:00`);
  const daysLeft = differenceInCalendarDays(examDate, today);
  const windows = computePhaseWindows(
    today,
    examDate,
    settings.basic_ratio,
    settings.advance_ratio,
  );

  // 全体進捗(見積もり時間ベース)
  const doneByMaterial = new Map<string, number>();
  for (const t of doneTasksRes.data) {
    doneByMaterial.set(
      t.material_id,
      (doneByMaterial.get(t.material_id) ?? 0) + t.planned_units,
    );
  }
  let totalMinutes = 0;
  let doneMinutes = 0;
  for (const m of materials) {
    totalMinutes += m.total_units * m.minutes_per_unit;
    doneMinutes +=
      Math.min(doneByMaterial.get(m.id) ?? 0, m.total_units) *
      m.minutes_per_unit;
  }
  const overallPct =
    totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  const materialById = new Map(materials.map((m) => [m.id, m]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const toItem = (t: (typeof tasksRes.data)[number]): TaskListItem => {
    const material = materialById.get(t.material_id);
    const subject = material ? subjectById.get(material.subject_id) : undefined;
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
  };

  const todayTasks = tasksRes.data.filter((t) => t.date === todayStr).map(toItem);
  const tomorrowTasks = tasksRes.data
    .filter((t) => t.date === tomorrowStr)
    .map(toItem);

  const todayDone = todayTasks.filter((t) => t.status === "done").length;
  const todayPct =
    todayTasks.length > 0
      ? Math.round((todayDone / todayTasks.length) * 100)
      : 0;
  const todayMinutes = todayTasks.reduce(
    (a, t) => a + t.estimatedMinutes,
    0,
  );
  const todayCapacity =
    settings.weekday_minutes[String(today.getDay())] ?? 0;
  const overloaded = todayCapacity > 0 && todayMinutes > todayCapacity * 1.2;

  const streak = calcStreak(
    new Set(logDatesRes.data.map((l) => l.date)),
    today,
  );
  const overdueCount = overdueRes.count ?? 0;
  const allDone = todayTasks.length > 0 && todayDone === todayTasks.length;

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* ヒーロー: 今日 */}
      <div className="rounded-3xl bg-gradient-to-br from-primary via-primary to-phase-advance p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm/6 opacity-90">
              {format(today, "M月d日(E)", { locale: ja })}
            </p>
            <p className="text-lg font-bold">{target.title}まで</p>
            <p className="text-5xl font-black tracking-tight">
              {daysLeft}
              <span className="ml-1 text-lg font-bold">日</span>
            </p>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 font-bold">
                <Flame className="size-4 text-amber-300" />
                {streak}日連続
              </span>
              <span className="opacity-90">全体 {overallPct}%</span>
            </div>
          </div>
          <ProgressRing value={todayPct} size={110} className="text-white">
            <span className="text-3xl font-black">
              {todayDone}
              <span className="text-base font-bold opacity-80">
                /{todayTasks.length}
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">
              今日の達成
            </span>
          </ProgressRing>
        </div>
      </div>

      {/* 遅れの警告 */}
      {overdueCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-phase-final/40 bg-phase-final/10 p-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <TriangleAlert className="size-4 shrink-0 text-phase-final" />
            遅れが{overdueCount}件。残り日数で組み直せます
          </p>
          <RegenerateButton label="組み直す" variant="secondary" />
        </div>
      )}

      {/* 今日のタスク */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">今日やること</h2>
          {todayTasks.length > 0 && (
            <span
              className={
                overloaded
                  ? "text-sm font-bold text-phase-final"
                  : "text-sm text-muted-foreground"
              }
            >
              合計 約{todayMinutes}分
              {overloaded && ` (設定${todayCapacity}分を超過)`}
            </span>
          )}
        </div>

        {materials.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                教材がまだ登録されていません。
              </p>
              <Button asChild>
                <Link href="/setup">かんたんセットアップで始める</Link>
              </Button>
            </CardContent>
          </Card>
        ) : todayTasks.length === 0 ? (
          nextTaskRes.data ? (
            <Card>
              <CardContent className="space-y-1 py-6 text-center">
                <p className="text-2xl">🌤️</p>
                <p className="font-bold">今日はおやすみ日</p>
                <p className="text-sm text-muted-foreground">
                  次のタスクは{" "}
                  {nextTaskRes.data.date.slice(5).replace("-", "/")}{" "}
                  です。しっかり休むのも実力のうち!
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-3 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  今日のタスクはありません。プランを生成しましょう。
                </p>
                <RegenerateButton label="プランを生成する" />
              </CardContent>
            </Card>
          )
        ) : (
          <>
            {allDone && (
              <div className="flex items-center gap-3 rounded-2xl bg-success/10 p-4 text-success">
                <PartyPopper className="size-6 shrink-0" />
                <p className="text-sm font-bold">
                  今日の分は全部完了!この調子で積み上げよう 🎉
                </p>
              </div>
            )}
            <TaskCards tasks={todayTasks} />
          </>
        )}
      </section>

      {/* 明日のチラ見せ */}
      {tomorrowTasks.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          明日は {tomorrowTasks.length}件・約
          {tomorrowTasks.reduce((a, t) => a + t.estimatedMinutes, 0)}分の予定
        </p>
      )}

      {/* 年間フェーズ */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">年間の見通し</CardTitle>
        </CardHeader>
        <CardContent>
          <PhaseTimeline windows={windows} today={todayStr} />
        </CardContent>
      </Card>

      {/* 今後の予定 */}
      {upcomingRes.data.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4" /> 今後の予定
            </CardTitle>
            <CardDescription>
              <Link
                href="/calendar"
                className="flex items-center text-xs text-primary"
              >
                カレンダーで見る <ChevronRight className="size-3" />
              </Link>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {upcomingRes.data.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 text-sm">
                  <span className="whitespace-nowrap font-mono text-muted-foreground">
                    {m.date.slice(5).replace("-", "/")}
                  </span>
                  <span className="min-w-0 flex-1">{m.title}</span>
                  {m.is_target && <span className="text-milestone">★</span>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
