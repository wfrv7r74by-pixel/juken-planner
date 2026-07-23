"use client";

import { useState } from "react";
import { CalendarRange, ClipboardList, MessageCircle } from "lucide-react";
import { ChatPanel } from "@/components/features/chat/chat-panel";
import { OnboardingForm } from "@/components/features/learning/onboarding-form";
import { MilestoneManager } from "@/components/features/settings/milestone-manager";
import { PhaseManager } from "@/components/features/settings/phase-manager";
import { pendingQuestions } from "@/lib/learning/questions";
import { cn } from "@/lib/utils";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { ChatMessage, Milestone, StudyPhase } from "@/types/database";

const TABS = [
  { id: "hearing", label: "学習相談", icon: ClipboardList },
  { id: "chat", label: "相談チャット", icon: MessageCircle },
  { id: "data", label: "計画データ", icon: CalendarRange },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** 学習相談(ヒアリング)+ AI相談 + 計画データ管理を1画面に統合するハブ */
export function AiHub({
  messages,
  milestones,
  phases,
  profile,
}: {
  messages: ChatMessage[];
  milestones: Milestone[];
  phases: StudyPhase[];
  profile: UserLearningProfile;
}) {
  const hearingPending = pendingQuestions(profile).length > 0;
  const [tab, setTab] = useState<TabId>(hearingPending ? "hearing" : "chat");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-2xl border bg-card p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition-colors sm:text-sm",
              tab === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
            {id === "hearing" && hearingPending && (
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  tab === id ? "bg-primary-foreground" : "bg-primary",
                )}
              />
            )}
          </button>
        ))}
      </div>

      {tab === "hearing" && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            最初に数問だけ答えてください。答えるほど計画の精度が上がります。
            「わからない」で飛ばしてもOK(あとで週次相談で少しずつ埋めます)。
          </p>
          <OnboardingForm profile={profile} />
        </div>
      )}

      {tab === "chat" && <ChatPanel messages={messages} />}

      {tab === "data" && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            AI の提案を「反映」すると自動でここに登録されます。手動で細かく調整したい場合に使ってください。
          </p>
          <MilestoneManager milestones={milestones} />
          <PhaseManager phases={phases} />
        </div>
      )}
    </div>
  );
}
