"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarCheck,
  Info,
  Lock,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  generateWeeklyPlan,
  toggleWeeklyPlanTask,
} from "@/lib/actions/plan";
import { canGeneratePlan } from "@/lib/learning/profile";
import type { PlanTaskKind } from "@/lib/learning/plan";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { WeeklyPlanRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // 月〜日で表示

const KIND: Record<PlanTaskKind, { label: string; cls: string }> = {
  new: { label: "新規", cls: "bg-phase-basic/15 text-phase-basic" },
  review: { label: "復習", cls: "bg-phase-advance/15 text-phase-advance" },
  check: { label: "確認", cls: "bg-phase-final/15 text-phase-final" },
};

export function WeeklyPlan({
  profile,
  plan,
  onGoToConsult,
}: {
  profile: UserLearningProfile;
  plan: WeeklyPlanRow | null;
  onGoToConsult?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[]>([]);
  const gate = useMemo(() => canGeneratePlan(profile), [profile]);

  const generate = () =>
    startTransition(async () => {
      const res = await generateWeeklyPlan();
      if (res.error) {
        setMissing(res.missing ?? []);
        toast.error(res.error);
      } else {
        setMissing([]);
        toast.success("今週の計画を作成しました");
        router.refresh();
      }
    });

  // ── 計画なし: ブロック or 生成待ち ──
  if (!plan) {
    const blocked = !gate.ok || missing.length > 0;
    const missingList = missing.length > 0 ? missing : gate.missing;
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        {blocked ? (
          <>
            <Lock className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-2 font-heading text-lg font-semibold">
              あと少しで計画を作れます
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              計画生成には第1・2・4層の情報が必要です。「相談」で埋めてください。
            </p>
            <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left text-sm">
              {missingList.map((m) => (
                <li
                  key={m}
                  className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
            {onGoToConsult && (
              <Button className="mt-4" variant="outline" onClick={onGoToConsult}>
                <ArrowLeft className="size-4" />
                相談に戻って埋める
              </Button>
            )}
          </>
        ) : (
          <>
            <Sparkles className="mx-auto size-8 text-success" />
            <p className="mt-2 font-heading text-lg font-semibold">
              計画を生成できます
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              志望校から逆算し、今週の範囲ベースのタスク(教材名＋範囲)を作ります。
            </p>
            <Button className="mt-4" disabled={pending} onClick={generate}>
              <Sparkles className="size-4" />
              {pending ? "生成中…" : "今週の計画を生成"}
            </Button>
          </>
        )}
      </div>
    );
  }

  // ── 計画あり ──
  const data = plan.plan;
  const total = data.tasks.length;
  const done = data.tasks.filter((t) => t.done).length;
  const byWeekday = new Map<number, typeof data.tasks>();
  for (const t of data.tasks) {
    const arr = byWeekday.get(t.weekday) ?? [];
    arr.push(t);
    byWeekday.set(t.weekday, arr);
  }
  const busy = new Set(data.busyWeekdays);

  const toggle = (id: string, next: boolean) =>
    startTransition(async () => {
      const res = await toggleWeeklyPlanTask(id, next);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-bold",
                  data.phase === "diagnostic"
                    ? "bg-milestone/15 text-milestone"
                    : "bg-success/15 text-success",
                )}
              >
                {data.phase === "diagnostic" ? "診断フェーズ" : "本格フェーズ"}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {data.generatedBy === "ai" ? "AI 生成" : "自動生成"}
              </span>
            </div>
            <h2 className="mt-1.5 font-heading text-lg font-semibold">
              {data.theme}
            </h2>
            <p className="text-xs text-muted-foreground">
              {data.weekStart} の週
              {data.weeksUntilExam != null &&
                ` ・ 入試まで残り約 ${data.weeksUntilExam} 週`}
              {` ・ 実効 ${data.availability.effectiveWeeklyHours}h/週`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={generate}
          >
            <RefreshCw className={cn("size-4", pending && "animate-spin")} />
            再生成
          </Button>
        </div>

        {/* 進捗 */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>今週の達成</span>
            <span>
              {done} / {total}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-success transition-all"
              style={{ width: total ? `${(done / total) * 100}%` : "0%" }}
            />
          </div>
        </div>

        {/* 配分 */}
        {data.subjectAllocation.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.subjectAllocation.map((a) => (
              <span
                key={a.subject}
                title={a.reason}
                className="rounded-md bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground"
              >
                {a.subject}{" "}
                <span className="font-bold text-foreground">
                  {Math.round(a.weight * 100)}%
                </span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 注記 */}
      {data.notes.length > 0 && (
        <ul className="space-y-1.5">
          {data.notes.map((n, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-xl border bg-card px-3 py-2 text-xs text-muted-foreground"
            >
              <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      {/* 曜日別タスク */}
      <div className="space-y-3">
        {ORDER.map((wd) => {
          const tasks = byWeekday.get(wd);
          const isBusy = busy.has(wd);
          if (!tasks && !isBusy) return null;
          return (
            <div key={wd} className="rounded-2xl border bg-card p-4">
              <div className="mb-2 flex items-center gap-2">
                <CalendarCheck className="size-4 text-muted-foreground" />
                <span className="font-heading font-semibold">
                  {WEEKDAYS[wd]}曜
                </span>
                {isBusy && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                    予定あり(部活・バイト)
                  </span>
                )}
              </div>
              {!tasks && isBusy ? (
                <p className="text-xs text-muted-foreground">
                  この曜日はタスクを入れていません(固定予定を優先)。
                </p>
              ) : (
                <ul className="space-y-2">
                  {tasks!.map((t) => {
                    const kind = KIND[t.slotKind];
                    const hasRange = t.rangeStart !== "—" && t.rangeStart !== "";
                    return (
                      <li
                        key={t.id}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border p-3 transition-colors",
                          t.done && "opacity-60",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={t.done}
                          disabled={pending}
                          onChange={(e) => toggle(t.id, e.target.checked)}
                          className="mt-0.5 size-4 shrink-0 accent-[var(--color-success)]"
                          aria-label="完了"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[11px] font-bold",
                                kind.cls,
                              )}
                            >
                              {kind.label}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {t.subject}
                            </span>
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-sm font-medium",
                              t.done && "line-through",
                            )}
                          >
                            {t.materialTitle}
                            {hasRange && (
                              <span className="ml-1 font-bold text-primary">
                                {t.rangeStart}〜{t.rangeEnd}
                                {t.unitLabel ?? ""}
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            🎯 {t.targetLevel}
                          </p>
                          {t.note && (
                            <p className="mt-0.5 text-xs text-muted-foreground/80">
                              {t.note}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
