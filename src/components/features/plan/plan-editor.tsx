"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteRoadmapDivision,
  updateRoadmapDivisions,
} from "@/lib/actions/roadmap";
import { PrerequisitesForm } from "@/components/features/plan/prerequisites-form";
import { DIVISION_NAME, type DivisionKind } from "@/lib/learning/roadmap";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { StudyRoadmapRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DivEdit {
  kind: DivisionKind;
  startDate: string;
  endDate: string;
}

export function PlanEditor({
  profile,
  roadmap,
  materials,
  lifeBlocks,
}: {
  profile: UserLearningProfile;
  roadmap: StudyRoadmapRow;
  materials: { subject: string; title: string }[];
  lifeBlocks: {
    weekday: number;
    startTime: string;
    endTime: string;
    title: string;
  }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"schedule" | "divisions">("schedule");
  const [divs, setDivs] = useState<DivEdit[]>(() =>
    roadmap.roadmap.divisions.map((d) => ({
      kind: d.kind,
      startDate: d.startDate,
      endDate: d.endDate,
    })),
  );

  const updateDiv = (kind: DivisionKind, patch: Partial<DivEdit>) =>
    setDivs((ds) => ds.map((d) => (d.kind === kind ? { ...d, ...patch } : d)));

  const saveDivs = () =>
    startTransition(async () => {
      const res = await updateRoadmapDivisions(divs);
      if (res.error) toast.error(res.error);
      else {
        toast.success("区分の期間を更新しました");
        router.refresh();
      }
    });

  const removeDiv = (kind: DivisionKind) => {
    if (!confirm(`「${DIVISION_NAME[kind]}」の区分を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deleteRoadmapDivision(kind);
      if (res.error) toast.error(res.error);
      else {
        toast.success("区分を削除しました");
        setDivs((ds) => ds.filter((d) => d.kind !== kind));
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4">
      <div className="grid grid-cols-2 gap-1 rounded-xl border p-1">
        {(
          [
            { v: "schedule", label: "予定・宿題" },
            { v: "divisions", label: "区分の期間" },
          ] as const
        ).map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setTab(t.v)}
            className={cn(
              "rounded-lg py-1.5 text-xs font-bold transition-colors",
              tab === t.v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "schedule" ? (
        <PrerequisitesForm
          profile={profile}
          materials={materials}
          initialFixedBlocks={lifeBlocks}
          saveLabel="予定・宿題を更新"
        />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            各区分の開始・終了を調整できます。区分を削除すると空いた期間は隣の区分が吸収します。
            (月・週目標の文言は簡易表示に更新されます。再生成でAI文言に戻せます)
          </p>
          <ul className="space-y-2">
            {divs.map((d) => (
              <li
                key={d.kind}
                className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl border p-2"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <CalendarClock className="size-3.5 text-muted-foreground" />
                    {DIVISION_NAME[d.kind]}
                  </p>
                  <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1">
                    <Input
                      type="date"
                      value={d.startDate}
                      onChange={(e) => updateDiv(d.kind, { startDate: e.target.value })}
                      aria-label="開始日"
                    />
                    <span className="text-center text-xs text-muted-foreground">〜</span>
                    <Input
                      type="date"
                      value={d.endDate}
                      onChange={(e) => updateDiv(d.kind, { endDate: e.target.value })}
                      aria-label="終了日"
                    />
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={pending || divs.length <= 1}
                  onClick={() => removeDiv(d.kind)}
                  aria-label="区分を削除"
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
          <Button className="w-full" disabled={pending} onClick={saveDivs}>
            <Save className="size-4" /> 区分の期間を保存
          </Button>
        </div>
      )}
    </div>
  );
}
