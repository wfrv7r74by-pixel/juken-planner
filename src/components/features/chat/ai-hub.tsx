"use client";

import { useState } from "react";
import { CalendarCheck, ClipboardList } from "lucide-react";
import { OnboardingForm } from "@/components/features/learning/onboarding-form";
import { PrerequisitesForm } from "@/components/features/plan/prerequisites-form";
import { RoadmapView } from "@/components/features/plan/roadmap-view";
import { pendingQuestions } from "@/lib/learning/questions";
import { hasAvailabilityLayer } from "@/lib/learning/profile";
import { cn } from "@/lib/utils";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { RoutineBlock, StudyRoadmapRow, Subject } from "@/types/database";

const STEPS = [
  { id: "consult", label: "相談", icon: ClipboardList },
  { id: "plan", label: "勉強計画", icon: CalendarCheck },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/**
 * 「相談 → 勉強計画」の2ステップ一本道。
 * ① 相談: 初回ヒアリング(志望校・現在地などの情報収集)。
 * ② 勉強計画: 前提入力(固定予定・宿題・基礎教材)→ 区分ロードマップ＋今週の計画。
 */
export function AiHub({
  profile,
  roadmap,
  weekBlocks,
  subjects,
  materials,
  lifeBlocks,
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
}) {
  const hearingPending = pendingQuestions(profile).length > 0;
  const prereqDone = hasAvailabilityLayer(profile);
  const [step, setStep] = useState<StepId>(
    hearingPending ? "consult" : "plan",
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* ステップ切替 */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border bg-card p-1">
        {STEPS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            type="button"
            onClick={() => setStep(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-colors",
              step === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-5 items-center justify-center rounded-full text-xs",
                step === id ? "bg-primary-foreground/20" : "bg-muted",
              )}
            >
              {i + 1}
            </span>
            <Icon className="size-4" />
            {label}
            {id === "consult" && hearingPending && (
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  step === id ? "bg-primary-foreground" : "bg-primary",
                )}
              />
            )}
          </button>
        ))}
      </div>

      {step === "consult" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            まず数問だけ答えてください。答えるほど計画の精度が上がります。
            「わからない」で飛ばしてもOK(あとで少しずつ埋められます)。
          </p>
          <OnboardingForm profile={profile} onGoToPlan={() => setStep("plan")} />
        </div>
      )}

      {step === "plan" &&
        (!prereqDone ? (
          <PrerequisitesForm profile={profile} materials={materials} />
        ) : (
          <RoadmapView
            profile={profile}
            roadmap={roadmap}
            weekBlocks={weekBlocks}
            subjects={subjects}
            materials={materials}
            lifeBlocks={lifeBlocks}
            onGoToConsult={() => setStep("consult")}
          />
        ))}
    </div>
  );
}
