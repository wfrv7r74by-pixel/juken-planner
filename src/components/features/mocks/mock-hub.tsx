"use client";

import { useState } from "react";
import { FilePlus2, TrendingUp } from "lucide-react";
import { MockRegister } from "@/components/features/mocks/mock-register";
import { MockRecords } from "@/components/features/mocks/mock-records";
import { cn } from "@/lib/utils";
import type { MockExam, MockSubject } from "@/types/database";

const TABS = [
  { id: "register", label: "登録", icon: FilePlus2 },
  { id: "records", label: "記録・推移", icon: TrendingUp },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function MockHub({
  userId,
  mocks,
  subjectsByMock,
}: {
  userId: string;
  mocks: MockExam[];
  subjectsByMock: Record<string, MockSubject[]>;
}) {
  const [tab, setTab] = useState<TabId>(mocks.length > 0 ? "records" : "register");

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
          </button>
        ))}
      </div>

      {tab === "register" ? (
        <MockRegister userId={userId} />
      ) : (
        <MockRecords mocks={mocks} subjectsByMock={subjectsByMock} />
      )}
    </div>
  );
}
