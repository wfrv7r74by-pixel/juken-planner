"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Map, Pencil, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { generateRoadmap } from "@/lib/actions/roadmap";
import {
  DIVISION_NAME,
  currentDivision,
  type DivisionKind,
} from "@/lib/learning/roadmap";
import { WeekTimetable } from "@/components/features/plan/week-timetable";
import { DivisionMaterials } from "@/components/features/plan/division-materials";
import { PlanEditor } from "@/components/features/plan/plan-editor";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { RoutineBlock, StudyRoadmapRow, Subject } from "@/types/database";

const KIND_CLS: Record<DivisionKind, { dot: string; text: string; bg: string }> = {
  basic: { dot: "bg-phase-basic", text: "text-phase-basic", bg: "bg-phase-basic/10" },
  practice: { dot: "bg-success", text: "text-success", bg: "bg-success/10" },
  advance: { dot: "bg-phase-advance", text: "text-phase-advance", bg: "bg-phase-advance/10" },
  past: { dot: "bg-phase-final", text: "text-phase-final", bg: "bg-phase-final/10" },
  common: { dot: "bg-milestone", text: "text-milestone", bg: "bg-milestone/10" },
};

function fmt(iso: string) {
  return iso.replaceAll("-", "/").slice(5);
}
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RoadmapView({
  profile,
  roadmap,
  weekBlocks,
  subjects,
  materials,
  lifeBlocks,
  onGoToConsult,
}: {
  profile: UserLearningProfile;
  roadmap: StudyRoadmapRow | null;
  weekBlocks: RoutineBlock[];
  subjects: Subject[];
  materials: { subject: string; title: string }[];
  lifeBlocks: {
    weekday: number;
    startTime: string;
    endTime: string;
    title: string;
  }[];
  onGoToConsult?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [missing, setMissing] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  const generate = () =>
    startTransition(async () => {
      const res = await generateRoadmap();
      if (res.error) {
        setMissing(res.missing ?? []);
        toast.error(res.error);
      } else {
        setMissing([]);
        toast.success("ロードマップを作成しました");
        router.refresh();
      }
    });

  const data = roadmap?.roadmap ?? null;
  const today = todayLocal();
  const current = useMemo(
    () => (data ? currentDivision(data.divisions, today) : null),
    [data, today],
  );

  // ── 未生成 ──
  if (!data || data.divisions.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border bg-card p-6 text-center">
          <Map className="mx-auto size-8 text-primary" />
          <p className="mt-2 font-heading text-lg font-semibold">
            受験までのロードマップを作成
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            志望校から逆算し、基礎→演習→発展→過去問→共テ の区分と、月・週の到達目標、
            今週の計画までを一気に作ります。
          </p>
          {missing.length > 0 && (
            <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left text-sm">
              {missing.map((m) => (
                <li
                  key={m}
                  className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2"
                >
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{m}</span>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-4" disabled={pending} onClick={generate}>
            <Sparkles className="size-4" />
            {pending ? "作成中…" : "ロードマップを作成"}
          </Button>
          {missing.length > 0 && onGoToConsult && (
            <div>
              <Button variant="outline" className="mt-2" onClick={onGoToConsult}>
                <ArrowLeft className="size-4" /> 相談に戻る
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const currentConcepts = current
    ? data.concepts.find((c) => c.divisionKind === current.kind)
    : null;
  const currentMonth = today.slice(0, 7);
  const monthGoal = data.monthlyGoals.find((m) => m.month === currentMonth);

  return (
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {data.generatedBy === "ai" ? "AI 生成" : "自動生成"}
              </span>
            </div>
            <h2 className="mt-1 font-heading text-lg font-semibold">
              受験までのロードマップ
            </h2>
            {data.examDate && (
              <p className="text-xs text-muted-foreground">
                本命 {data.examDate.replaceAll("-", "/")} まで
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant={editing ? "default" : "outline"}
              size="sm"
              onClick={() => setEditing((v) => !v)}
            >
              <Pencil className="size-4" />
              編集
            </Button>
            <Button variant="outline" size="sm" disabled={pending} onClick={generate}>
              <RefreshCw className={cn("size-4", pending && "animate-spin")} />
              再生成
            </Button>
          </div>
        </div>

        {/* 区分タイムライン */}
        <ol className="mt-4 space-y-2">
          {data.divisions.map((d) => {
            const cls = KIND_CLS[d.kind];
            const isCurrent = current?.kind === d.kind;
            return (
              <li
                key={d.kind}
                className={cn(
                  "rounded-xl border p-3",
                  isCurrent ? cls.bg : "bg-transparent",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", cls.dot)} />
                  <span className={cn("font-heading font-semibold", isCurrent && cls.text)}>
                    {DIVISION_NAME[d.kind]}
                  </span>
                  {isCurrent && (
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", cls.bg, cls.text)}>
                      現在
                    </span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {fmt(d.startDate)}〜{fmt(d.endDate)}
                  </span>
                </div>
                {isCurrent && currentConcepts && (
                  <ul className="mt-2 space-y-1">
                    {currentConcepts.subjects.map((s) => (
                      <li key={s.subject} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{s.subject}</span>
                        : {s.concept}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* 編集フォーム(第3弾: 予定・宿題 / 区分の期間) */}
      {editing && roadmap && (
        <PlanEditor
          profile={profile}
          roadmap={roadmap}
          materials={materials}
          lifeBlocks={lifeBlocks}
        />
      )}

      {/* 現区分の教材提案(第2弾・節目提案) */}
      {current && roadmap && (
        <DivisionMaterials
          roadmap={roadmap}
          divisionKind={current.kind}
          divisionName={DIVISION_NAME[current.kind]}
        />
      )}

      {/* 今月・今週の到達目標 */}
      {(monthGoal || data.currentWeeklyGoal) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {monthGoal && (
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-[11px] font-bold tracking-wide text-primary">今月の到達目標</p>
              <p className="mt-1 text-sm">{monthGoal.goal}</p>
            </div>
          )}
          {data.currentWeeklyGoal && (
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-[11px] font-bold tracking-wide text-success">今週の到達目標</p>
              <p className="mt-1 text-sm">{data.currentWeeklyGoal.goal}</p>
            </div>
          )}
        </div>
      )}

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

      {/* 今週の時間割(ホームの予定に反映) */}
      <div className="border-t pt-4">
        <p className="mb-2 font-heading font-semibold">今週の時間割</p>
        <WeekTimetable blocks={weekBlocks} subjects={subjects} />
      </div>
    </div>
  );
}
