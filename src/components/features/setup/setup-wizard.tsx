"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Rocket, Target } from "lucide-react";
import { toast } from "sonner";
import { completeSetup } from "@/lib/actions/setup";
import {
  EXAM_PRESETS,
  SUBJECT_PRESETS,
  templatesForSubject,
  type MaterialTemplate,
} from "@/lib/plan/presets";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PHASE_LABELS } from "@/lib/plan/engine";

interface MaterialDraft extends MaterialTemplate {
  subjectName: string;
  checked: boolean;
}

const STEP_TITLES = ["目標を決める", "科目を選ぶ", "教材を選ぶ"];

export function SetupWizard() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);

  const [examTitle, setExamTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [subjects, setSubjects] = useState<{ name: string; color: string }[]>(
    [],
  );
  const [customSubject, setCustomSubject] = useState("");
  const [drafts, setDrafts] = useState<MaterialDraft[]>([]);

  const canNext =
    step === 0
      ? examTitle.trim() !== "" && examDate !== ""
      : step === 1
        ? subjects.length > 0
        : true;

  const checkedCount = useMemo(
    () => drafts.filter((d) => d.checked).length,
    [drafts],
  );

  const toggleSubject = (name: string, color: string) => {
    setSubjects((prev) =>
      prev.some((s) => s.name === name)
        ? prev.filter((s) => s.name !== name)
        : [...prev, { name, color }],
    );
  };

  const addCustomSubject = () => {
    const name = customSubject.trim();
    if (!name || subjects.some((s) => s.name === name)) return;
    toggleSubject(name, "#64748b");
    setCustomSubject("");
  };

  const goToMaterials = () => {
    // 選択済み科目からテンプレートを生成(既存の編集は保持)
    setDrafts((prev) => {
      const next: MaterialDraft[] = [];
      for (const s of subjects) {
        const existing = prev.filter((d) => d.subjectName === s.name);
        if (existing.length > 0) {
          next.push(...existing);
        } else {
          next.push(
            ...templatesForSubject(s.name).map((t) => ({
              ...t,
              subjectName: s.name,
              checked: t.recommended,
            })),
          );
        }
      }
      return next;
    });
    setStep(2);
  };

  const submit = () => {
    startTransition(async () => {
      const res = await completeSetup({
        examTitle,
        examDate,
        subjects,
        materials: drafts
          .filter((d) => d.checked)
          .map((d) => ({
            subjectName: d.subjectName,
            title: d.title,
            total_units: d.total_units,
            unit_label: d.unit_label,
            minutes_per_unit: d.minutes_per_unit,
            phase: d.phase,
          })),
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("学習プランを作成しました!");
        router.push("/");
        router.refresh();
      }
    });
  };

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      {/* ステップインジケーター */}
      <div className="flex items-center justify-center gap-2">
        {STEP_TITLES.map((title, i) => (
          <div key={title} className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-xs font-bold transition-colors",
                i < step
                  ? "bg-success text-success-foreground"
                  : i === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i === step ? "font-bold" : "text-muted-foreground",
              )}
            >
              {title}
            </span>
            {i < STEP_TITLES.length - 1 && (
              <span className="w-4 border-t border-border" />
            )}
          </div>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="space-y-6 p-6">
          {step === 0 && (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <Target className="mx-auto size-8 text-primary" />
                <h2 className="text-xl font-bold">本命の試験はどれ?</h2>
                <p className="text-sm text-muted-foreground">
                  この日から逆算して毎日のやることを自動で決めます
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {EXAM_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setExamTitle(p.title);
                      setExamDate(p.date);
                    }}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left transition-all hover:border-primary/60",
                      examTitle === p.title
                        ? "border-primary bg-primary/5"
                        : "border-border",
                    )}
                  >
                    <p className="font-bold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.date}</p>
                  </button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="setup-title">試験名(編集可)</Label>
                  <Input
                    id="setup-title"
                    value={examTitle}
                    onChange={(e) => setExamTitle(e.target.value)}
                    placeholder="○○大学 一般入試"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setup-date">試験日(編集可)</Label>
                  <Input
                    id="setup-date"
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-bold">受験する科目は?</h2>
                <p className="text-sm text-muted-foreground">
                  タップして選択(あとから追加・削除できます)
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUBJECT_PRESETS.map((s) => {
                  const active = subjects.some((x) => x.name === s.name);
                  return (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => toggleSubject(s.name, s.color)}
                      className={cn(
                        "rounded-full border-2 px-4 py-2 text-sm font-bold transition-all",
                        active
                          ? "border-transparent text-white shadow-md"
                          : "border-border text-muted-foreground hover:border-primary/50",
                      )}
                      style={active ? { backgroundColor: s.color } : undefined}
                    >
                      {active && <Check className="mr-1 inline size-3.5" />}
                      {s.name}
                    </button>
                  );
                })}
              </div>
              <div className="mx-auto flex max-w-xs gap-2">
                <Input
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder="その他の科目名"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomSubject();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={addCustomSubject}>
                  追加
                </Button>
              </div>
              {subjects.some(
                (s) => !SUBJECT_PRESETS.some((p) => p.name === s.name),
              ) && (
                <p className="text-center text-sm text-muted-foreground">
                  追加済み:{" "}
                  {subjects
                    .filter(
                      (s) => !SUBJECT_PRESETS.some((p) => p.name === s.name),
                    )
                    .map((s) => s.name)
                    .join("、")}
                </p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="space-y-1 text-center">
                <h2 className="text-xl font-bold">使う教材を選ぼう</h2>
                <p className="text-sm text-muted-foreground">
                  定番の組み合わせを用意しました。量は目安なのであとで調整できます
                </p>
              </div>
              <div className="space-y-4">
                {subjects.map((s) => (
                  <div key={s.name} className="space-y-2">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.name}
                    </p>
                    <div className="space-y-1.5">
                      {drafts
                        .filter((d) => d.subjectName === s.name)
                        .map((d) => (
                          <label
                            key={`${d.subjectName}-${d.title}`}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                              d.checked
                                ? "border-primary/50 bg-primary/5"
                                : "opacity-60",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={d.checked}
                              onChange={() =>
                                setDrafts((prev) =>
                                  prev.map((x) =>
                                    x.subjectName === d.subjectName &&
                                    x.title === d.title
                                      ? { ...x, checked: !x.checked }
                                      : x,
                                  ),
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 text-sm font-medium">
                              {d.title}
                            </span>
                            <span className="whitespace-nowrap text-xs text-muted-foreground">
                              {d.total_units}
                              {d.unit_label}・{PHASE_LABELS[d.phase]}
                            </span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ナビゲーション */}
          <div className="flex items-center justify-between border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className={step === 0 ? "invisible" : undefined}
            >
              <ArrowLeft className="size-4" /> 戻る
            </Button>
            {step < 2 ? (
              <Button
                type="button"
                disabled={!canNext}
                onClick={() => (step === 1 ? goToMaterials() : setStep(step + 1))}
              >
                次へ <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={pending}>
                <Rocket className="size-4" />
                {pending
                  ? "プラン作成中..."
                  : `この${checkedCount}冊でプランを作る`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
