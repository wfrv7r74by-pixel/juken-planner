"use client";

import { useState } from "react";
import { CalendarRange, MessageCircle } from "lucide-react";
import { ChatPanel } from "@/components/features/chat/chat-panel";
import { MilestoneManager } from "@/components/features/settings/milestone-manager";
import { PhaseManager } from "@/components/features/settings/phase-manager";
import { cn } from "@/lib/utils";
import type { ChatMessage, Milestone, StudyPhase } from "@/types/database";

const TABS = [
  { id: "chat", label: "相談", icon: MessageCircle },
  { id: "data", label: "計画データ", icon: CalendarRange },
] as const;

type TabId = (typeof TABS)[number]["id"];

/** AI相談 + 計画データ管理を1画面に統合するハブ */
export function AiHub({
  messages,
  milestones,
  phases,
}: {
  messages: ChatMessage[];
  milestones: Milestone[];
  phases: StudyPhase[];
}) {
  const [tab, setTab] = useState<TabId>("chat");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl border bg-card p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-bold transition-colors",
              tab === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "chat" ? (
        <ChatPanel messages={messages} />
      ) : (
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
