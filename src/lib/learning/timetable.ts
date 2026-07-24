// 週の時間割スケルトン(純粋関数)。
//
// 各曜日の勉強可能ウィンドウから固定予定(生活ブロック)を引いた空き時間に、
// 科目配分に比例した学習セッションを複数配置する。毎日の冒頭に復習/宿題枠、
// 日曜末尾に翌週計画枠を入れ、区分のバッファ割合ぶんを予備として残す。
// 具体的な内容(title)は AI 層(src/lib/ai/timetable.ts)が付ける。
import type { FixedBlock, StudyWindow } from "./roadmap";

export interface TimetableSubject {
  subject: string;
  weight: number; // 正規化された配分(合計1)
}

export type SessionKind = "study" | "review" | "plan";

export interface TimeBlock {
  weekday: number; // 0=日〜6=土
  startMin: number;
  endMin: number;
  subject: string | null; // 復習/計画枠は null
  kind: SessionKind;
}

export interface TimetableInput {
  studyWindow: StudyWindow;
  /** 生活(固定)ブロック。ここを差し引いた残りが勉強可能。 */
  fixedBlocks: FixedBlock[];
  allocation: TimetableSubject[];
  /** 予備(復習/遅延吸収)割合。既定0.15。 */
  bufferRatio?: number;
}

const SESSION_MIN = 90;
const BREAK_MIN = 10;
const REVIEW_MIN = 60;
const PLAN_MIN = 30;
const MIN_DAY_FREE = 60;

interface Interval {
  start: number;
  end: number;
}

/** ウィンドウから固定予定を引いた空き区間を返す */
export function freeIntervals(
  winStart: number,
  winEnd: number,
  fixed: FixedBlock[],
): Interval[] {
  const busy = fixed
    .filter((f) => f.endMin > winStart && f.startMin < winEnd)
    .map((f) => ({
      start: Math.max(winStart, f.startMin),
      end: Math.min(winEnd, f.endMin),
    }))
    .sort((a, b) => a.start - b.start);

  const merged: Interval[] = [];
  for (const b of busy) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const free: Interval[] = [];
  let cur = winStart;
  for (const m of merged) {
    if (m.start > cur) free.push({ start: cur, end: m.start });
    cur = Math.max(cur, m.end);
  }
  if (cur < winEnd) free.push({ start: cur, end: winEnd });
  return free;
}

/** n個の学習セッションを配分比率で科目に割り当て、交互に並べる */
export function weightedSubjectSequence(
  allocation: TimetableSubject[],
  n: number,
): string[] {
  if (n <= 0 || allocation.length === 0) return [];
  const counts = allocation.map((a) => ({
    subject: a.subject,
    count: Math.max(1, Math.round(a.weight * n)),
  }));
  let tot = counts.reduce((s, c) => s + c.count, 0);
  while (tot > n) {
    const m = counts.reduce((a, b) => (a.count >= b.count ? a : b));
    if (m.count <= 1) break;
    m.count--;
    tot--;
  }
  while (tot < n) {
    const m = counts.reduce((a, b) => (a.count <= b.count ? a : b));
    m.count++;
    tot++;
  }
  // 交互に取り出す(重い科目は多く登場)
  const seq: string[] = [];
  const work = counts.map((c) => ({ ...c }));
  while (seq.length < n) {
    let any = false;
    for (const c of work) {
      if (c.count > 0) {
        seq.push(c.subject);
        c.count--;
        any = true;
        if (seq.length >= n) break;
      }
    }
    if (!any) break;
  }
  return seq;
}

/** セッション列を空き区間に前詰めで配置(休憩を挟み、入らない分は落とす=バッファ) */
function place(
  weekday: number,
  intervals: Interval[],
  sessions: { min: number; subject: string | null; kind: SessionKind }[],
): TimeBlock[] {
  const blocks: TimeBlock[] = [];
  let ii = 0;
  let cursor = intervals[0]?.start ?? 0;
  for (const s of sessions) {
    while (ii < intervals.length && cursor + s.min > intervals[ii].end) {
      ii++;
      if (ii < intervals.length) cursor = intervals[ii].start;
    }
    if (ii >= intervals.length) break;
    blocks.push({
      weekday,
      startMin: cursor,
      endMin: cursor + s.min,
      subject: s.subject,
      kind: s.kind,
    });
    cursor += s.min + BREAK_MIN;
  }
  return blocks;
}

/** 週の時間割(全曜日)を組む */
export function buildWeeklyTimetable(input: TimetableInput): TimeBlock[] {
  const { studyWindow: w, fixedBlocks, allocation } = input;
  const buffer = input.bufferRatio ?? 0.15;
  const blocks: TimeBlock[] = [];

  for (let wd = 0; wd <= 6; wd++) {
    const weekend = wd === 0 || wd === 6;
    const winStart = weekend ? w.weekendStartMin : w.weekdayStartMin;
    const winEnd = weekend ? w.weekendEndMin : w.weekdayEndMin;
    const intervals = freeIntervals(
      winStart,
      winEnd,
      fixedBlocks.filter((f) => f.weekday === wd),
    );
    const totalFree = intervals.reduce((s, i) => s + (i.end - i.start), 0);
    if (totalFree < MIN_DAY_FREE) continue;

    const usable = Math.floor(totalFree * (1 - buffer));
    const isSunday = wd === 0;

    const sessions: { min: number; subject: string | null; kind: SessionKind }[] =
      [];
    // 冒頭: 復習/宿題枠
    const reviewMin = Math.min(REVIEW_MIN, Math.max(30, Math.floor(usable * 0.2)));
    sessions.push({ min: reviewMin, subject: null, kind: "review" });

    const budget = usable - reviewMin - (isSunday ? PLAN_MIN : 0);
    const nStudy = budget >= SESSION_MIN
      ? Math.floor(budget / SESSION_MIN)
      : budget >= 45
        ? 1
        : 0;
    for (const s of weightedSubjectSequence(allocation, nStudy)) {
      sessions.push({ min: SESSION_MIN, subject: s, kind: "study" });
    }
    // 日曜末尾: 翌週計画枠
    if (isSunday) sessions.push({ min: PLAN_MIN, subject: null, kind: "plan" });

    blocks.push(...place(wd, intervals, sessions));
  }

  return blocks;
}
