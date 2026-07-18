"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarDays,
  ChartColumn,
  Check,
  ClipboardList,
  PencilLine,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  addRoutineBlock,
  deleteRoutineBlock,
  toggleBlockDone,
  upsertDailyNote,
} from "@/lib/actions/masters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { DailyNote, RoutineBlock, Subject } from "@/types/database";

export interface SubjectMinutes {
  name: string;
  color: string;
  minutes: number;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
// 表示順: 月〜日
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const TABS = [
  { id: "schedule", label: "予定", icon: CalendarDays },
  { id: "reflect", label: "振返", icon: PencilLine },
  { id: "history", label: "履歴", icon: ClipboardList },
  { id: "analytics", label: "分析", icon: ChartColumn },
] as const;

type TabId = (typeof TABS)[number]["id"];

function minutesOf(block: RoutineBlock): number {
  const [sh, sm] = block.start_time.split(":").map(Number);
  const [eh, em] = block.end_time.split(":").map(Number);
  return eh * 60 + em - sh * 60 - sm;
}

function hhmm(time: string): string {
  return time.slice(0, 5);
}

function formatHours(minutes: number): string {
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}分`;
}

export function DashboardTabs({
  todayStr,
  todayWeekday,
  blocks,
  subjects,
  doneBlockIds,
  todayNote,
  notes,
  minutesByDate,
  subjectMinutes,
  totalMinutes30,
  displayName,
}: {
  todayStr: string;
  todayWeekday: number;
  blocks: RoutineBlock[];
  subjects: Subject[];
  doneBlockIds: string[];
  todayNote: DailyNote | null;
  notes: DailyNote[];
  minutesByDate: [string, number][];
  subjectMinutes: SubjectMinutes[];
  totalMinutes30: number;
  displayName: string;
}) {
  const [tab, setTab] = useState<TabId>("schedule");
  const [weekday, setWeekday] = useState(todayWeekday);
  const [showAddForm, setShowAddForm] = useState(false);
  const [mood, setMood] = useState(todayNote?.mood ?? 3);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const subjectById = useMemo(
    () => new Map(subjects.map((s) => [s.id, s])),
    [subjects],
  );
  const dayBlocks = useMemo(
    () =>
      blocks
        .filter((b) => b.weekday === weekday)
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [blocks, weekday],
  );
  const studyMinutes = dayBlocks
    .filter((b) => b.category === "study")
    .reduce((a, b) => a + minutesOf(b), 0);
  const doneSet = new Set(doneBlockIds);
  const maxDaily = Math.max(60, ...minutesByDate.map(([, v]) => v));
  const maxSubject = Math.max(1, ...subjectMinutes.map((s) => s.minutes));
  const minutesByNoteDate = useMemo(() => {
    const map = new Map(minutesByDate);
    return map;
  }, [minutesByDate]);

  const run = (fn: () => Promise<{ error: string | null }>, okMsg?: string) => {
    startTransition(async () => {
      const res = await fn();
      if (res.error) toast.error(res.error);
      else if (okMsg) toast.success(okMsg);
    });
  };

  return (
    <div className="space-y-4">
      {/* タブバー */}
      <div className="grid grid-cols-4 gap-1 rounded-2xl border bg-card p-1">
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

      {/* ===== 予定 ===== */}
      {tab === "schedule" && (
        <div className="space-y-4">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {WEEKDAY_ORDER.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWeekday(w)}
                className={cn(
                  "min-w-12 rounded-xl border px-3 py-2.5 text-sm font-bold transition-colors",
                  weekday === w
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                  w === todayWeekday && weekday !== w && "border-primary/40",
                )}
              >
                {WEEKDAY_LABELS[w]}
              </button>
            ))}
          </div>

          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-2xl font-semibold text-primary">
              {WEEKDAY_LABELS[weekday]}曜
              {weekday === todayWeekday && (
                <span className="ml-2 text-sm font-bold text-muted-foreground">
                  今日
                </span>
              )}
            </h2>
            <p className="text-sm font-bold text-milestone">
              勉強 {formatHours(studyMinutes)}
            </p>
          </div>

          {dayBlocks.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              この曜日のブロックはまだありません。下の「+」か AI 相談で作れます。
            </p>
          )}

          <ul className="space-y-2">
            {dayBlocks.map((block) => {
              const subject = block.subject_id
                ? subjectById.get(block.subject_id)
                : undefined;
              const isStudy = block.category === "study";
              const done = doneSet.has(block.id);
              const isToday = weekday === todayWeekday;
              return (
                <li
                  key={block.id}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border bg-card p-3",
                    done && "opacity-60",
                  )}
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor: isStudy
                      ? (subject?.color ?? "#3b82f6")
                      : "#334155",
                  }}
                >
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {hhmm(block.start_time)}〜{hhmm(block.end_time)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm font-bold",
                        done && "line-through",
                        !isStudy && "font-medium text-muted-foreground",
                      )}
                    >
                      {block.title}
                    </span>
                    {subject && (
                      <span
                        className="mt-0.5 inline-block rounded-full px-2 py-px text-[10px] font-bold text-white"
                        style={{ backgroundColor: subject.color }}
                      >
                        {subject.name}
                      </span>
                    )}
                  </span>
                  {isStudy && isToday && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => toggleBlockDone(block.id, todayStr),
                          done ? undefined : "おつかれさま!記録しました 🎉",
                        )
                      }
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                        done
                          ? "border-success bg-success text-success-foreground"
                          : "border-muted-foreground/40 hover:border-success",
                      )}
                      aria-label="完了"
                    >
                      {done && <Check className="size-4" strokeWidth={3} />}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (confirm(`「${block.title}」を削除しますか?`)) {
                        run(() => deleteRoutineBlock(block.id));
                      }
                    }}
                    className="hidden shrink-0 text-muted-foreground hover:text-destructive group-hover:block"
                    aria-label="削除"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ブロック追加 */}
          {showAddForm ? (
            <form
              ref={formRef}
              action={(fd) => {
                run(async () => {
                  const res = await addRoutineBlock(fd);
                  if (!res.error) {
                    formRef.current?.reset();
                    setShowAddForm(false);
                  }
                  return res;
                }, "ブロックを追加しました");
              }}
              className="space-y-3 rounded-xl border bg-card p-4"
            >
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_ORDER.map((w) => (
                  <label
                    key={w}
                    className="flex cursor-pointer items-center gap-1 rounded-lg border px-2 py-1 text-xs font-bold has-checked:border-primary has-checked:bg-primary/15 has-checked:text-primary"
                  >
                    <input
                      type="checkbox"
                      name="weekday"
                      value={w}
                      defaultChecked={w === weekday}
                      className="sr-only"
                    />
                    {WEEKDAY_LABELS[w]}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input name="start_time" type="time" required aria-label="開始" />
                <Input name="end_time" type="time" required aria-label="終了" />
              </div>
              <Input name="title" placeholder="内容(例: 英語長文2題)" required />
              <div className="grid grid-cols-2 gap-2">
                <select
                  name="category"
                  className="h-9 rounded-md border bg-card px-2 text-sm"
                  defaultValue="study"
                  aria-label="区分"
                >
                  <option value="study">勉強</option>
                  <option value="life">生活(通学・授業など)</option>
                </select>
                <select
                  name="subject_id"
                  className="h-9 rounded-md border bg-card px-2 text-sm"
                  defaultValue=""
                  aria-label="科目"
                >
                  <option value="">科目なし</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending} className="flex-1">
                  追加する
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  閉じる
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed"
              onClick={() => setShowAddForm(true)}
            >
              <Plus className="size-4" /> ブロックを追加
            </Button>
          )}
        </div>
      )}

      {/* ===== 振返 ===== */}
      {tab === "reflect" && (
        <form
          action={(fd) => run(async () => upsertDailyNote(fd), "振り返りを保存しました")}
          className="space-y-4 rounded-2xl border bg-card p-4"
        >
          <input type="hidden" name="date" value={todayStr} />
          <input type="hidden" name="mood" value={mood} />
          <div>
            <p className="mb-2 text-sm font-bold">
              今日の調子は?{displayName && ` ${displayName}`}
            </p>
            <div className="flex gap-2">
              {["😫", "😕", "😐", "🙂", "🔥"].map((emoji, i) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setMood(i + 1)}
                  className={cn(
                    "flex size-11 items-center justify-center rounded-xl border text-xl transition-all",
                    mood === i + 1
                      ? "border-primary bg-primary/15 scale-110"
                      : "border-border opacity-50 hover:opacity-100",
                  )}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="note-good" className="text-sm font-bold text-success">
              うまくいったこと
            </label>
            <Textarea
              id="note-good"
              name="good"
              rows={2}
              defaultValue={todayNote?.good ?? ""}
              placeholder="例: 朝の英語ルーティンを守れた"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="note-issue" className="text-sm font-bold text-phase-final">
              課題・つまずき
            </label>
            <Textarea
              id="note-issue"
              name="issue"
              rows={2}
              defaultValue={todayNote?.issue ?? ""}
              placeholder="例: 数学の複素数平面で手が止まる"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="note-memo" className="text-sm font-bold">
              ひとことメモ
            </label>
            <Textarea
              id="note-memo"
              name="memo"
              rows={2}
              defaultValue={todayNote?.memo ?? ""}
              placeholder="自由記入"
            />
          </div>
          <Button type="submit" disabled={pending} className="w-full">
            {todayNote ? "更新する" : "保存する"}
          </Button>
        </form>
      )}

      {/* ===== 履歴 ===== */}
      {tab === "history" && (
        <div className="space-y-2">
          {notes.length === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              まだ振り返りがありません。「振返」タブから今日の記録をつけましょう。
            </p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs text-muted-foreground">
                  {note.date.replaceAll("-", "/")}
                </p>
                <div className="flex items-center gap-2 text-xs">
                  {note.mood && (
                    <span>{["😫", "😕", "😐", "🙂", "🔥"][note.mood - 1]}</span>
                  )}
                  {minutesByNoteDate.has(note.date) && (
                    <span className="font-bold text-milestone">
                      {formatHours(minutesByNoteDate.get(note.date) ?? 0)}
                    </span>
                  )}
                </div>
              </div>
              {note.good && (
                <p className="mt-1 text-sm">
                  <span className="font-bold text-success">良</span> {note.good}
                </p>
              )}
              {note.issue && (
                <p className="mt-0.5 text-sm">
                  <span className="font-bold text-phase-final">課</span>{" "}
                  {note.issue}
                </p>
              )}
              {note.memo && (
                <p className="mt-0.5 text-sm text-muted-foreground">{note.memo}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== 分析 ===== */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-sm font-bold">日別の学習時間(直近14日)</p>
            <div className="mt-3 flex h-36 items-end gap-1">
              {minutesByDate.map(([date, minutes]) => (
                <div
                  key={date}
                  className="flex flex-1 flex-col items-center gap-1"
                  title={`${date}: ${formatHours(minutes)}`}
                >
                  <div className="flex w-full flex-1 items-end">
                    <div
                      className="w-full rounded-t bg-primary"
                      style={{
                        height: `${Math.max(minutes > 0 ? 5 : 1, (minutes / maxDaily) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {Number(date.slice(8))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-bold">科目別(直近30日)</p>
              <p className="text-xs text-muted-foreground">
                合計 {formatHours(totalMinutes30)}
              </p>
            </div>
            <div className="mt-3 space-y-2.5">
              {subjectMinutes.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  科目が登録されていません。
                </p>
              )}
              {subjectMinutes.map((s) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold">{s.name}</span>
                    <span className="text-muted-foreground">
                      {formatHours(s.minutes)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(s.minutes / maxSubject) * 100}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
