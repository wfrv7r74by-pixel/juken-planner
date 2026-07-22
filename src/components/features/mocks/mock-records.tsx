"use client";

import { useTransition } from "react";
import { BookMarked, Lightbulb, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteMock } from "@/lib/actions/mock";
import { addReviewItemsFromMock } from "@/lib/actions/review";
import { DeviationTrend } from "@/components/features/mocks/deviation-trend";
import { Button } from "@/components/ui/button";
import type { MockExam, MockKind, MockSubject } from "@/types/database";

const KIND_LABELS: Record<MockKind, string> = {
  common: "共通テスト模試",
  university: "冠模試(大学別)",
  ability: "学力測定模試",
};

function WeaknessBlock({ mock }: { mock: MockExam }) {
  const [pending, startTransition] = useTransition();
  if (!mock.weaknesses || mock.weaknesses.length === 0) return null;

  const onAddReview = () => {
    startTransition(async () => {
      const res = await addReviewItemsFromMock({
        items: mock.weaknesses!.map((w) => ({
          subject: w.subject,
          topic: `${w.subject}: ${w.point}`,
          detail: w.advice,
        })),
      });
      if (res.error) toast.error(res.error);
      else toast.success("復習リストに追加しました");
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-milestone/40 bg-milestone/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold text-milestone">
        <Lightbulb className="size-3.5" /> 弱点分析
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {mock.weaknesses.map((w, i) => (
          <li key={i} className="text-sm">
            <span className="font-bold">{w.subject}</span>: {w.point}
            <span className="block text-xs text-muted-foreground">→ {w.advice}</span>
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-2" disabled={pending} onClick={onAddReview}>
        <BookMarked className="size-4" /> 弱点を復習リストに追加
      </Button>
    </div>
  );
}

function MockCard({
  mock,
  subjects,
}: {
  mock: MockExam;
  subjects: MockSubject[];
}) {
  const [pending, startTransition] = useTransition();
  const onDelete = () => {
    if (!confirm(`「${mock.name}」の記録を削除しますか?`)) return;
    startTransition(async () => {
      const res = await deleteMock(mock.id);
      if (res.error) toast.error(res.error);
      else toast.success("削除しました");
    });
  };

  return (
    <details className="rounded-xl border bg-card">
      <summary className="flex cursor-pointer items-center gap-3 p-3">
        {mock.overall_deviation != null && (
          <span className="font-heading text-lg font-semibold text-primary">
            {mock.overall_deviation}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{mock.name}</span>
          <span className="text-xs text-muted-foreground">
            {mock.date.replaceAll("-", "/")}
            {mock.provider && ` ・${mock.provider}`}
          </span>
        </span>
      </summary>
      <div className="border-t px-3 pb-3 pt-2">
        {subjects.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-muted-foreground">
                <th className="font-normal">科目</th>
                <th className="font-normal">得点</th>
                <th className="font-normal">偏差値</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id} className="border-t border-border/40">
                  <td className="py-1">{s.subject}</td>
                  <td>
                    {s.score ?? "-"}
                    {s.max_score ? `/${s.max_score}` : ""}
                  </td>
                  <td className="font-medium text-primary">{s.deviation ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <WeaknessBlock mock={mock} />
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onDelete}
          className="mt-2 text-destructive"
        >
          <Trash2 className="size-4" /> 削除
        </Button>
      </div>
    </details>
  );
}

export function MockRecords({
  mocks,
  subjectsByMock,
}: {
  mocks: MockExam[];
  subjectsByMock: Record<string, MockSubject[]>;
}) {
  if (mocks.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        まだ模試の記録がありません。「登録」タブから追加してください。
      </p>
    );
  }

  const byKind = (k: MockKind) => mocks.filter((m) => m.kind === k);

  return (
    <div className="space-y-6">
      {(Object.keys(KIND_LABELS) as MockKind[]).map((kind) => {
        const list = byKind(kind);
        if (list.length === 0) return null;

        // 冠模試は大学別にグループ化して推移を表示
        if (kind === "university") {
          const byUniv = new Map<string, MockExam[]>();
          for (const m of list) {
            const key = m.university || "その他";
            byUniv.set(key, [...(byUniv.get(key) ?? []), m]);
          }
          return (
            <section key={kind} className="space-y-3">
              <h2 className="text-sm font-bold text-muted-foreground">
                {KIND_LABELS[kind]}
              </h2>
              {[...byUniv.entries()].map(([univ, ms]) => (
                <div key={univ} className="space-y-2">
                  <p className="font-heading font-semibold text-primary">{univ}</p>
                  <DeviationTrend mocks={ms} />
                  {ms
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map((m) => (
                      <MockCard key={m.id} mock={m} subjects={subjectsByMock[m.id] ?? []} />
                    ))}
                </div>
              ))}
            </section>
          );
        }

        return (
          <section key={kind} className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground">
              {KIND_LABELS[kind]}
            </h2>
            <DeviationTrend mocks={list} />
            {list
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((m) => (
                <MockCard key={m.id} mock={m} subjects={subjectsByMock[m.id] ?? []} />
              ))}
          </section>
        );
      })}
    </div>
  );
}
