import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { addDays, differenceInCalendarDays, format } from "date-fns";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  DashboardTabs,
  type SubjectMinutes,
} from "@/components/features/dashboard/dashboard-tabs";
import { Button } from "@/components/ui/button";
import { NumberTicker } from "@/components/ui/aceternity/number-ticker";

export const metadata: Metadata = { title: "受験ダッシュボード | 合格プランナー" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = format(today, "yyyy-MM-dd");
  const from30 = format(addDays(today, -29), "yyyy-MM-dd");

  const [
    targetRes,
    nextRes,
    phasesRes,
    blocksRes,
    subjectsRes,
    todayLogsRes,
    logs30Res,
    notesRes,
    profileRes,
  ] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_target", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("milestones")
      .select("*")
      .eq("user_id", user.id)
      .eq("is_target", false)
      .gte("date", todayStr)
      .order("date")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("phases")
      .select("*")
      .eq("user_id", user.id)
      .order("start_date"),
    supabase
      .from("routine_blocks")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time"),
    supabase.from("subjects").select("*").eq("user_id", user.id),
    supabase
      .from("study_logs")
      .select("memo")
      .eq("user_id", user.id)
      .eq("date", todayStr)
      .like("memo", "block:%"),
    supabase
      .from("study_logs")
      .select("date, minutes, subject_id")
      .eq("user_id", user.id)
      .gte("date", from30),
    supabase
      .from("daily_notes")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(30),
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
  ]);

  const anyError =
    targetRes.error ||
    nextRes.error ||
    phasesRes.error ||
    blocksRes.error ||
    subjectsRes.error ||
    todayLogsRes.error ||
    logs30Res.error ||
    notesRes.error;
  if (anyError) {
    return (
      <p className="text-sm text-destructive">
        データの読み込みに失敗しました。時間をおいて再度お試しください。
      </p>
    );
  }

  const target = targetRes.data;
  const phases = phasesRes.data;

  // 現在のフェーズ
  const currentPhaseIndex = phases.findIndex(
    (p) => p.start_date <= todayStr && todayStr <= p.end_date,
  );
  const currentPhase =
    currentPhaseIndex >= 0 ? phases[currentPhaseIndex] : null;
  let phaseProgress = 0;
  let phaseDaysLeft = 0;
  if (currentPhase) {
    const start = new Date(`${currentPhase.start_date}T00:00:00`);
    const end = new Date(`${currentPhase.end_date}T00:00:00`);
    const total = differenceInCalendarDays(end, start) + 1;
    const elapsed = differenceInCalendarDays(today, start) + 1;
    phaseProgress = Math.round((elapsed / total) * 100);
    phaseDaysLeft = differenceInCalendarDays(end, today);
  }

  const finalDaysLeft = target
    ? differenceInCalendarDays(new Date(`${target.date}T00:00:00`), today)
    : null;
  const next = nextRes.data;
  const nextDaysLeft = next
    ? differenceInCalendarDays(new Date(`${next.date}T00:00:00`), today)
    : null;

  // 分析用の集計
  const minutesByDate = new Map<string, number>();
  for (let i = 13; i >= 0; i--) {
    minutesByDate.set(format(addDays(today, -i), "yyyy-MM-dd"), 0);
  }
  const subjectMinutesMap = new Map<string, number>();
  let totalMinutes30 = 0;
  for (const log of logs30Res.data) {
    if (minutesByDate.has(log.date)) {
      minutesByDate.set(log.date, (minutesByDate.get(log.date) ?? 0) + log.minutes);
    }
    totalMinutes30 += log.minutes;
    if (log.subject_id) {
      subjectMinutesMap.set(
        log.subject_id,
        (subjectMinutesMap.get(log.subject_id) ?? 0) + log.minutes,
      );
    }
  }
  const subjectMinutes: SubjectMinutes[] = subjectsRes.data.map((s) => ({
    name: s.name,
    color: s.color,
    minutes: subjectMinutesMap.get(s.id) ?? 0,
  }));

  const doneBlockIds = todayLogsRes.data
    .map((l) => l.memo?.replace("block:", "") ?? "")
    .filter(Boolean);

  const todayNote =
    notesRes.data.find((n) => n.date === todayStr) ?? null;

  const isEmpty =
    !target && phases.length === 0 && blocksRes.data.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* ヘッダー */}
      <div className="border-b border-border pb-4">
        <p className="text-xs tracking-[0.3em] text-primary/80 uppercase">
          {target ? target.title : "GOAL NOT SET"}
        </p>
        <h1 className="font-heading mt-1 text-2xl font-semibold tracking-wide">
          受験ダッシュボード
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          スケジュール確認と毎日の振り返り
        </p>
      </div>

      {isEmpty ? (
        <div className="space-y-4 rounded-2xl border border-primary/30 bg-card p-8 text-center">
          <Sparkles className="mx-auto size-10 text-primary" />
          <h2 className="text-lg font-bold">AI と一緒に計画を作ろう</h2>
          <p className="text-sm text-muted-foreground">
            志望校・試験日・今の状況を AI に話すと、フェーズ戦略と
            1日のルーティンを一緒に組み立てられます。
          </p>
          <Button asChild size="lg">
            <Link href="/ai">
              <Sparkles className="size-4" /> AI に相談して始める
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {/* NOW フェーズ */}
          {currentPhase ? (
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-baseline justify-between">
                <p className="text-xs tracking-[0.25em] text-primary">
                  NOW — フェーズ{"①②③④⑤⑥⑦⑧⑨⑩"[currentPhaseIndex] ?? currentPhaseIndex + 1}
                </p>
                <p className="text-xs text-muted-foreground">
                  〜{currentPhase.end_date.replaceAll("-", "/")}
                </p>
              </div>
              <p className="font-heading mt-1.5 text-lg font-semibold">
                {currentPhase.name}
              </p>
              {currentPhase.memo && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentPhase.memo}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">フェーズ進捗</span>
                <span className="font-medium text-primary">
                  {phaseProgress}% / 残{phaseDaysLeft}日
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary/80"
                  style={{ width: `${Math.min(100, phaseProgress)}%` }}
                />
              </div>
            </div>
          ) : (
            phases.length > 0 && (
              <div className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
                現在進行中のフェーズがありません。
                <Link href="/ai" className="ml-1 text-primary underline">
                  AI に相談して調整する
                </Link>
              </div>
            )
          )}

          {/* NEXT / FINAL カウントダウン */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-[10px] tracking-[0.25em] text-success">NEXT</p>
              {next ? (
                <>
                  <p className="mt-1 truncate text-sm font-medium">
                    {next.title}
                  </p>
                  <p className="font-heading mt-1 text-3xl font-semibold">
                    <NumberTicker value={nextDaysLeft ?? 0} />
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      日後
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">予定なし</p>
              )}
            </div>
            <div className="rounded-2xl border bg-card p-5">
              <p className="text-[10px] tracking-[0.25em] text-destructive">
                FINAL
              </p>
              {target ? (
                <>
                  <p className="mt-1 truncate text-sm font-medium">
                    {target.title}
                  </p>
                  <p className="font-heading mt-1 text-3xl font-semibold">
                    <NumberTicker value={finalDaysLeft ?? 0} />
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      日後
                    </span>
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  <Link href="/ai" className="text-primary underline">
                    本命試験日を設定
                  </Link>
                </p>
              )}
            </div>
          </div>

          {/* タブ(予定/振返/履歴/分析) */}
          <DashboardTabs
            todayStr={todayStr}
            todayWeekday={today.getDay()}
            blocks={blocksRes.data}
            subjects={subjectsRes.data}
            doneBlockIds={doneBlockIds}
            todayNote={todayNote}
            notes={notesRes.data}
            minutesByDate={[...minutesByDate.entries()]}
            subjectMinutes={subjectMinutes}
            totalMinutes30={totalMinutes30}
            displayName={profileRes.data?.display_name ?? ""}
          />
        </>
      )}
    </div>
  );
}
