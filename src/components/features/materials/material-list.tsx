"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Circle, CircleCheck, CircleDot, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cycleSectionStatus, deleteMaterial } from "@/lib/actions/masters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Material, MaterialSection, Subject } from "@/types/database";

const STATUS_META = {
  todo: { icon: Circle, label: "未着手", className: "text-muted-foreground" },
  doing: { icon: CircleDot, label: "進行中", className: "text-primary" },
  done: { icon: CircleCheck, label: "完了", className: "text-success" },
} as const;

export function MaterialList({
  materials,
  sections,
  subjects,
}: {
  materials: Material[];
  sections: MaterialSection[];
  subjects: Subject[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const subjectById = new Map(subjects.map((s) => [s.id, s]));
  const sectionsByMaterial = new Map<string, MaterialSection[]>();
  for (const s of sections) {
    sectionsByMaterial.set(s.material_id, [
      ...(sectionsByMaterial.get(s.material_id) ?? []),
      s,
    ]);
  }

  const onCycle = (id: string) => {
    startTransition(async () => {
      const res = await cycleSectionStatus(id);
      if (res.error) toast.error(res.error);
    });
  };

  const onDelete = (material: Material) => {
    if (!confirm(`「${material.title}」と章の進捗を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deleteMaterial(material.id);
      if (res.error) toast.error(res.error);
      else toast.success("削除しました");
    });
  };

  return (
    <div className="space-y-3">
      {materials.map((material) => {
        const subject = subjectById.get(material.subject_id);
        const materialSections = (
          sectionsByMaterial.get(material.id) ?? []
        ).sort((a, b) => a.sort_order - b.sort_order);
        const done = materialSections.filter((s) => s.status === "done").length;
        const total = materialSections.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isOpen = openId === material.id;

        return (
          <div key={material.id} className="rounded-2xl border bg-card">
            <button
              type="button"
              onClick={() => setOpenId(isOpen ? null : material.id)}
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              {subject && (
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white"
                  style={{ backgroundColor: subject.color }}
                >
                  {subject.name}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {material.title}
                  {material.fit_score && (
                    <span className="ml-2 text-xs font-medium text-primary">
                      適合 {"★".repeat(material.fit_score)}
                      <span className="text-muted-foreground/60">
                        {"★".repeat(5 - material.fit_score)}
                      </span>
                    </span>
                  )}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-success"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {done}/{total}章({pct}%)
                  </span>
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="border-t px-4 pb-4">
                {material.fit_comment && (
                  <p className="mt-3 rounded-xl bg-secondary p-3 text-xs text-muted-foreground">
                    <span className="font-bold text-primary">AI評価: </span>
                    {material.fit_comment}
                  </p>
                )}
                <ul className="divide-y divide-border/50">
                  {materialSections.map((section) => {
                    const meta = STATUS_META[section.status];
                    const Icon = meta.icon;
                    return (
                      <li key={section.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onCycle(section.id)}
                          className="flex w-full items-center gap-2.5 py-2 text-left"
                          title="タップで 未着手→進行中→完了 を切り替え"
                        >
                          <Icon className={cn("size-4.5 shrink-0", meta.className)} />
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm",
                              section.status === "done" &&
                                "text-muted-foreground line-through",
                            )}
                          >
                            {section.title}
                          </span>
                          <span className={cn("text-[10px] font-bold", meta.className)}>
                            {meta.label}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                  {materialSections.length === 0 && (
                    <li className="py-3 text-sm text-muted-foreground">
                      章が登録されていません。
                    </li>
                  )}
                </ul>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => onDelete(material)}
                  className="mt-2 text-destructive"
                >
                  <Trash2 className="size-4" /> この教材を削除
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
