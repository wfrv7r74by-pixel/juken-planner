"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpenCheck, CircleHelp, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { answerQuestion, type AnswerPayload } from "@/lib/actions/learning";
import {
  LEVEL_BANDS,
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

export function OnboardingForm({
  profile,
  onGoToPlan,
}: {
  profile: UserLearningProfile;
  onGoToPlan?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingList = useMemo(() => pendingQuestions(profile), [profile]);
  const question = pendingList[0];
  const answeredCount = profile.answeredQuestionIds.length;
  // 分母は「回答済み + 残り」の動的合計(条件分岐の質問数に追随する)
  const totalCount = answeredCount + pendingList.length;

  const submit = (payload: AnswerPayload) => {
    startTransition(async () => {
      const res = await answerQuestion(payload);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  };

  // ヒアリング完了。可処分時間(第4層)は勉強計画側の前提ステップで集めるため、
  // ここでは第1・2層(志望校・現在地)が揃えば勉強計画へ進める。
  if (!question) {
    const gate = canGeneratePlan(profile);
    const hearingMissing = gate.missing.filter((m) => !m.includes("第4層"));
    const hearingOk = hearingMissing.length === 0;
    return (
      <div className="rounded-2xl border border-success/40 bg-card p-5 text-center">
        <Sparkles className="mx-auto size-8 text-success" />
        <p className="mt-2 font-heading text-lg font-semibold">
          ヒアリング完了
        </p>
        {hearingOk ? (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              相談はここまででOKです。次は「勉強計画」で週の予定・宿題・基礎教材を入力します。
            </p>
            {onGoToPlan && (
              <Button onClick={onGoToPlan}>
                <Sparkles className="size-4" />
                勉強計画へ進む
              </Button>
            )}
          </div>
        ) : (
          <div className="mt-2 space-y-3 text-sm">
            <p className="text-muted-foreground">
              現在地(学力)がまだ分かりません。次のいずれかで解消できます:
            </p>
            <div className="rounded-xl border bg-muted/30 p-3 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/mocks"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                >
                  <BookOpenCheck className="size-3.5" />
                  模試を登録する
                </Link>
                <span className="text-xs text-muted-foreground">
                  または 英検などの資格を上のヒアリングで登録 / 診断テスト(近日対応)
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>初回ヒアリング</span>
        <span>{answeredCount} / {totalCount} 問</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${totalCount ? (answeredCount / totalCount) * 100 : 0}%` }}
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
  const [days, setDays] = useState<number[]>([]);
  const [retire, setRetire] = useState("");
  const [materials, setMaterials] = useState<{ subject: string; title: string }[]>([
    { subject: "", title: "" },
  ]);
  // 現在地の代替指標(proxy)
  const [proxyMethod, setProxyMethod] = useState<
    "cert" | "school" | "entrance"
  >("cert");
  const [certName, setCertName] = useState("英検");
  const [certGrade, setCertGrade] = useState("");
  const [band, setBand] = useState("");
  const [rank, setRank] = useState("");
  const [total, setTotal] = useState("");
  const [entranceKind, setEntranceKind] = useState<"内申点" | "得点率">("内申点");
  const [entranceScore, setEntranceScore] = useState("");

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

    case "proxy": {
      const canSubmit =
        proxyMethod === "cert"
          ? certName.trim() !== "" && certGrade.trim() !== ""
          : proxyMethod === "school"
            ? band !== "" && rank.trim() !== "" && total.trim() !== ""
            : band !== "" && entranceScore.trim() !== "";

      const bandPicker = (
        <div className="flex flex-wrap gap-2">
          {LEVEL_BANDS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setBand(c.value)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                band === c.value
                  ? "border-primary bg-primary/15 text-primary"
                  : "hover:border-primary/50",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      );

      return (
        <div className="space-y-3">
          {/* 方法の切替 */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border p-1">
            {(
              [
                { v: "cert", label: "資格(英検など)" },
                { v: "school", label: "高校の成績(高2・3)" },
                { v: "entrance", label: "高校入試(新高1)" },
              ] as const
            ).map((m) => (
              <button
                key={m.v}
                type="button"
                onClick={() => setProxyMethod(m.v)}
                className={cn(
                  "rounded-lg py-1.5 text-[11px] font-bold transition-colors sm:text-xs",
                  proxyMethod === m.v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {proxyMethod === "cert" && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={certName}
                onChange={(e) => setCertName(e.target.value)}
                aria-label="資格の種類"
                className="rounded-lg border bg-background px-3 py-2 text-sm"
              >
                {["英検", "TOEIC", "TOEFL", "その他"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Input
                value={certGrade}
                onChange={(e) => setCertGrade(e.target.value)}
                placeholder="級・スコア(例: 2級 / 650)"
              />
            </div>
          )}

          {proxyMethod === "school" && (
            <div className="space-y-2">
              {bandPicker}
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                  placeholder="学年順位(例: 40)"
                  aria-label="学年順位"
                />
                <Input
                  type="number"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="学年人数(例: 320)"
                  aria-label="学年人数"
                />
              </div>
            </div>
          )}

          {proxyMethod === "entrance" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                入学した高校の学力帯を選び、高校入試の内申点か得点率を入れてください。
              </p>
              {bandPicker}
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <select
                  value={entranceKind}
                  onChange={(e) =>
                    setEntranceKind(e.target.value as "内申点" | "得点率")
                  }
                  aria-label="指標の種類"
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                >
                  <option value="内申点">内申点</option>
                  <option value="得点率">得点率(%)</option>
                </select>
                <Input
                  type="number"
                  value={entranceScore}
                  onChange={(e) => setEntranceScore(e.target.value)}
                  placeholder={
                    entranceKind === "内申点"
                      ? "内申点(例: 38 / 45)"
                      : "得点率(例: 72)"
                  }
                  aria-label="高校入試の結果"
                />
              </div>
            </div>
          )}

          <Button
            disabled={pending || !canSubmit}
            onClick={() =>
              onSubmit(
                proxyMethod === "cert"
                  ? {
                      id: "level.proxy",
                      unknown: false,
                      certName,
                      certGrade,
                    }
                  : proxyMethod === "school"
                    ? {
                        id: "level.proxy",
                        unknown: false,
                        schoolLevelBand: band as LevelBand,
                        rank: Number(rank),
                        totalStudents: Number(total),
                      }
                    : {
                        id: "level.proxy",
                        unknown: false,
                        schoolLevelBand: band as LevelBand,
                        entranceScore: Number(entranceScore),
                        entranceLabel:
                          entranceKind === "内申点"
                            ? "高校入試(内申)"
                            : "高校入試(得点率%)",
                      },
              )
            }
          >
            次へ
          </Button>
        </div>
      );
    }

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
