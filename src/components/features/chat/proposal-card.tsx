"use client";

import { useTransition } from "react";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { applyProposal } from "@/lib/actions/chat";
import { Button } from "@/components/ui/button";
import type {
  MaterialProposal,
  MilestonesProposal,
  PhasesProposal,
  Proposal,
  RoutineProposal,
} from "@/types/database";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const PROPOSAL_TITLES: Record<Proposal["type"], string> = {
  propose_phases: "フェーズ戦略の提案",
  propose_routine: "ルーティンの提案",
  propose_material: "教材の提案",
  propose_milestones: "予定の提案",
};

function ProposalBody({ proposal }: { proposal: Proposal }) {
  if (proposal.type === "propose_phases") {
    const data = proposal.data as PhasesProposal;
    return (
      <ul className="space-y-1.5">
        {data.phases.map((p, i) => (
          <li key={i} className="text-sm">
            <span className="font-bold">
              {"①②③④⑤⑥⑦⑧⑨⑩"[i] ?? i + 1} {p.name}
            </span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {p.start_date.slice(5).replace("-", "/")}〜
              {p.end_date.slice(5).replace("-", "/")}
            </span>
            {p.memo && (
              <span className="block text-xs text-muted-foreground">{p.memo}</span>
            )}
          </li>
        ))}
        {data.replace && (
          <li className="text-xs text-phase-final">※ 既存フェーズを置き換えます</li>
        )}
      </ul>
    );
  }
  if (proposal.type === "propose_routine") {
    const data = proposal.data as RoutineProposal;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-bold text-primary">
          {data.weekdays.map((w) => WEEKDAY_LABELS[w]).join("・")}曜日
          {data.replace && (
            <span className="ml-2 text-phase-final">※ 既存ブロックを置き換え</span>
          )}
        </p>
        <ul className="space-y-1">
          {data.blocks.map((b, i) => (
            <li key={i} className="flex gap-2 text-sm">
              <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                {b.start_time}〜{b.end_time}
              </span>
              <span className={b.category === "life" ? "text-muted-foreground" : "font-medium"}>
                {b.title}
                {b.subject && (
                  <span className="ml-1.5 text-xs text-primary">[{b.subject}]</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (proposal.type === "propose_material") {
    const data = proposal.data as MaterialProposal;
    return (
      <div className="space-y-1">
        <p className="text-sm font-bold">
          {data.title}
          <span className="ml-2 text-xs font-normal text-primary">
            {data.subject}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          全{data.sections.length}章: {data.sections.slice(0, 4).join(" / ")}
          {data.sections.length > 4 && ` …ほか${data.sections.length - 4}章`}
        </p>
      </div>
    );
  }
  const data = proposal.data as MilestonesProposal;
  return (
    <ul className="space-y-1">
      {data.milestones.map((m, i) => (
        <li key={i} className="text-sm">
          <span className="font-mono text-xs text-muted-foreground">
            {m.date.replaceAll("-", "/")}
          </span>{" "}
          <span className="font-medium">{m.title}</span>
          {m.is_target && <span className="ml-1 text-milestone">★本命</span>}
        </li>
      ))}
    </ul>
  );
}

export function ProposalCard({
  messageId,
  index,
  proposal,
}: {
  messageId: string;
  index: number;
  proposal: Proposal;
}) {
  const [pending, startTransition] = useTransition();

  const onApply = () => {
    startTransition(async () => {
      const res = await applyProposal(messageId, index);
      if (res.error) toast.error(res.error);
      else toast.success("反映しました!ホームで確認できます");
    });
  };

  return (
    <div className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold text-primary">
          <Sparkles className="size-3.5" />
          {PROPOSAL_TITLES[proposal.type]}
        </p>
        {proposal.applied ? (
          <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-bold text-success">
            <Check className="size-3" /> 反映済み
          </span>
        ) : (
          <Button size="sm" onClick={onApply} disabled={pending}>
            {pending ? "反映中..." : "反映する"}
          </Button>
        )}
      </div>
      <ProposalBody proposal={proposal} />
    </div>
  );
}
