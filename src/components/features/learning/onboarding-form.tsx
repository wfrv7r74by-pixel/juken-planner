"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { answerQuestion, type AnswerPayload } from "@/lib/actions/learning";
import {
  QUESTIONS,
  pendingQuestions,
  type Question,
} from "@/lib/learning/questions";
import { canGeneratePlan } from "@/lib/learning/profile";
import type {
  AdmissionType,
  Grade,
  LevelBand,
  UserLearningProfile,
} from "@/lib/learning/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function OnboardingForm({ profile }: { profile: UserLearningProfile }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingList = useMemo(() => pendingQuestions(profile), [profile]);
  const question = pendingList[0];
  const answeredCount = profile.answeredQuestionIds.length;

  const submit = (payload: AnswerPayload) => {
    startTransition(async () => {
      const res = await answerQuestion(payload);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  // 全問終了 or 生成可能
  if (!question) {
    const gate = canGeneratePlan(profile);
    return (
      <div className="rounded-2xl border border-success/40 bg-card p-5 text-center">
        <Sparkles className="mx-auto size-8 text-success" />
        <p className="mt-2 font-heading text-lg font-semibold">
          ヒアリング完了
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {gate.ok
            ? "計画生成に必要な情報が揃いました。下の相談から計画を作れます。"
            : `まだ不足があります: ${gate.missing.join(" / ")}`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>初回ヒアリング</span>
        <span>{answeredCount} / {QUESTIONS.length} 問</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${(answeredCount / QUESTIONS.length) * 100}%` }}
        />
      </div>

      <h2 className="font-heading text-lg font-semibold">{question.title}</h2>
      {question.help && (
        <p className="text-xs text-muted-foreground">{question.help}</p>
      )}

      <QuestionInput question={question} pending={pending} onSubmit={submit} />

      <button
        type="button"
        disabled={pending}
        onClick={() => submit({ id: question.id, unknown: true } as AnswerPayload)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground underline hover:text-foreground"
      >
        <CircleHelp className="size-3.5" />
        {question.unknownLabel}
      </button>
    </div>
  );
}

function QuestionInput({
  question,
  pending,
  onSubmit,
}: {
  question: Question;
  pending: boolean;
  onSubmit: (p: AnswerPayload) => void;
}) {
  // 各タイプごとのローカル状態
  const [multi, setMulti] = useState<string[]>([]);
  const [schoolName, setSchoolName] = useState("");
  const [faculty, setFaculty] = useState("");
  const [examDate, setExamDate] = useState("");
  const [weekday, setWeekday] = useState(2);
  const [weekend, setWeekend] = useState(5);
  const [days, setDays] = useState<number[]>([]);
  const [retire, setRetire] = useState("");
  const [materials, setMaterials] = useState<{ subject: string; title: string }[]>([
    { subject: "", title: "" },
  ]);

  const toggle = (arr: number[] | string[], v: number | string, set: (a: never) => void) => {
    const has = (arr as (number | string)[]).includes(v);
    set((has ? (arr as (number | string)[]).filter((x) => x !== v) : [...arr, v]) as never);
  };

  switch (question.type) {
    case "single":
      return (
        <div className="flex flex-wrap gap-2">
          {question.choices!.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={pending}
              onClick={() =>
                onSubmit(mapSingle(question.id, c.value))
              }
              className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:border-primary hover:bg-primary/10"
            >
              {c.label}
            </button>
          ))}
        </div>
      );

    case "multi":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {question.choices!.map((c) => {
              const active = multi.includes(c.value);
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => toggle(multi, c.value, setMulti as never)}
                  className={cn(
                    "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/15 text-primary"
                      : "hover:border-primary/50",
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
          <Button
            disabled={pending || multi.length === 0}
            onClick={() => onSubmit(mapMulti(question.id, multi))}
          >
            次へ
          </Button>
        </div>
      );

    case "school":
      return (
        <div className="space-y-2">
          <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} placeholder="大学名(例: 京都大学)" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={faculty} onChange={(e) => setFaculty(e.target.value)} placeholder="学部(例: 工学部)" />
            <Input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} aria-label="入試日" />
          </div>
          <Button
            disabled={pending || !schoolName.trim()}
            onClick={() =>
              onSubmit({
                id: "goal.school",
                unknown: false,
                name: schoolName,
                faculty,
                examDate: examDate || null,
              })
            }
          >
            次へ
          </Button>
        </div>
      );

    case "hours":
      return (
        <div className="space-y-3">
          <label className="block text-sm">
            平日: <span className="font-bold text-primary">{weekday}h</span>
            <input type="range" min={0} max={10} step={0.5} value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </label>
          <label className="block text-sm">
            休日: <span className="font-bold text-primary">{weekend}h</span>
            <input type="range" min={0} max={14} step={0.5} value={weekend} onChange={(e) => setWeekend(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
          </label>
          <Button disabled={pending} onClick={() => onSubmit({ id: "availability.hours", unknown: false, weekday, weekend })}>
            次へ
          </Button>
        </div>
      );

    case "club":
      return (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">活動曜日(あれば)</p>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <button key={i} type="button" onClick={() => toggle(days, i, setDays as never)}
                className={cn("size-9 rounded-lg border text-sm font-bold", days.includes(i) ? "border-primary bg-primary/15 text-primary" : "")}>
                {w}
              </button>
            ))}
          </div>
          <label className="block text-sm">
            引退予定(任意)
            <Input type="month" value={retire} onChange={(e) => setRetire(e.target.value)} className="mt-1" />
          </label>
          <Button disabled={pending} onClick={() => onSubmit({ id: "availability.club", unknown: false, active: days.length > 0, retirementMonth: retire ? `${retire}-01` : null, days })}>
            次へ
          </Button>
        </div>
      );

    case "job":
      return (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <button key={i} type="button" onClick={() => toggle(days, i, setDays as never)}
                className={cn("size-9 rounded-lg border text-sm font-bold", days.includes(i) ? "border-primary bg-primary/15 text-primary" : "")}>
                {w}
              </button>
            ))}
          </div>
          <Button disabled={pending} onClick={() => onSubmit({ id: "availability.job", unknown: false, days })}>
            次へ
          </Button>
        </div>
      );

    case "materials":
      return (
        <div className="space-y-2">
          {materials.map((m, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr] gap-2">
              <Input value={m.subject} onChange={(e) => setMaterials((p) => p.map((x, j) => (j === i ? { ...x, subject: e.target.value } : x)))} placeholder="科目" />
              <Input value={m.title} onChange={(e) => setMaterials((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="教材名" />
            </div>
          ))}
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setMaterials((p) => [...p, { subject: "", title: "" }])}>
            + 教材を追加
          </button>
          <Button
            disabled={pending}
            onClick={() => onSubmit({ id: "materials.owned", unknown: false, items: materials.filter((m) => m.subject.trim() && m.title.trim()) })}
          >
            次へ
          </Button>
        </div>
      );

    case "mock":
      return (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => onSubmit({ id: "level.entry", unknown: false, hasMock: true })}>
            受けたことがある
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => onSubmit({ id: "level.entry", unknown: true })}>
            受けたことがない
          </Button>
        </div>
      );

    default:
      return null;
  }
}

function mapSingle(id: string, value: string): AnswerPayload {
  if (id === "goal.levelBand") return { id: "goal.levelBand", unknown: false, levelBand: value as LevelBand };
  if (id === "goal.grade") return { id: "goal.grade", unknown: false, grade: value as Grade };
  if (id === "traits.tone") return { id: "traits.tone", unknown: false, tone: value as "strict" | "supportive" };
  return { id: id as "goal.levelBand", unknown: true };
}

function mapMulti(id: string, values: string[]): AnswerPayload {
  if (id === "goal.admissionType") return { id: "goal.admissionType", unknown: false, types: values as AdmissionType[] };
  if (id === "goal.subjects") return { id: "goal.subjects", unknown: false, codes: values };
  return { id: id as "goal.subjects", unknown: true };
}
