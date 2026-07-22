"use client";

import { useRef, useState, useTransition } from "react";
import {
  BookMarked,
  GraduationCap,
  ImagePlus,
  Lightbulb,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { deleteGrading, submitGrading } from "@/lib/actions/grading";
import { addReviewItemsFromGrading } from "@/lib/actions/review";
import { createClient } from "@/lib/supabase/client";
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

function ResultCard({
  result,
  subject,
}: {
  result: GradingResult;
  subject?: GradingSubject;
}) {
  const [added, setAdded] = useState(false);
  const [pending, startTransition] = useTransition();

  const onAddReview = () => {
    startTransition(async () => {
      const res = await addReviewItemsFromGrading({
        subject: subject ?? "other",
        topics: result.reviewTopics,
      });
      if (res.error) toast.error(res.error);
      else {
        setAdded(true);
        toast.success("復習リストに追加しました");
      }
    });
  };

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
        <div className="rounded-xl bg-secondary p-3">
          <div className="flex items-start gap-2">
            <BookMarked className="mt-0.5 size-4 shrink-0 text-phase-basic" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-phase-basic">
                復習すべき単元(高校範囲)
              </p>
              <p className="mt-0.5 text-sm">{result.reviewTopics.join(" / ")}</p>
            </div>
          </div>
          {subject !== undefined && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={pending || added}
              onClick={onAddReview}
            >
              {added ? (
                "復習リストに追加済み"
              ) : (
                <>
                  <BookMarked className="size-4" /> 復習リストに追加
                </>
              )}
            </Button>
          )}
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

export function GradingPanel({
  history,
  userId,
}: {
  history: GradingRecord[];
  userId: string;
}) {
  const [subject, setSubject] = useState<GradingSubject>("math");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [rubric, setRubric] = useState("");
  const [showRubric, setShowRubric] = useState(false);
  const [result, setResult] = useState<GradingResult | null>(null);
  const [gradedSubject, setGradedSubject] = useState<GradingSubject>("math");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [grading, startGrading] = useTransition();
  const [deleting, startDelete] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("画像ファイルを選択してください。");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("画像は8MB以内にしてください。");
      return;
    }
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("answers")
        .upload(path, file, { contentType: file.type });
      if (error) {
        toast.error("画像のアップロードに失敗しました。");
        return;
      }
      setImagePath(path);
      setImagePreview(URL.createObjectURL(file));
    } finally {
      setUploading(false);
    }
  };

  const clearImage = () => {
    setImagePath(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const onGrade = () => {
    if (!question.trim() || (!answer.trim() && !imagePath) || grading) return;
    setResult(null);
    startGrading(async () => {
      const res = await submitGrading({
        subject,
        question,
        answer,
        rubric,
        imagePath: imagePath ?? undefined,
      });
      if (res.error) {
        toast.error(res.error);
      } else if (res.result) {
        setResult(res.result);
        setGradedSubject(subject);
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
            placeholder="自分の答案を入力(途中式・論証も含めて書くほど採点が正確になります)。写真だけでもOK"
          />
          {/* 答案写真のアップロード */}
          {imagePreview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="答案プレビュー"
                className="max-h-48 rounded-lg border"
              />
              <button
                type="button"
                onClick={clearImage}
                className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-destructive text-white"
                aria-label="画像を削除"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              手書き答案の写真をアップロード
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onPickImage(file);
            }}
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
          disabled={
            grading || uploading || !question.trim() || (!answer.trim() && !imagePath)
          }
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

      {result && <ResultCard result={result} subject={gradedSubject} />}

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
                <ResultCard
                  result={rec.result}
                  subject={rec.subject as GradingSubject}
                />
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
