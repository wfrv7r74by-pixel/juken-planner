"use client";

import { useState } from "react";
import { ListChecks, PenLine } from "lucide-react";
import { GradingPanel } from "@/components/features/grading/grading-panel";
import { ReviewList } from "@/components/features/grading/review-list";
import { cn } from "@/lib/utils";
import type { GradingRecord, ReviewItem } from "@/types/database";

const TABS = [
  { id: "grade", label: "採点", icon: PenLine },
  { id: "review", label: "復習リスト", icon: ListChecks },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function GradingHub({
  userId,
  history,
  reviewItems,
}: {
  userId: string;
  history: GradingRecord[];
  reviewItems: ReviewItem[];
}) {
  const [tab, setTab] = useState<TabId>("grade");
  const todoCount = reviewItems.filter((i) => i.status === "todo").length;

  return (
    <div className="space-y-4">
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
            {id === "review" && todoCount > 0 && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 text-xs",
                  tab === id ? "bg-primary-foreground/20" : "bg-primary/20 text-primary",
                )}
              >
                {todoCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "grade" ? (
        <GradingPanel history={history} userId={userId} />
      ) : (
        <ReviewList items={reviewItems} />
      )}
    </div>
  );
}
