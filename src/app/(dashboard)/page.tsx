import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { differenceInCalendarDays, format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Flag,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computePhaseWindows } from "@/lib/plan/engine";
import { PhaseTimeline } from "@/components/features/dashboard/phase-timeline";
import {
  TaskList,
  type TaskListItem,
} from "@/components/features/dashboard/task-list";
import { RegenerateButton } from "@/components/features/plan/regenerate-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: "ホーム | 合格プランナー" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");

  const [
    targetRes,
    settingsRes,
    todayTasksRes,
    materialsRes,
    subjectsRes,
    doneTasksRes,
    overdueRes,
    upcomingRes,
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
      .eq("date", todayStr)
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
      .limit(4),
  ]);

  const anyError =
    targetRes.error ||
    settingsRes.error ||
    todayTasksRes.error ||
    materialsRes.error ||
    subjectsRes.error ||
    doneTasksRes.error ||
    overdueRes.error ||
    upcomingRes.error;
  if (anyError || !settingsRes.data) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  const target = targetRes.data;
  const materials = materialsRes.data;
  const subjects = subjectsRes.data;

  // オンボーディング: 本命試験日がまだない
  if (!target) {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-10 text-center">
        <Flag className="mx-auto size-10 text-primary" />
        <h1 className="text-2xl font-bold">まずは目標を設定しましょう</h1>
        <p className="text-muted-foreground">
          本命の試験日を登録すると、合格から逆算した学習プランを自動生成できます。
        </p>
        <Button asChild>
          <Link href="/settings">
            試験日を設定する <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    );
  }

  const examDate = new Date(`${target.date}T00:00:00`);
  const daysLeft = differenceInCalendarDays(examDate, today);
  const windows = computePhaseWindows(
    today,
    examDate,
    settingsRes.data.basic_ratio,
    settingsRes.data.advance_ratio,
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
  const progressPct =
    totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : 0;

  const materialById = new Map(materials.map((m) => [m.id, m]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const todayTasks: TaskListItem[] = todayTasksRes.data.map((t) => {
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
  });
  const todayDoneCount = todayTasks.filter((t) => t.status === "done").length;
  const overdueCount = overdueRes.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* カウントダウン */}
      <Card className="bg-gradient-to-r from-primary to-phase-advance text-white">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 py-2">
          <div>
            <p className="text-sm/6 opacity-90">{target.title}</p>
            <p className="text-4xl font-bold">
              あと {daysLeft} <span className="text-xl font-medium">日</span>
            </p>
            <p className="text-sm opacity-90">{target.date}</p>
          </div>
          <div className="min-w-40 flex-1 sm:max-w-60">
            <p className="mb-1 text-sm opacity-90">全体進捗 {progressPct}%</p>
            <Progress
              value={progressPct}
              className="h-3 bg-white/25 [&>[data-slot=progress-indicator]]:bg-white"
            />
          </div>
        </CardContent>
      </Card>

      {/* 遅れの警告 */}
      {overdueCount > 0 && (
        <Card className="border-phase-final/50 bg-phase-final/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-1">
            <p className="flex items-center gap-2 text-sm">
              <TriangleAlert className="size-4 text-phase-final" />
              期限を過ぎた未完了タスクが {overdueCount} 件あります。
              残り期間で無理なく再配分しましょう。
            </p>
            <RegenerateButton label="リスケジュール" variant="secondary" />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 今日のタスク */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              今日のタスク
              <span className="text-sm font-normal text-muted-foreground">
                {todayDoneCount}/{todayTasks.length} 完了
              </span>
            </CardTitle>
            <CardDescription>{todayStr}</CardDescription>
          </CardHeader>
          <CardContent>
            {materials.length === 0 ? (
              <div className="space-y-3 py-4 text-center">
                <BookOpen className="mx-auto size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  教材を登録するとプランを生成できます。
                </p>
                <Button asChild variant="outline">
                  <Link href="/materials">教材を登録する</Link>
                </Button>
              </div>
            ) : todayTasks.length === 0 ? (
              <div className="space-y-3 py-4 text-center">
                <p className="text-sm text-muted-foreground">
                  プランがまだ生成されていません。
                </p>
                <RegenerateButton label="プランを生成する" />
              </div>
            ) : (
              <TaskList tasks={todayTasks} />
            )}
          </CardContent>
        </Card>

        {/* 直近のマイルストーン */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4" />
              今後の予定
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {upcomingRes.data.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  予定はありません
                </li>
              )}
              {upcomingRes.data.map((m) => (
                <li key={m.id} className="flex items-baseline gap-2 text-sm">
                  <span className="whitespace-nowrap font-mono text-muted-foreground">
                    {m.date.slice(5).replace("-", "/")}
                  </span>
                  <span className="min-w-0 flex-1">{m.title}</span>
                  {m.is_target && (
                    <span className="text-milestone" title="本命">
                      ★
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* 年間フェーズ */}
      <Card>
        <CardHeader>
          <CardTitle>年間の見通し</CardTitle>
          <CardDescription>
            基礎固め → 発展 → 直前対策 の3フェーズで試験日まで進みます
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PhaseTimeline windows={windows} today={todayStr} />
        </CardContent>
      </Card>
    </div>
  );
}
