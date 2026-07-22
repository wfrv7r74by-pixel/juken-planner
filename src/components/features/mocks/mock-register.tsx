"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  extractMockScoresAction,
  saveMock,
  searchMockAction,
} from "@/lib/actions/mock";
import { createClient } from "@/lib/supabase/client";
import type { MockKind } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<MockKind, string> = {
  common: "共通テスト模試",
  university: "冠模試(大学別)",
  ability: "学力測定模試",
};

interface SubjectRow {
  subject: string;
  score: string;
  maxScore: string;
  deviation: string;
}

function emptyRow(subject = ""): SubjectRow {
  return { subject, score: "", maxScore: "", deviation: "" };
}

export function MockRegister({ userId }: { userId: string }) {
  const [kind, setKind] = useState<MockKind>("common");
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [university, setUniversity] = useState("");
  const [date, setDate] = useState("");
  const [overall, setOverall] = useState("");
  const [rows, setRows] = useState<SubjectRow[]>([emptyRow()]);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, startSearch] = useTransition();
  const [reading, setReading] = useState(false);
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const setRow = (i: number, patch: Partial<SubjectRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  // ① 模試検索
  const onSearch = () => {
    if (!searchQuery.trim() || searching) return;
    startSearch(async () => {
      const res = await searchMockAction(searchQuery);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const r = res.result!;
      setName(r.name);
      setKind(r.kind);
      if (r.provider) setProvider(r.provider);
      if (r.university) setUniversity(r.university);
      if (r.subjects.length > 0) {
        setRows(r.subjects.map((s) => emptyRow(s)));
      }
      toast.success("模試情報を反映しました");
    });
  };

  // ②③ 成績表写真の読み取り
  const onPickImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("画像を選択してください。");
    if (file.size > 8 * 1024 * 1024) return toast.error("画像は8MB以内に。");
    setReading(true);
    try {
      const supabase = createClient();
      const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase();
      const path = `${userId}/mock-${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from("answers")
        .upload(path, file, { contentType: file.type });
      if (up.error) return toast.error("アップロードに失敗しました。");
      setImagePath(path);
      setImagePreview(URL.createObjectURL(file));

      const res = await extractMockScoresAction(path);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const ex = res.result!;
      if (ex.overall_deviation != null) setOverall(String(ex.overall_deviation));
      if (ex.subjects.length > 0) {
        setRows(
          ex.subjects.map((s) => ({
            subject: s.subject,
            score: s.score != null ? String(s.score) : "",
            maxScore: s.max_score != null ? String(s.max_score) : "",
            deviation: s.deviation != null ? String(s.deviation) : "",
          })),
        );
      }
      toast.success("成績表を読み取りました。内容を確認してください");
    } finally {
      setReading(false);
    }
  };

  const clearImage = () => {
    setImagePath(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const reset = () => {
    setName("");
    setProvider("");
    setUniversity("");
    setDate("");
    setOverall("");
    setRows([emptyRow()]);
    setSearchQuery("");
    clearImage();
  };

  const onSave = () => {
    if (saving) return;
    startSave(async () => {
      const res = await saveMock({
        kind,
        name,
        provider,
        university,
        date,
        overallDeviation: overall === "" ? null : Number(overall),
        imagePath: imagePath ?? undefined,
        subjects: rows
          .filter((r) => r.subject.trim())
          .map((r) => ({
            subject: r.subject,
            score: r.score === "" ? null : Number(r.score),
            maxScore: r.maxScore === "" ? null : Number(r.maxScore),
            deviation: r.deviation === "" ? null : Number(r.deviation),
          })),
      });
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("模試を登録しました(弱点分析は記録タブで確認)");
        reset();
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* 種別 */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABELS) as MockKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors",
              kind === k
                ? "border-primary bg-primary/15 text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {/* ① 検索 */}
      <div className="space-y-1.5 rounded-2xl border bg-card p-4">
        <p className="text-xs font-bold text-muted-foreground">① 模試を検索(任意)</p>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="例: 全統共通テスト模試 / 京大即応オープン"
              className="pl-9"
              disabled={searching}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSearch();
                }
              }}
            />
          </div>
          <Button type="button" onClick={onSearch} disabled={searching || !searchQuery.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          </Button>
        </div>
      </div>

      {/* 模試情報 */}
      <div className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-bold">模試名</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="模試名" />
        </div>
        {kind === "university" && (
          <div className="space-y-1.5">
            <label className="text-xs font-bold">対象大学</label>
            <Input
              value={university}
              onChange={(e) => setUniversity(e.target.value)}
              placeholder="京都大学"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs font-bold">主催(任意)</label>
          <Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="河合塾" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">受験日</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold">総合偏差値</label>
          <Input
            type="number"
            step="0.1"
            value={overall}
            onChange={(e) => setOverall(e.target.value)}
            placeholder="65.0"
          />
        </div>
      </div>

      {/* ②③ 成績表写真 */}
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="text-xs font-bold text-muted-foreground">
          ②③ 成績表の写真から自動入力(任意)
        </p>
        {imagePreview ? (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="成績表" className="max-h-40 rounded-lg border" />
            <button
              type="button"
              onClick={clearImage}
              className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full bg-destructive text-white"
              aria-label="削除"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={reading}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
          >
            {reading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
            {reading ? "読み取り中…" : "成績表の写真をアップロード"}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickImage(f);
          }}
        />
      </div>

      {/* 科目別 */}
      <div className="space-y-2 rounded-2xl border bg-card p-4">
        <p className="text-xs font-bold text-muted-foreground">
          ② 科目 / ③ 得点・偏差値
        </p>
        <div className="hidden gap-2 px-1 text-[10px] text-muted-foreground sm:grid sm:grid-cols-[1fr_70px_70px_70px_28px]">
          <span>科目</span>
          <span>得点</span>
          <span>満点</span>
          <span>偏差値</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_70px_70px_70px_28px]"
          >
            <Input
              value={row.subject}
              onChange={(e) => setRow(i, { subject: e.target.value })}
              placeholder="科目"
              className="col-span-2 sm:col-span-1"
            />
            <Input
              type="number"
              value={row.score}
              onChange={(e) => setRow(i, { score: e.target.value })}
              placeholder="得点"
              aria-label="得点"
            />
            <Input
              type="number"
              value={row.maxScore}
              onChange={(e) => setRow(i, { maxScore: e.target.value })}
              placeholder="満点"
              aria-label="満点"
            />
            <Input
              type="number"
              step="0.1"
              value={row.deviation}
              onChange={(e) => setRow(i, { deviation: e.target.value })}
              placeholder="偏差"
              aria-label="偏差値"
            />
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              className="flex items-center justify-center text-muted-foreground hover:text-destructive"
              aria-label="行を削除"
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setRows((prev) => [...prev, emptyRow()])}
        >
          <Plus className="size-4" /> 科目を追加
        </Button>
      </div>

      <Button onClick={onSave} disabled={saving || !name.trim() || !date} className="w-full">
        {saving ? (
          <>
            <Loader2 className="size-4 animate-spin" /> 登録中…(弱点分析まで実行)
          </>
        ) : (
          "この内容で登録する"
        )}
      </Button>
    </div>
  );
}
