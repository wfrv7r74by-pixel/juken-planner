"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  resolveDivisionMaterials,
  suggestDivisionMaterials,
} from "@/lib/actions/roadmap";
import {
  confirmMaterial,
  quickAddMaterial,
  searchMaterial,
} from "@/lib/actions/material-search";
import type { MaterialLookup } from "@/lib/ai/material-search";
import type { DivisionKind } from "@/lib/learning/roadmap";
import type { StudyRoadmapRow } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 現区分の「抽象概念 → 具体的参考書」提案カード(第2弾・節目提案) */
export function DivisionMaterials({
  roadmap,
  divisionKind,
  divisionName,
}: {
  roadmap: StudyRoadmapRow;
  divisionKind: DivisionKind;
  divisionName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<MaterialLookup | null>(null);

  const step = roadmap.roadmap.materialSteps.find(
    (s) => s.divisionKind === divisionKind,
  );

  const suggest = () =>
    startTransition(async () => {
      const res = await suggestDivisionMaterials(divisionKind);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });

  const addBook = (title: string) => {
    setAdding(title);
    startTransition(async () => {
      const res = await quickAddMaterial(title);
      setAdding(null);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`「${title}」を教材に追加しました`);
        router.refresh();
      }
    });
  };

  const complete = () =>
    startTransition(async () => {
      const res = await resolveDivisionMaterials(divisionKind);
      if (res.error) toast.error(res.error);
      else {
        toast.success("この区分の教材選択を完了しました");
        router.refresh();
      }
    });

  const runSearch = () => {
    if (!query.trim()) return;
    setSearching(true);
    setResult(null);
    startTransition(async () => {
      const res = await searchMaterial(query.trim());
      setSearching(false);
      if (res.error) toast.error(res.error);
      else setResult(res.result);
    });
  };

  const addSearched = () => {
    if (!result) return;
    startTransition(async () => {
      const res = await confirmMaterial({
        subject: result.subject,
        title: result.title,
        sections: result.sections,
        fit_score: result.fit_score,
        fit_comment: result.fit_comment,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(`「${result.title}」を追加しました`);
        setResult(null);
        setQuery("");
        router.refresh();
      }
    });
  };

  // 完了済み: 小さく表示
  if (step?.resolved) {
    return (
      <div className="rounded-2xl border bg-card p-4 text-sm">
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <Check className="size-4 text-success" />
          {divisionName}の教材は選択済み。
          <Link href="/materials" className="text-primary underline">
            教材ページで変更
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-primary/30 bg-card p-4">
      <div>
        <p className="flex items-center gap-1.5 font-heading font-semibold">
          <BookOpen className="size-4 text-primary" />
          {divisionName}の教材を決めよう
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          到達目標に合う定番の参考書です。使う本を追加してください(計画後もいつでも追加できます)。
        </p>
      </div>

      {/* 提案がまだ無ければ生成 */}
      {!step ? (
        <Button disabled={pending} onClick={suggest}>
          <Sparkles className="size-4" />
          {pending ? "提案中…" : "この区分の参考書を提案してもらう"}
        </Button>
      ) : (
        <>
          <ul className="space-y-3">
            {step.suggestions.map((s, i) => (
              <li key={i} className="rounded-xl bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{s.subject}</span>{" "}
                  — {s.concept}
                </p>
                <ul className="mt-2 space-y-1.5">
                  {s.books.map((b) => (
                    <li
                      key={b.title}
                      className="flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{b.title}</p>
                        <p className="text-xs text-muted-foreground">{b.reason}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => addBook(b.title)}
                      >
                        {adding === b.title ? (
                          "追加中…"
                        ) : (
                          <>
                            <Plus className="size-3.5" /> 追加
                          </>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {step.suggestions.length === 0 && (
              <li className="text-xs text-muted-foreground">
                提案が得られませんでした。下の検索から追加してください。
              </li>
            )}
          </ul>

          {/* 自分の教材を検索して追加 */}
          <div className="rounded-xl border p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">
              使いたい本が無い場合は検索して追加
            </p>
            <div className="flex gap-1.5">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="教材名(例: 入門英文解釈の技術70)"
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
              />
              <Button variant="outline" disabled={pending || searching} onClick={runSearch}>
                <Search className="size-4" />
                {searching ? "検索中…" : "検索"}
              </Button>
            </div>
            {result && (
              <div className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-muted/40 p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {result.subject} / {result.title}
                  </p>
                  {result.fit_comment && (
                    <p className="text-xs text-muted-foreground">
                      {result.fit_comment}
                    </p>
                  )}
                </div>
                <Button size="sm" disabled={pending} onClick={addSearched}>
                  <Plus className="size-3.5" /> 追加
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Link
              href="/materials"
              className="text-xs text-primary underline"
            >
              教材ページで詳しく管理
            </Link>
            <Button size="sm" variant="ghost" disabled={pending} onClick={complete}>
              <Check className="size-4" /> この区分は完了
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
