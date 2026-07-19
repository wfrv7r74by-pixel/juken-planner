"use client";

import { useState, useTransition } from "react";
import { BookPlus, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  confirmMaterial,
  searchMaterial,
} from "@/lib/actions/material-search";
import type { MaterialLookup } from "@/lib/ai/material-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MaterialSearch() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MaterialLookup | null>(null);
  const [subject, setSubject] = useState("");
  const [searching, startSearch] = useTransition();
  const [adding, startAdd] = useTransition();

  const onSearch = () => {
    if (!query.trim() || searching) return;
    startSearch(async () => {
      const res = await searchMaterial(query);
      if (res.error) {
        toast.error(res.error);
      } else if (res.result) {
        setResult(res.result);
        setSubject(res.result.subject);
      }
    });
  };

  const onConfirm = () => {
    if (!result) return;
    startAdd(async () => {
      const res = await confirmMaterial({
        subject: subject.trim() || result.subject,
        title: result.title,
        sections: result.sections,
        fit_score: result.fit_score,
        fit_comment: result.fit_comment,
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success(`「${result.title}」を追加しました`);
        setResult(null);
        setQuery("");
      }
    });
  };

  return (
    <div className="space-y-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="教材名で検索(例: システム英単語)"
            className="pl-9"
            disabled={searching}
          />
        </div>
        <Button type="submit" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : "検索"}
        </Button>
      </form>
      {searching && (
        <p className="text-xs text-muted-foreground">
          Web で目次を調べて、教科を自動分類しています…(10〜30秒)
        </p>
      )}

      {result && (
        <div className="space-y-3 rounded-2xl border border-primary/40 bg-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-heading font-semibold">{result.title}</p>
              {result.note && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {result.note}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="閉じる"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">教科(自動分類)</span>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 w-28"
              aria-label="教科"
            />
          </div>

          {result.fit_score && (
            <div className="rounded-xl bg-secondary p-3">
              <p className="text-xs font-bold text-primary">
                目標適合度 {"★".repeat(result.fit_score)}
                <span className="text-muted-foreground">
                  {"★".repeat(5 - result.fit_score)}
                </span>
              </p>
              {result.fit_comment && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {result.fit_comment}
                </p>
              )}
            </div>
          )}

          <div className="max-h-44 overflow-y-auto rounded-xl border p-3">
            <p className="mb-1.5 text-xs text-muted-foreground">
              全{result.sections.length}章
            </p>
            <ol className="list-inside list-decimal space-y-0.5 text-sm">
              {result.sections.map((s, i) => (
                <li key={i} className="truncate">
                  {s}
                </li>
              ))}
            </ol>
          </div>

          <Button onClick={onConfirm} disabled={adding} className="w-full">
            {adding ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <BookPlus className="size-4" />
            )}
            この内容で追加する
          </Button>
        </div>
      )}
    </div>
  );
}
