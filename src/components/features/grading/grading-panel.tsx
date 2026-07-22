"use client";

import { useState, useTransition } from "react";
import {
  BookMarked,
  GraduationCap,
  Lightbulb,
  Loader2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { deleteGrading, submitGrading } from "@/lib/actions/grading";
import {
  GRADING_SUBJECT_LABELS,
  type GradingResult,
  type GradingSubject,
} from "@/lib/grading/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { GradingRecord } from "@/types/database";

const SUBJECT_ORDER: GradingSubject[] = [
  "math",
  "english",
  "physics",
  "chemistry",
  "biology",
  "japanese",
  "other",
];

function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-primary";
  return "text-destructive";
}

function ResultCard({ result }: { result: GradingResult }) {
  return (
    <div className="space-y-4 rounded-2xl border border-primary/40 bg-card p-5">
      <div className="flex items-center gap-4">
        <div className={cn("font-heading text-4xl font-semibold", scoreColor(result.score))}>
          {result.score}
          <span className="text-lg text-muted-foreground">点</span>
        </div>
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          {result.verdict}
        </p>
      </div>

      {result.breakdown && result.breakdown.length > 0 && (
        <div className="space-y-1.5">
          {result.breakdown.map((b, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{b.point}</span>
              <span className="font-mono text-muted-foreground">
                {b.earned}/{b.max}
              </span>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-bold text-muted-foreground">添削</p>
        <p className="whitespace-pre-wrap text-sm">{result.feedback}</p>
      </div>

      {result.reviewTopics.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-secondary p-3">
          <BookMarked className="mt-0.5 size-4 shrink-0 text-phase-basic" />
          <div>
            <p className="text-xs font-bold text-phase-basic">復習すべき単元(高校範囲)</p>
            <p className="mt-0.5 text-sm">{result.reviewTopics.join(" / ")}</p>
          </div>
        </div>
      )}

      {result.advancedSkills && result.advancedSkills.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-milestone/40 bg-milestone/5 p-3">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-milestone" />
          <div>
            <p className="text-xs font-bold text-milestone">
              注目ポイント(高校では習わないが難関大で必要)
            </p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
              {result.advancedSkills.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {result.universityContext && (
        <div className="flex items-start gap-2 rounded-xl border border-phase-advance/40 bg-phase-advance/5 p-3">
          <GraduationCap className="mt-0.5 size-4 shrink-0 text-phase-advance" />
          <div>
            <p className="text-xs font-bold text-phase-advance">
              +α 大学範囲の背景
            </p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm">
              {result.universityContext}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function GradingPanel({ history }: { history: GradingRecord[] }) {
  const [subject, setSubject] = useState<GradingSubject>("math");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [rubric, setRubric] = useState("");
  const [showRubric, setShowRubric] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [grading, startGrading] = useTransition();
  const [deleting, startDelete] = useTransition();

  const onGrade = () => {
    if (!question.trim() || !answer.trim() || grading) return;
    setResult(null);
    startGrading(async () => {
      const res = await submitGrading({ subject, question, answer, rubric });
      if (res.error) {
        toast.error(res.error);
      } else if (res.result) {
        setResult(res.result);
        toast.success("採点しました");
      }
    });
  };

  const onDelete = (id: string) => {
    startDelete(async () => {
      const res = await deleteGrading(id);
      if (res.error) toast.error(res.error);
    });
  };

  return (
    <div className="space-y-5">
      {/* 入力フォーム */}
      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_ORDER.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSubject(s)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
                subject === s
                  ? "border-primary bg-primary/15 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {GRADING_SUBJECT_LABELS[s]}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="g-question" className="text-sm font-bold">
            問題文
          </label>
          <Textarea
            id="g-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="問題文を貼り付け(数式は文字でOK: x^2, √, ∫ など)"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="g-answer" className="text-sm font-bold">
            あなたの解答
          </label>
          <Textarea
            id="g-answer"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={5}
            placeholder="自分の答案を入力(途中式・論証も含めて書くほど採点が正確になります)"
          />
        </div>

        {showRubric ? (
          <div className="space-y-1.5">
            <label htmlFor="g-rubric" className="text-sm font-bold">
              模範解答・配点(任意)
            </label>
            <Textarea
              id="g-rubric"
              value={rubric}
              onChange={(e) => setRubric(e.target.value)}
              rows={3}
              placeholder="分かる場合のみ。無くても採点できます"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowRubric(true)}
            className="text-xs text-muted-foreground underline"
          >
            + 模範解答・配点を追加(任意)
          </button>
        )}

        <Button
          onClick={onGrade}
          disabled={grading || !question.trim() || !answer.trim()}
          className="w-full"
        >
          {grading ? (
            <>
              <Loader2 className="size-4 animate-spin" /> 採点中…(10〜30秒)
            </>
          ) : (
            <>
              <Sparkles className="size-4" /> AI に採点してもらう
            </>
          )}
        </Button>
      </div>

      {result && <ResultCard result={result} />}

      {/* 履歴 */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground">採点履歴</h2>
          {history.map((rec) => (
            <details key={rec.id} className="rounded-xl border bg-card">
              <summary className="flex cursor-pointer items-center gap-3 p-3">
                <span
                  className={cn(
                    "font-heading text-lg font-semibold",
                    scoreColor(rec.score),
                  )}
                >
                  {rec.score}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="text-xs text-primary">
                    {GRADING_SUBJECT_LABELS[
                      rec.subject as GradingSubject
                    ] ?? rec.subject}
                  </span>{" "}
                  {rec.question.slice(0, 40)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {rec.created_at.slice(5, 10).replace("-", "/")}
                </span>
              </summary>
              <div className="border-t px-3 pb-3 pt-2">
                <ResultCard result={rec.result} />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={deleting}
                  onClick={() => onDelete(rec.id)}
                  className="mt-2 text-destructive"
                >
                  <Trash2 className="size-4" /> この採点を削除
                </Button>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
