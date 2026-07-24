"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  savePrerequisites,
  type PrerequisitesInput,
} from "@/lib/actions/plan-prereq";
import type { UserLearningProfile } from "@/lib/learning/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const HOMEWORK: { value: PrerequisitesInput["homeworkLoad"]; label: string }[] = [
  { value: "none", label: "ほぼ無し" },
  { value: "light", label: "少なめ" },
  { value: "normal", label: "普通" },
  { value: "heavy", label: "多い" },
];

interface Block {
  weekday: number;
  startTime: string;
  endTime: string;
  title: string;
}

/** ヒアリングの部活/バイトから固定予定の初期値を作る */
function initialBlocks(profile: UserLearningProfile): Block[] {
  const blocks: Block[] = [];
  const club = profile.availability.clubActivity.value;
  if (club?.active) {
    for (const d of club.days ?? [])
      blocks.push({ weekday: d, startTime: "16:00", endTime: "18:30", title: "部活" });
  }
  for (const j of profile.availability.partTimeJob.value ?? []) {
    blocks.push({
      weekday: j.dayOfWeek,
      startTime: j.startAt?.slice(0, 5) || "17:00",
      endTime: j.endAt?.slice(0, 5) || "21:00",
      title: "バイト",
    });
  }
  return blocks;
}

export function PrerequisitesForm({
  profile,
  materials,
  initialFixedBlocks,
  saveLabel = "前提を保存してロードマップへ",
}: {
  profile: UserLearningProfile;
  materials: { subject: string; title: string }[];
  /** 編集時: 保存済みの固定予定を初期値にする(未指定ならヒアリングの部活/バイトから) */
  initialFixedBlocks?: Block[];
  saveLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [blocks, setBlocks] = useState<Block[]>(
    () => initialFixedBlocks ?? initialBlocks(profile),
  );
  const [homework, setHomework] = useState<PrerequisitesInput["homeworkLoad"]>(
    profile.schoolAssignmentLoad.value ?? "normal",
  );
  const [win, setWin] = useState({
    weekdayStart: "16:00",
    weekdayEnd: "22:00",
    weekendStart: "09:00",
    weekendEnd: "21:00",
  });

  const addBlock = () =>
    setBlocks((b) => [
      ...b,
      { weekday: 1, startTime: "16:00", endTime: "18:00", title: "" },
    ]);
  const update = (i: number, patch: Partial<Block>) =>
    setBlocks((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) =>
    setBlocks((b) => b.filter((_, j) => j !== i));

  const save = () =>
    startTransition(async () => {
      const res = await savePrerequisites({
        fixedBlocks: blocks,
        homeworkLoad: homework,
        studyWindow: win,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("前提を保存しました。ロードマップを作成できます。");
        router.refresh();
      }
    });

  const subjectsOfMaterials = useMemo(
    () => Array.from(new Set(materials.map((m) => m.subject))),
    [materials],
  );

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        計画の前提を教えてください。可処分時間は「勉強できる時間帯」から固定予定を引いて自動計算します。
      </p>

      {/* ① 週の固定予定 */}
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-heading font-semibold">① 週の固定予定</p>
        <p className="mb-2 text-xs text-muted-foreground">
          学校・部活・バイト・塾・通学など、毎週決まって埋まる時間。
        </p>
        <ul className="space-y-2">
          {blocks.map((b, i) => (
            <li key={i} className="grid grid-cols-[64px_1fr_1fr_1fr_auto] items-center gap-1.5">
              <select
                value={b.weekday}
                onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                aria-label="曜日"
                className="rounded-lg border bg-background px-1.5 py-2 text-sm"
              >
                {WEEKDAYS.map((w, d) => (
                  <option key={d} value={d}>
                    {w}
                  </option>
                ))}
              </select>
              <Input
                type="time"
                value={b.startTime}
                onChange={(e) => update(i, { startTime: e.target.value })}
                aria-label="開始"
              />
              <Input
                type="time"
                value={b.endTime}
                onChange={(e) => update(i, { endTime: e.target.value })}
                aria-label="終了"
              />
              <Input
                value={b.title}
                onChange={(e) => update(i, { title: e.target.value })}
                placeholder="内容"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label="削除"
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addBlock}
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
        >
          <Plus className="size-3.5" /> 予定を追加
        </button>
      </div>

      {/* 勉強できる時間帯 */}
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-heading font-semibold">勉強できる時間帯</p>
        <p className="mb-2 text-xs text-muted-foreground">
          この枠から上の固定予定を引いた分を「可処分時間」とみなします(さらに0.8掛けで見積もり)。
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-[48px_1fr_auto_1fr] items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">平日</span>
            <Input type="time" value={win.weekdayStart} onChange={(e) => setWin((w) => ({ ...w, weekdayStart: e.target.value }))} aria-label="平日開始" />
            <span className="text-center text-muted-foreground">〜</span>
            <Input type="time" value={win.weekdayEnd} onChange={(e) => setWin((w) => ({ ...w, weekdayEnd: e.target.value }))} aria-label="平日終了" />
          </div>
          <div className="grid grid-cols-[48px_1fr_auto_1fr] items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">休日</span>
            <Input type="time" value={win.weekendStart} onChange={(e) => setWin((w) => ({ ...w, weekendStart: e.target.value }))} aria-label="休日開始" />
            <span className="text-center text-muted-foreground">〜</span>
            <Input type="time" value={win.weekendEnd} onChange={(e) => setWin((w) => ({ ...w, weekendEnd: e.target.value }))} aria-label="休日終了" />
          </div>
        </div>
      </div>

      {/* ② 宿題量 */}
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-heading font-semibold">② 学校の宿題量</p>
        <p className="mb-2 text-xs text-muted-foreground">
          週あたりの学校課題のボリューム。可処分時間から差し引きます。
        </p>
        <div className="flex flex-wrap gap-2">
          {HOMEWORK.map((h) => (
            <button
              key={h.value}
              type="button"
              onClick={() => setHomework(h.value)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-sm font-medium transition-colors",
                homework === h.value
                  ? "border-primary bg-primary/15 text-primary"
                  : "hover:border-primary/50",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
      </div>

      {/* ③ 基礎教材 */}
      <div className="rounded-2xl border bg-card p-4">
        <p className="font-heading font-semibold">③ 基礎で使う教材</p>
        <p className="mb-2 text-xs text-muted-foreground">
          いま持っている・使う予定の教材。計画作成後にいつでも追加できます。
        </p>
        {materials.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m, i) => (
              <span
                key={i}
                className="rounded-lg bg-muted px-2 py-1 text-xs text-muted-foreground"
              >
                <span className="font-medium text-foreground">{m.subject}</span>{" "}
                {m.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">まだ登録がありません。</p>
        )}
        <Link
          href="/materials"
          className="mt-2 inline-flex items-center gap-1 text-xs text-primary underline"
        >
          <BookOpen className="size-3.5" /> 教材を検索して追加(教科は自動分類)
        </Link>
        {subjectsOfMaterials.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            登録済み科目: {subjectsOfMaterials.join(" / ")}
          </p>
        )}
      </div>

      <Button className="w-full" disabled={pending} onClick={save}>
        {pending ? "保存中…" : saveLabel}
      </Button>
    </div>
  );
}
