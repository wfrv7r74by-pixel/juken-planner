// 学習相談のコアロジック(純粋関数。DBアクセスは actions 側)
import type {
  Confidence,
  Field,
  FieldSource,
  UserLearningProfile,
} from "./types";

// ---------------- フィールド生成 ----------------

export function unknownField<T>(): Field<T> {
  return {
    value: null,
    confidence: "unknown",
    updatedAt: new Date(0).toISOString(),
    source: "default",
  };
}

export function setField<T>(
  value: T,
  confidence: Confidence,
  source: FieldSource,
): Field<T> {
  return { value, confidence, updatedAt: new Date().toISOString(), source };
}

/** 未取得の必須項目に仕様のデフォルト仮値を入れる(confidence=estimated) */
export function estimated<T>(value: T): Field<T> {
  return setField(value, "estimated", "default");
}

// ---------------- 既定プロフィール ----------------

export function defaultProfile(): UserLearningProfile {
  return {
    goal: {
      targetSchools: unknownField(),
      levelBand: unknownField(),
      admissionType: unknownField(),
      subjects: unknownField(),
      grade: unknownField(),
      concurrentApplicationCount: unknownField(),
    },
    currentLevel: {
      hasMockExam: false,
      mockSummary: unknownField(),
      proxyIndicators: {
        schoolName: unknownField(),
        schoolLevelBand: unknownField(),
        classRank: unknownField(),
        periodicTestScores: unknownField(),
        certifications: unknownField(),
      },
      unitMastery: unknownField(),
      timeShortageRatio: unknownField(),
    },
    materials: unknownField(),
    schoolProgress: unknownField(),
    schoolAssignmentLoad: unknownField(),
    externalClasses: unknownField(),
    availability: {
      clubActivity: unknownField(),
      partTimeJob: unknownField(),
      commuteMinutesPerDay: unknownField(),
      weekdayHours: unknownField(),
      weekendHours: unknownField(),
      fixedEvents: unknownField(),
      studyLocation: unknownField(),
    },
    traits: {
      pastFailurePattern: unknownField(),
      selfAssessedStrengths: unknownField(),
      selfAssessedWeaknesses: unknownField(),
      preferredTaskType: unknownField(),
      preferredTone: unknownField(),
      reportFrequency: unknownField(),
    },
    phase: "onboarding",
    completeness: 0,
    answeredQuestionIds: [],
  };
}

// ---------------- 取得判定 ----------------

function known<T>(f: Field<T> | undefined): boolean {
  return Boolean(f && f.value !== null && f.confidence !== "unknown");
}

/**
 * 第1層(ゴール): 志望校 or レベル帯 + 受験方式 + 科目
 */
export function hasGoalLayer(p: UserLearningProfile): boolean {
  const schoolsOk =
    known(p.goal.targetSchools) &&
    (p.goal.targetSchools.value?.length ?? 0) > 0;
  return schoolsOk && known(p.goal.admissionType) && known(p.goal.subjects);
}

/**
 * 第2層(現在地): 模試あり、または代替指標(高校帯+順位 or 英検等)、または単元マスタリー
 */
export function hasCurrentLevelLayer(p: UserLearningProfile): boolean {
  if (p.currentLevel.hasMockExam && known(p.currentLevel.mockSummary))
    return true;
  const proxy = p.currentLevel.proxyIndicators;
  const proxyOk =
    (known(proxy.schoolLevelBand) && known(proxy.classRank)) ||
    known(proxy.certifications) ||
    known(proxy.periodicTestScores);
  return proxyOk || known(p.currentLevel.unitMastery);
}

/**
 * 第4層(可処分時間): 平日/休日の確保時間
 */
export function hasAvailabilityLayer(p: UserLearningProfile): boolean {
  return known(p.availability.weekdayHours) && known(p.availability.weekendHours);
}

export interface PlanGate {
  ok: boolean;
  missing: string[]; // 不足層のラベル
}

/**
 * 計画生成の可否。第1・2・4層が未取得ならブロックし、不足を返す。
 * (第3層・第5層は仮値で進行可)
 */
export function canGeneratePlan(p: UserLearningProfile): PlanGate {
  const missing: string[] = [];
  if (!hasGoalLayer(p)) missing.push("第1層: 志望校・受験方式・科目");
  if (!hasCurrentLevelLayer(p))
    missing.push("第2層: 現在地(模試 または 代替指標/診断)");
  if (!hasAvailabilityLayer(p)) missing.push("第4層: 平日・休日の確保時間");
  return { ok: missing.length === 0, missing };
}

// ---------------- 完成度 ----------------

/** 5層の主要フィールドの取得率(0-100) */
export function computeCompleteness(p: UserLearningProfile): number {
  const checks: boolean[] = [
    // 第1層
    (p.goal.targetSchools.value?.length ?? 0) > 0,
    known(p.goal.admissionType),
    known(p.goal.subjects),
    known(p.goal.grade),
    // 第2層
    hasCurrentLevelLayer(p),
    known(p.currentLevel.unitMastery),
    // 第3層
    known(p.materials),
    known(p.schoolProgress),
    // 第4層
    known(p.availability.weekdayHours),
    known(p.availability.weekendHours),
    known(p.availability.clubActivity),
    known(p.availability.partTimeJob),
    // 第5層
    known(p.traits.preferredTone),
    known(p.traits.reportFrequency),
    known(p.traits.pastFailurePattern),
  ];
  const got = checks.filter(Boolean).length;
  return Math.round((got / checks.length) * 100);
}

// ---------------- 可処分時間(§6-2) ----------------

export interface AvailabilityCalc {
  /** 実効週間時間 */
  effectiveWeeklyHours: number;
  /** 自己申告の素の週間時間 */
  rawWeeklyHours: number;
  /** 通学時間(暗記系専用枠、分/週) */
  commuteMinutesPerWeek: number;
}

/**
 * 実効週間時間 = (平日×5 + 休日×2) × 0.8 - 学校課題見込み - 外部授業固定枠
 * 自己申告値は必ず 0.8 掛けで見積もる。
 */
export function computeAvailability(p: UserLearningProfile): AvailabilityCalc {
  const weekday = p.availability.weekdayHours.value ?? 2;
  const weekend = p.availability.weekendHours.value ?? 5;
  const rawWeeklyHours = weekday * 5 + weekend * 2;

  // 学校課題見込み(週・時間)
  const load = p.schoolAssignmentLoad.value;
  const assignmentHours =
    load === "heavy" ? 6 : load === "normal" ? 3 : load === "light" ? 1 : 0;

  // 外部授業(塾・映像)の固定枠(週・時間)
  const external = p.externalClasses.value ?? [];
  const externalHours = external.reduce((sum, c) => {
    const [sh, sm] = c.startAt.split(":").map(Number);
    const [eh, em] = c.endAt.split(":").map(Number);
    const h = (eh * 60 + em - sh * 60 - sm) / 60;
    return sum + (Number.isFinite(h) && h > 0 ? h : 0);
  }, 0);

  const effectiveWeeklyHours = Math.max(
    0,
    Math.round((rawWeeklyHours * 0.8 - assignmentHours - externalHours) * 10) /
      10,
  );

  const commutePerDay = p.availability.commuteMinutesPerDay.value ?? 0;
  return {
    effectiveWeeklyHours,
    rawWeeklyHours,
    commuteMinutesPerWeek: commutePerDay * 5,
  };
}

// ---------------- 週次テンプレート(§6-3 4日2日1日) ----------------

export type WeekdaySlotKind = "new" | "review" | "check";

/**
 * ユーザーの固定予定(曜日番号 0=日〜6=土 の埋まっている曜日)を避けつつ、
 * 空いている曜日にだけ 新規 / 復習 / 確認 を割り当てる(基本は 4:2:1)。
 * 空き曜日が7未満のときは比率を保って圧縮する。
 * 忙しい曜日には絶対に割り当てない(受け入れ基準)。
 */
export function assignWeeklyTemplate(
  busyWeekdays: number[],
): Record<number, WeekdaySlotKind> {
  const busy = new Set(busyWeekdays);
  const order = [1, 2, 3, 4, 5, 6, 0]; // 月〜日
  const free = order.filter((d) => !busy.has(d));
  const n = free.length;
  const result: Record<number, WeekdaySlotKind> = {};
  if (n === 0) return result;
  if (n === 1) {
    result[free[0]] = "new";
    return result;
  }

  // 4:2:1 の比率で配分。確認日は最低1日確保する。
  let newCount = Math.max(1, Math.round((n * 4) / 7));
  let reviewCount = Math.round((n * 2) / 7);
  let checkCount = n - newCount - reviewCount;
  if (checkCount < 1) {
    // 復習→新規の順に削って確認日を1日確保
    const deficit = 1 - checkCount;
    if (reviewCount >= deficit) reviewCount -= deficit;
    else newCount -= deficit - reviewCount, (reviewCount = 0);
    checkCount = 1;
  }

  free.forEach((d, i) => {
    if (i < newCount) result[d] = "new";
    else if (i < newCount + reviewCount) result[d] = "review";
    else result[d] = "check";
  });
  return result;
}
