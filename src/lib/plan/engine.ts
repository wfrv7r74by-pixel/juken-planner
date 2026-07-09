// 逆算プラン生成エンジン(純関数のみ。DB アクセスは actions 側で行う)
import { addDays, differenceInCalendarDays, format, getDay } from "date-fns";
import type { Phase, WeekdayMinutes } from "@/types/database";

export interface PhaseWindow {
  phase: Phase;
  /** yyyy-MM-dd */
  start: string;
  /** yyyy-MM-dd */
  end: string;
}

export interface MaterialInput {
  id: string;
  phase: Phase;
  /** 完了済み単位数(unit_start の起点になる) */
  doneUnits: number;
  /** 残り単位数 */
  remainingUnits: number;
  minutesPerUnit: number;
}

export interface PlannedTask {
  material_id: string;
  date: string;
  planned_units: number;
  unit_start: number;
  unit_end: number;
}

const DATE_FMT = "yyyy-MM-dd";

export const PHASE_LABELS: Record<Phase, string> = {
  basic: "基礎固め",
  advance: "発展",
  final: "直前対策",
};

export const PHASE_ORDER: Phase[] = ["basic", "advance", "final"];

/**
 * 今日から試験前日までを 基礎固め / 発展 / 直前対策 の3期間に分割する。
 * 期間が短い場合は後ろのフェーズを優先して確保する。
 */
export function computePhaseWindows(
  today: Date,
  examDate: Date,
  basicRatio: number,
  advanceRatio: number,
): PhaseWindow[] {
  const lastStudyDay = addDays(examDate, -1);
  const totalDays = differenceInCalendarDays(lastStudyDay, today) + 1;
  if (totalDays <= 0) return [];

  let basicDays = Math.round(totalDays * basicRatio);
  let advanceDays = Math.round(totalDays * advanceRatio);
  let finalDays = totalDays - basicDays - advanceDays;

  // 期間が極端に短いときは 直前 > 発展 > 基礎 の順に1日ずつ確保
  if (totalDays <= 3) {
    finalDays = 1;
    advanceDays = totalDays >= 2 ? 1 : 0;
    basicDays = totalDays >= 3 ? 1 : 0;
  } else {
    if (finalDays < 1) {
      finalDays = 1;
      if (basicDays + advanceDays + finalDays > totalDays) {
        basicDays = totalDays - advanceDays - finalDays;
      }
    }
    if (basicDays < 1) basicDays = 1;
    if (advanceDays < 1) advanceDays = 1;
    finalDays = totalDays - basicDays - advanceDays;
  }

  const windows: PhaseWindow[] = [];
  let cursor = today;
  for (const [phase, days] of [
    ["basic", basicDays],
    ["advance", advanceDays],
    ["final", finalDays],
  ] as [Phase, number][]) {
    if (days <= 0) continue;
    const end = addDays(cursor, days - 1);
    windows.push({
      phase,
      start: format(cursor, DATE_FMT),
      end: format(end, DATE_FMT),
    });
    cursor = addDays(end, 1);
  }
  return windows;
}

interface DayCapacity {
  date: string;
  capacity: number;
}

function buildDays(
  start: Date,
  end: Date,
  weekdayMinutes: WeekdayMinutes,
): DayCapacity[] {
  const days: DayCapacity[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.push({
      date: format(d, DATE_FMT),
      capacity: weekdayMinutes[String(getDay(d))] ?? 0,
    });
  }
  return days;
}

/**
 * 1教材の残り単位数を、期間内の各日へ学習可能時間に比例して割り振る。
 * 累積丸めで合計が必ず remainingUnits に一致するようにする。
 */
export function allocateMaterial(
  material: MaterialInput,
  days: DayCapacity[],
): PlannedTask[] {
  if (material.remainingUnits <= 0 || days.length === 0) return [];

  let weights = days.map((d) => d.capacity);
  if (weights.every((w) => w <= 0)) {
    weights = days.map(() => 1); // 全日キャパ0なら均等配分
  }
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const tasks: PlannedTask[] = [];
  let allocated = 0;
  let cumWeight = 0;
  for (let i = 0; i < days.length; i++) {
    cumWeight += weights[i];
    const target = Math.round(
      (material.remainingUnits * cumWeight) / totalWeight,
    );
    const units = target - allocated;
    if (units <= 0) continue;
    tasks.push({
      material_id: material.id,
      date: days[i].date,
      planned_units: units,
      unit_start: material.doneUnits + allocated + 1,
      unit_end: material.doneUnits + allocated + units,
    });
    allocated += units;
  }
  return tasks;
}

/**
 * 全教材の日次タスクを生成する。
 * 各教材は自分のフェーズ期間(既に過ぎていれば今日以降の残り全期間)に配分される。
 */
export function generateSchedule(
  today: Date,
  examDate: Date,
  weekdayMinutes: WeekdayMinutes,
  basicRatio: number,
  advanceRatio: number,
  materials: MaterialInput[],
): { tasks: PlannedTask[]; windows: PhaseWindow[] } {
  const windows = computePhaseWindows(today, examDate, basicRatio, advanceRatio);
  if (windows.length === 0) return { tasks: [], windows };

  const todayStr = format(today, DATE_FMT);
  const lastStudyDay = addDays(examDate, -1);

  const tasks: PlannedTask[] = [];
  for (const material of materials) {
    const window = windows.find((w) => w.phase === material.phase);
    let start: Date;
    let end: Date;
    if (window && window.end >= todayStr) {
      start = new Date(`${window.start}T00:00:00`);
      end = new Date(`${window.end}T00:00:00`);
      if (format(start, DATE_FMT) < todayStr) start = today;
    } else {
      // フェーズ期間が過ぎている教材は残り全期間に配分
      start = today;
      end = lastStudyDay;
    }
    tasks.push(
      ...allocateMaterial(material, buildDays(start, end, weekdayMinutes)),
    );
  }
  return { tasks, windows };
}
