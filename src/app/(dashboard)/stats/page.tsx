import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { addDays, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { LogManager } from "@/components/features/stats/log-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const metadata: Metadata = { title: "統計 | 合格プランナー" };

function formatHours(minutes: number) {
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)}時間` : `${minutes}分`;
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const from30 = format(addDays(today, -29), "yyyy-MM-dd");

  const [logsRes, recentLogsRes, subjectsRes, materialsRes, doneTasksRes] =
    await Promise.all([
      supabase
        .from("study_logs")
        .select("date, minutes, subject_id")
        .eq("user_id", user.id)
        .gte("date", from30),
      supabase
        .from("study_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("subjects")
        .select("*")
        .eq("user_id", user.id)
        .order("sort_order"),
      supabase.from("materials").select("*").eq("user_id", user.id),
      supabase
        .from("study_tasks")
        .select("material_id, planned_units")
        .eq("user_id", user.id)
        .eq("status", "done"),
    ]);

  if (
    logsRes.error ||
    recentLogsRes.error ||
    subjectsRes.error ||
    materialsRes.error ||
    doneTasksRes.error
  ) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  const subjects = subjectsRes.data;
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // 直近14日の日別学習時間
  const dailyMinutes = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    dailyMinutes.set(format(addDays(today, -i), "yyyy-MM-dd"), 0);
  }
  // 直近30日の科目別学習時間
  const subjectMinutes = new Map<string, number>();
  let total30 = 0;
  for (const log of logsRes.data) {
    if (dailyMinutes.has(log.date)) {
      dailyMinutes.set(log.date, (dailyMinutes.get(log.date) ?? 0) + log.minutes);
    }
    total30 += log.minutes;
    if (log.subject_id) {
      subjectMinutes.set(
        log.subject_id,
        (subjectMinutes.get(log.subject_id) ?? 0) + log.minutes,
      );
    }
  }
  const dailyEntries = [...dailyMinutes.entries()];
  const maxDaily = Math.max(60, ...dailyEntries.map(([, v]) => v));
  const maxSubject = Math.max(1, ...subjectMinutes.values());

  // 教材ごとの進捗
  const doneByMaterial = new Map<string, number>();
  for (const t of doneTasksRes.data) {
    doneByMaterial.set(
      t.material_id,
      (doneByMaterial.get(t.material_id) ?? 0) + t.planned_units,
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">学習記録・統計</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 日別学習時間(直近14日) */}
        <Card>
          <CardHeader>
            <CardTitle>日別の学習時間</CardTitle>
            <CardDescription>直近14日間</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-40 items-end gap-1">
              {dailyEntries.map(([date, minutes]) => (
                <div
                  key={date}
                  className="group flex flex-1 flex-col items-center gap-1"
                  title={`${date}: ${formatHours(minutes)}`}
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary transition-colors group-hover:bg-phase-advance"
                      style={{
                        height: `${Math.max(minutes > 0 ? 4 : 1, (minutes / maxDaily) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {Number(date.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 科目別学習時間(直近30日) */}
        <Card>
          <CardHeader>
            <CardTitle>科目別の学習時間</CardTitle>
            <CardDescription>
              直近30日間・合計 {formatHours(total30)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {subjects.length === 0 && (
              <p className="text-sm text-muted-foreground">
                科目が登録されていません。
              </p>
            )}
            {subjects.map((s) => {
              const minutes = subjectMinutes.get(s.id) ?? 0;
              return (
                <div key={s.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">
                      {formatHours(minutes)}
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(minutes / maxSubject) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* 教材ごとの進捗 */}
      <Card>
        <CardHeader>
          <CardTitle>教材の進捗</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {materialsRes.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              教材が登録されていません。
            </p>
          )}
          {materialsRes.data.map((m) => {
            const done = Math.min(
              doneByMaterial.get(m.id) ?? 0,
              m.total_units,
            );
            const pct = Math.round((done / m.total_units) * 100);
            const subject = subjectById.get(m.subject_id);
            return (
              <div key={m.id} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {subject && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                      style={{ backgroundColor: subject.color }}
                    >
                      {subject.name}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 font-medium">{m.title}</span>
                  <span className="text-muted-foreground">
                    {done}/{m.total_units} {m.unit_label}({pct}%)
                  </span>
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <LogManager subjects={subjects} logs={recentLogsRes.data} />
    </div>
  );
}
