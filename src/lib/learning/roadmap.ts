// 勉強計画 ロードマップ層(純粋関数。DBアクセスは actions 側)。
//
// 受験日までの残期間を 基礎/演習/発展/過去問/共テ に決定論的に区分割りし、
// 区分ごとの抽象概念(科目別到達目標)・月目標・週目標の枠を作る。
// 具体的な文言は AI 層(src/lib/ai/roadmap.ts)が肉付けし、失敗時はここの
// 決定論フォールバックを使う。
import type { LevelBand } from "./types";

// ---------------- 型 ----------------

export type DivisionKind = "basic" | "practice" | "advance" | "past" | "common";

export interface Division {
  kind: DivisionKind;
  name: string;
  startDate: string; // ISO date
  endDate: string; // ISO date
  /** 期間のうち予備(復習/遅延吸収)に充てる割合 */
  bufferRatio: number;
}

export interface SubjectConcept {
  subject: string;
  /** 抽象概念(到達目標)。例: 「単語2000語を一周し即答できる」 */
  concept: string;
}

export interface DivisionConcepts {
  divisionKind: DivisionKind;
  subjects: SubjectConcept[];
}

export interface MonthlyGoal {
  month: string; // "YYYY-MM"
  divisionKind: DivisionKind;
  goal: string;
}

export interface WeeklyGoal {
  weekStart: string; // ISO date(月曜)
  divisionKind: DivisionKind;
  goal: string;
}

/** 区分の抽象概念に対応する具体的参考書の提案(第2弾) */
export interface SuggestedBook {
  title: string;
  reason: string;
}
export interface MaterialSuggestion {
  subject: string;
  concept: string;
  books: SuggestedBook[];
}
/** 区分ごとの教材提案ステップ(節目提案)。resolved で再提示を止める。 */
export interface DivisionMaterialStep {
  divisionKind: DivisionKind;
  resolved: boolean;
  suggestions: MaterialSuggestion[];
}

export interface RoadmapData {
  examDate: string | null;
  generatedAt: string; // ISO8601
  generatedBy: "ai" | "deterministic";
  divisions: Division[];
  concepts: DivisionConcepts[];
  monthlyGoals: MonthlyGoal[];
  currentWeeklyGoal: WeeklyGoal | null;
  notes: string[];
  /** 区分ごとの教材提案(第2弾)。生成時は空で、区分入場時に埋める。 */
  materialSteps: DivisionMaterialStep[];
}

export interface RoadmapInput {
  today: string; // YYYY-MM-DD
  examDate: string | null;
  levelBand: LevelBand;
  subjects: string[]; // 科目名(日本語)
  /** 共通テスト日(『共通テスト』マイルストーン)。未指定なら自動(1月中旬)。 */
  commonTestDate?: string | null;
}

// ---------------- 定数(配分ヒューリスティック) ----------------

// 時系列順: 基礎→演習→発展→共テ対策→二次過去問。
// 共通テスト(1月中旬)は二次(2月)より前なので common が past より先。
const ORDER: DivisionKind[] = [
  "basic",
  "practice",
  "advance",
  "common",
  "past",
];

export const DIVISION_NAME: Record<DivisionKind, string> = {
  basic: "基礎固め",
  practice: "演習",
  advance: "発展",
  past: "過去問演習",
  common: "共通テスト対策",
};

// 志望レベル帯ごとの各区分の期間比率(母集団補正ではなく配分ヒューリスティック)
const PROPORTIONS: Record<LevelBand, Record<DivisionKind, number>> = {
  basic: { basic: 0.45, practice: 0.25, advance: 0.12, past: 0.1, common: 0.08 },
  middle: { basic: 0.38, practice: 0.27, advance: 0.15, past: 0.12, common: 0.08 },
  upper: { basic: 0.32, practice: 0.28, advance: 0.2, past: 0.12, common: 0.08 },
  top: { basic: 0.28, practice: 0.27, advance: 0.23, past: 0.14, common: 0.08 },
};

const CONCEPT_BY_KIND: Record<DivisionKind, string> = {
  basic: "基礎(単語・公式・典型例題)を一周し、抜けをなくす",
  practice: "標準問題を反復演習し、解法を自力で再現できるようにする",
  advance: "応用・融合問題に取り組み、得点力を伸ばす",
  past: "志望校の過去問を時間を計って解き、傾向と時間配分に慣れる",
  common: "共通テスト形式の演習で、時間配分と正答率を上げる",
};

const BUFFER_RATIO = 0.15;

// ---------------- 日付ユーティリティ(UTC固定でTZずれを避ける) ----------------

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

// ---------------- 区分割り ----------------

function division(kind: DivisionKind, start: string, end: string): Division {
  return {
    kind,
    name: DIVISION_NAME[kind],
    startDate: start,
    endDate: end,
    bufferRatio: BUFFER_RATIO,
  };
}

/** 受験年の1月・第3土曜(共通テストの近似日)を返す */
export function autoCommonTestDate(examISO: string): string {
  const year = Number(examISO.slice(0, 4));
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstSat = (6 - jan1.getUTCDay() + 7) % 7; // 1/1 から最初の土曜まで
  const d = new Date(Date.UTC(year, 0, 1 + firstSat + 14)); // 第3土曜
  return d.toISOString().slice(0, 10);
}

/**
 * [today, examDate] を区分に連続割り当てする(隙間なく、時系列順)。
 * 共通テスト日(引数 or 自動=1月中旬)が期間内なら、
 *   共テ対策 = 共テ日で終了 / 二次過去問 = 共テ翌日〜本番 に固定し、
 *   前半 [today, 共テ対策開始] を 基礎/演習/発展 で按分する。
 * 期間が短い等でアンカーできない場合は従来の比率5分割にフォールバック。
 */
export function dividePeriod(
  todayISO: string,
  examISO: string,
  levelBand: LevelBand,
  commonTestDate?: string | null,
): Division[] {
  const total = diffDays(todayISO, examISO);
  if (total <= 0) return [];
  const props = PROPORTIONS[levelBand] ?? PROPORTIONS.middle;

  const ct = commonTestDate ?? autoCommonTestDate(examISO);

  // すでに共テを過ぎている(直前期) → 二次過去問のみ
  if (ct && todayISO >= ct && todayISO < examISO) {
    return [division("past", todayISO, examISO)];
  }

  // 共テを1月中旬にアンカーできる
  if (ct && todayISO < ct && ct < examISO) {
    const divisions: Division[] = [];
    const daysToCt = diffDays(todayISO, ct); // today..共テ
    let commonDays = Math.max(1, Math.round(total * props.common));
    commonDays = Math.min(commonDays, Math.max(1, daysToCt - 3)); // 前半に数日残す
    const commonStart = addDays(ct, -(commonDays - 1));
    const frontDays = diffDays(todayISO, commonStart); // today..共テ対策開始(排他)

    const frontKinds: DivisionKind[] = ["basic", "practice", "advance"];
    const wsum = frontKinds.reduce((s, k) => s + props[k], 0) || 1;
    let cursor = todayISO;
    let allocated = 0;
    frontKinds.forEach((k, i) => {
      const span =
        i === frontKinds.length - 1
          ? frontDays - allocated
          : Math.max(1, Math.round(frontDays * (props[k] / wsum)));
      if (span > 0) {
        const end = addDays(cursor, span - 1);
        divisions.push(division(k, cursor, end));
        cursor = addDays(end, 1);
        allocated += span;
      }
    });
    divisions.push(division("common", commonStart, ct)); // 共テ対策=共テ日で終了
    divisions.push(division("past", addDays(ct, 1), examISO)); // 二次過去問=共テ後〜本番
    return divisions;
  }

  // フォールバック: 従来の比率5分割(時系列順 ORDER)
  const raw = ORDER.map((k) => Math.max(1, Math.round(total * props[k])));
  let sum = raw.reduce((a, b) => a + b, 0);
  raw[0] = Math.max(1, raw[0] + (total - sum)); // 差分は基礎で吸収
  sum = raw.reduce((a, b) => a + b, 0);
  let overflow = sum - total;
  for (let i = ORDER.length - 1; i >= 0 && overflow > 0; i--) {
    const take = Math.min(overflow, raw[i] - 1);
    raw[i] -= take;
    overflow -= take;
  }
  const divisions: Division[] = [];
  let start = todayISO;
  ORDER.forEach((kind, i) => {
    const end = i === ORDER.length - 1 ? examISO : addDays(start, raw[i] - 1);
    divisions.push(division(kind, start, end));
    start = addDays(end, 1);
  });
  return divisions;
}

/** today を含む区分(なければ今日以前の最終/以後の先頭) */
export function currentDivision(
  divisions: Division[],
  todayISO: string,
): Division | null {
  if (divisions.length === 0) return null;
  const hit = divisions.find(
    (d) => d.startDate <= todayISO && todayISO <= d.endDate,
  );
  if (hit) return hit;
  if (todayISO < divisions[0].startDate) return divisions[0];
  return divisions[divisions.length - 1];
}

// ---------------- 決定論の概念・目標(AI失敗時フォールバック) ----------------

export function deterministicConcepts(
  divisions: Division[],
  subjects: string[],
): DivisionConcepts[] {
  const subs = subjects.length > 0 ? subjects : ["全科目"];
  return divisions.map((d) => ({
    divisionKind: d.kind,
    subjects: subs.map((s) => ({
      subject: s,
      concept: CONCEPT_BY_KIND[d.kind],
    })),
  }));
}

export function deterministicMonthlyGoals(
  divisions: Division[],
  todayISO: string,
  examISO: string,
): MonthlyGoal[] {
  if (divisions.length === 0) return [];
  const goals: MonthlyGoal[] = [];
  // today の月初〜exam の月まで、各月をその月初が属する区分に割り当てる
  let cursor = `${todayISO.slice(0, 7)}-01`;
  const endMonth = examISO.slice(0, 7);
  let guard = 0;
  while (cursor.slice(0, 7) <= endMonth && guard < 60) {
    const month = cursor.slice(0, 7);
    const probe = month < todayISO.slice(0, 7) ? todayISO : `${month}-15`;
    const div = currentDivision(divisions, probe > examISO ? examISO : probe);
    if (div) {
      goals.push({
        month,
        divisionKind: div.kind,
        goal: `${div.name}: ${CONCEPT_BY_KIND[div.kind]}`,
      });
    }
    // 翌月へ
    const [y, m] = month.split("-").map(Number);
    cursor = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    guard++;
  }
  return goals;
}

export function deterministicWeeklyGoal(
  divisions: Division[],
  todayISO: string,
): WeeklyGoal | null {
  const div = currentDivision(divisions, todayISO);
  if (!div) return null;
  return {
    weekStart: mondayOf(todayISO),
    divisionKind: div.kind,
    goal: `${div.name}: ${CONCEPT_BY_KIND[div.kind]}`,
  };
}

/** 決定論だけでロードマップの骨格を組む(AIが肉付けする土台/フォールバック) */
export function buildRoadmapSkeleton(input: RoadmapInput): RoadmapData {
  const { today, examDate, levelBand, subjects, commonTestDate } = input;
  const notes: string[] = [];
  if (!examDate) {
    notes.push("本命試験日が未設定です。設定すると区分割り(逆算)ができます。");
    return {
      examDate: null,
      generatedAt: new Date().toISOString(),
      generatedBy: "deterministic",
      divisions: [],
      concepts: [],
      monthlyGoals: [],
      currentWeeklyGoal: null,
      notes,
      materialSteps: [],
    };
  }
  const divisions = dividePeriod(today, examDate, levelBand, commonTestDate);
  notes.push(
    "各区分は期間の約15%を予備(復習・遅れの吸収)に確保しています。演習・発展の区分でも毎週の復習は必ず入れます。",
  );
  return {
    examDate,
    generatedAt: new Date().toISOString(),
    generatedBy: "deterministic",
    divisions,
    concepts: deterministicConcepts(divisions, subjects),
    monthlyGoals: deterministicMonthlyGoals(divisions, today, examDate),
    currentWeeklyGoal: deterministicWeeklyGoal(divisions, today),
    notes,
    materialSteps: [],
  };
}

// ---------------- 可処分時間の導出(固定予定 → 平日/休日h) ----------------

/** 固定予定の1ブロック(0:00 からの分) */
export interface FixedBlock {
  weekday: number; // 0=日〜6=土
  startMin: number;
  endMin: number;
}

export interface StudyWindow {
  /** 平日の勉強可能ウィンドウ(分) */
  weekdayStartMin: number;
  weekdayEndMin: number;
  /** 休日の勉強可能ウィンドウ(分) */
  weekendStartMin: number;
  weekendEndMin: number;
}

// 既定: 平日 16:00–22:00(6h) / 休日 9:00–21:00(12h)
export const DEFAULT_STUDY_WINDOW: StudyWindow = {
  weekdayStartMin: 16 * 60,
  weekdayEndMin: 22 * 60,
  weekendStartMin: 9 * 60,
  weekendEndMin: 21 * 60,
};

function overlapMin(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * 固定予定を勉強可能ウィンドウから差し引き、平日/休日の平均勉強可能時間(h)を導出する。
 * 自己申告(スライダー)の代わりに、実際の予定から可処分時間を求める。
 * 塾・部活・バイト等はこの固定予定に含める前提(computeAvailability で二重控除しない)。
 */
export function deriveWeekdayWeekendHours(
  blocks: FixedBlock[],
  win: StudyWindow = DEFAULT_STUDY_WINDOW,
): { weekday: number; weekend: number } {
  const freeByDay = new Map<number, number>();
  for (let d = 0; d <= 6; d++) {
    const weekend = d === 0 || d === 6;
    const ws = weekend ? win.weekendStartMin : win.weekdayStartMin;
    const we = weekend ? win.weekendEndMin : win.weekdayEndMin;
    const windowMin = Math.max(0, we - ws);
    const busy = blocks
      .filter((b) => b.weekday === d)
      .reduce((sum, b) => sum + overlapMin(b.startMin, b.endMin, ws, we), 0);
    freeByDay.set(d, Math.max(0, windowMin - busy));
  }
  const wd = [1, 2, 3, 4, 5].map((d) => freeByDay.get(d) ?? 0);
  const we = [0, 6].map((d) => freeByDay.get(d) ?? 0);
  const avg = (arr: number[]) =>
    arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  return {
    weekday: Math.round((avg(wd) / 60) * 10) / 10,
    weekend: Math.round((avg(we) / 60) * 10) / 10,
  };
}
