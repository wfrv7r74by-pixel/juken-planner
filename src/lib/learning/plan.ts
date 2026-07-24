// 学習相談 Phase 1-3: 週次計画の生成エンジン(純粋関数。DBアクセスは actions 側)。
//
// 仕様書 §6 の生成順序を決定論的に組み立てる:
//   ① 総量の可視化 → ② 逆算(残り日数で除算) → ③ 個別調整(配分) →
//   ④ 週次テンプレ(4:2:1) → ⑤ タスク具体化(教材名+範囲+到達度)
//
// このモジュールは「制約(ブループリント)」を決定論的に確定させる。
// 具体的な範囲タスクの文言は AI 層(src/lib/ai/plan.ts)が肉付けするが、
// AI 不可時のフォールバック(buildDeterministicTasks)もここに持つ。
import {
  canGeneratePlan,
  computeAvailability,
  assignWeeklyTemplate,
  type AvailabilityCalc,
  type PlanGate,
  type WeekdaySlotKind,
} from "./profile";
import { SUBJECT_CHOICES } from "./questions";
import type { LearningPhase, UserLearningProfile } from "./types";

// ---------------- 型 ----------------

export type PlanTaskKind = WeekdaySlotKind; // "new" | "review" | "check"

/** 生成時の下書き(id/done を持たない)。AI・決定論のどちらもこの形で返す。 */
export interface PlanTaskDraft {
  weekday: number; // 0=日〜6=土
  slotKind: PlanTaskKind;
  subject: string; // 科目名(日本語)
  materialTitle: string; // 教材名
  rangeStart: string; // 開始位置(ページ/問題番号/単語番号)
  rangeEnd: string; // 終了位置
  targetLevel: string; // 目標到達度(例: 完璧に暗記 / 8割正答)
  unitLabel?: string; // 単位(ページ/問/語)
  note?: string;
}

/** 保存される確定タスク。 */
export interface PlanTask extends PlanTaskDraft {
  id: string;
  done: boolean;
}

/** weekly_plans.plan(jsonb)に保存する週次計画の全体。 */
export interface WeeklyPlanData {
  weekStart: string;
  phase: LearningPhase;
  theme: string;
  tasks: PlanTask[];
  subjectAllocation: SubjectAllocation[];
  availability: {
    effectiveWeeklyHours: number;
    rawWeeklyHours: number;
    commuteMinutesPerWeek: number;
  };
  notes: string[];
  examDate: string | null;
  weeksUntilExam: number | null;
  busyWeekdays: number[];
  generatedBy: "ai" | "deterministic";
  generatedAt: string; // ISO8601
}

export interface SubjectAllocation {
  subject: string;
  /** 正規化された配分比率(合計1) */
  weight: number;
  /** 割り当て週間時間(参考値。タスクは範囲ベースなので目安) */
  weeklyHours: number;
  /** なぜ厚い/薄いかの理由 */
  reason: string;
}

export interface MaterialPace {
  subject: string;
  title: string;
  unitLabel: string;
  totalUnits: number;
  completedUnits: number;
  remainingUnits: number;
  /** 逆算した週次ペース(残り ÷ 残り週数、scaleFactor 反映) */
  weeklyUnits: number;
  /** 総量が登録済みか(未登録なら AI に範囲決定を委ねる) */
  hasVolume: boolean;
}

export interface PlanBlueprint {
  weekStart: string; // その週の月曜(ISO date)
  phase: LearningPhase;
  gate: PlanGate;
  availability: AvailabilityCalc;
  busyWeekdays: number[]; // 部活・バイトで埋まる曜日
  slots: Record<number, WeekdaySlotKind>; // 空き曜日への 4:2:1 割当
  subjectAllocation: SubjectAllocation[];
  materialPaces: MaterialPace[];
  weeksUntilExam: number | null;
  examDate: string | null;
  notes: string[];
  /** diagnostic フェーズの減量係数(steady=1.0) */
  scaleFactor: number;
}

/** エンジンの入力(DB から actions 側で組み立てて渡す) */
export interface PlanEngineInput {
  profile: UserLearningProfile;
  today: string; // ISO date(YYYY-MM-DD)
  examDate: string | null; // 本命試験日(milestones.is_target 由来)
  materials: {
    subject: string;
    title: string;
    unitLabel: string;
    totalUnits: number;
    completedUnits: number;
  }[];
  /** 模試由来の科目別偏差値(あれば配分に反映) */
  subjectDeviations?: { subject: string; deviation: number | null }[];
  /** 未習単元(level 0)。演習タスクを割り当ててはならない対象 */
  unlearnedUnits?: { subject: string; unit: string }[];
}

// ---------------- ユーティリティ ----------------

const SUBJECT_LABEL: Record<string, string> = Object.fromEntries(
  SUBJECT_CHOICES.map((c) => [c.value, c.label]),
);

/** code か 日本語名 を受けて日本語ラベルへ寄せる */
function subjectLabel(codeOrName: string): string {
  return SUBJECT_LABEL[codeOrName] ?? codeOrName;
}

/**
 * 指定日を含む週の月曜(ISO date)を返す。
 * 日付文字列を UTC として扱い、toISOString とのタイムゾーンずれを避ける
 * (ローカル解釈だと JST 等で1日ずれる)。
 */
export function mondayOf(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=日
  const diff = day === 0 ? -6 : 1 - day; // 月曜まで戻す
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function diffDays(fromISO: string, toISO: string): number {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

// ---------------- ③ 配分(§6-5) ----------------

/**
 * 科目別の時間配分比率。苦手科目(模試偏差値 or 自己申告)へ厚く、得意は薄く(ゼロにはしない)。
 * ここは母集団補正(§5-4)ではなく配分ヒューリスティックなので定数使用可。
 */
export function computeSubjectAllocation(
  input: PlanEngineInput,
  effectiveWeeklyHours: number,
): SubjectAllocation[] {
  const codes = (input.profile.goal.subjects.value ?? [])
    .map((s) => s.code)
    // 有効な科目コードのみ(受験方式の "general" 等が混入しても除外する)
    .filter((c) => c in SUBJECT_LABEL);
  // 科目未取得なら、保有教材の科目から代替
  const subjects =
    codes.length > 0
      ? codes.map(subjectLabel)
      : Array.from(new Set(input.materials.map((m) => subjectLabel(m.subject))));
  if (subjects.length === 0) return [];

  const devBySubject = new Map<string, number>();
  for (const d of input.subjectDeviations ?? []) {
    if (typeof d.deviation === "number")
      devBySubject.set(subjectLabel(d.subject), d.deviation);
  }
  const weakSet = new Set(
    (input.profile.traits.selfAssessedWeaknesses.value ?? []).map(subjectLabel),
  );
  const strongSet = new Set(
    (input.profile.traits.selfAssessedStrengths.value ?? []).map(subjectLabel),
  );

  const raw = subjects.map((subject) => {
    let w = 1;
    let reason = "標準配分";
    const dev = devBySubject.get(subject);
    if (typeof dev === "number") {
      // 偏差値が低いほど加点(50 基準、±で最大 +1.5/-0.5)
      const boost = Math.max(-0.5, Math.min(1.5, (55 - dev) / 10));
      w += boost;
      reason =
        boost > 0.1
          ? `模試偏差値 ${dev} が低め → 厚めに配分`
          : boost < -0.1
            ? `模試偏差値 ${dev} が高め → 頻度を下げる`
            : `模試偏差値 ${dev}`;
    } else if (weakSet.has(subject)) {
      w += 0.5;
      reason = "自己申告の苦手科目 → 厚めに配分";
    } else if (strongSet.has(subject)) {
      w -= 0.3;
      reason = "自己申告の得意科目 → 頻度を下げる";
    }
    return { subject, w: Math.max(0.2, w), reason };
  });

  const sum = raw.reduce((s, r) => s + r.w, 0) || 1;
  return raw.map((r) => ({
    subject: r.subject,
    weight: Math.round((r.w / sum) * 1000) / 1000,
    weeklyHours: Math.round(((r.w / sum) * effectiveWeeklyHours) * 10) / 10,
    reason: r.reason,
  }));
}

// ---------------- ② 逆算(§6-1②) ----------------

export function computeMaterialPaces(
  input: PlanEngineInput,
  weeksUntilExam: number | null,
  scaleFactor: number,
): MaterialPace[] {
  const weeks = weeksUntilExam && weeksUntilExam > 0 ? weeksUntilExam : null;
  return input.materials.map((m) => {
    const total = Math.max(0, m.totalUnits);
    const done = Math.max(0, Math.min(total, m.completedUnits));
    const remaining = Math.max(0, total - done);
    const hasVolume = total > 0;
    const weeklyUnits =
      hasVolume && weeks
        ? Math.max(1, Math.ceil((remaining / weeks) * scaleFactor))
        : 0;
    return {
      subject: subjectLabel(m.subject),
      title: m.title,
      unitLabel: m.unitLabel || "問",
      totalUnits: total,
      completedUnits: done,
      remainingUnits: remaining,
      weeklyUnits,
      hasVolume,
    };
  });
}

// ---------------- ブループリント確定 ----------------

export function buildBlueprint(input: PlanEngineInput): PlanBlueprint {
  const { profile, today, examDate } = input;
  const gate = canGeneratePlan(profile);
  const availability = computeAvailability(profile);

  // フェーズ: 模試未受験なら diagnostic(易しめ・少なめ, §5-3⑤)。
  // 単元マスタリーは第2層ゲートは満たすが、模試が無い限り初期推定に誤差が残る
  // 前提で組むため diagnostic 据え置き(週次データで上方修正する)。
  const phase: LearningPhase = profile.currentLevel.hasMockExam
    ? "steady"
    : "diagnostic";
  const scaleFactor = phase === "diagnostic" ? 0.6 : 1;

  // 忙しい曜日 = 部活の活動日 + バイトの曜日
  const club = profile.availability.clubActivity.value;
  const clubDays = club?.active ? (club.days ?? []) : [];
  const jobDays = (profile.availability.partTimeJob.value ?? []).map(
    (j) => j.dayOfWeek,
  );
  const busyWeekdays = Array.from(new Set([...clubDays, ...jobDays])).sort();
  const slots = assignWeeklyTemplate(busyWeekdays);

  // 逆算の残り週数
  const days = examDate ? diffDays(today, examDate) : null;
  const weeksUntilExam =
    days !== null && days > 0 ? Math.max(1, Math.ceil(days / 7)) : null;

  const subjectAllocation = computeSubjectAllocation(
    input,
    availability.effectiveWeeklyHours,
  );
  const materialPaces = computeMaterialPaces(input, weeksUntilExam, scaleFactor);

  const notes: string[] = [];
  if (phase === "diagnostic") {
    notes.push(
      "最初の2週間は診断フェーズ。過剰に盛ると崩壊するため易しめ・少なめに設定し、週次の確認テスト正答率で上方修正します。",
    );
    notes.push(
      "現在地の精度を上げるため、次回の全統模試・共通テスト模試の申込を今週のタスクに入れています。",
    );
  }
  if (weeksUntilExam === null) {
    notes.push(
      "本命試験日が未設定です。設定すると逆算(週次ペース)の精度が上がります。",
    );
  }
  if (materialPaces.some((m) => !m.hasVolume)) {
    notes.push(
      "総量(ページ数・問題数)が未登録の教材があります。教材ページで登録するとペースを自動算出します。",
    );
  }
  // 併願・出願期の過去問確保(§6-5)
  const month = Number(today.slice(5, 7));
  const concurrent =
    profile.goal.concurrentApplicationCount.value ?? 0;
  if (month >= 12 || month === 1) {
    notes.push(
      "出願・直前期です。併願校の過去問演習コマを先に確保しないと破綻します。過去問枠を優先配置しています。",
    );
  } else if (concurrent >= 2) {
    notes.push(
      `併願 ${concurrent} 校想定。12月以降に過去問演習コマを事前確保する計画にします。`,
    );
  }

  return {
    weekStart: mondayOf(today),
    phase,
    gate,
    availability,
    busyWeekdays,
    slots,
    subjectAllocation,
    materialPaces,
    weeksUntilExam,
    examDate,
    notes,
    scaleFactor,
  };
}

// ---------------- ⑤ タスク具体化: 決定論フォールバック ----------------

/**
 * AI 不可時のフォールバック。範囲ベースを厳守する。
 * - new 枠: 配分上位の科目から、総量登録済み教材の残り範囲を日割りで進める。
 * - review 枠: その週に進めた新規範囲の復習。
 * - check 枠: 週の確認(定着チェック)。
 * 総量未登録の教材は数値範囲を作れないため、正直に「総量未設定」と明示する
 * (偽の範囲は作らない)。
 */
export function buildDeterministicTasks(bp: PlanBlueprint): PlanTaskDraft[] {
  const entries = Object.entries(bp.slots).map(([wd, kind]) => ({
    weekday: Number(wd),
    kind,
  }));
  const newDays = entries.filter((e) => e.kind === "new").map((e) => e.weekday);
  const reviewDays = entries
    .filter((e) => e.kind === "review")
    .map((e) => e.weekday);
  const checkDays = entries
    .filter((e) => e.kind === "check")
    .map((e) => e.weekday);

  // 配分順に教材を並べる(残り範囲がある総量登録済みを優先)
  const paceBySubject = new Map<string, MaterialPace[]>();
  for (const p of bp.materialPaces) {
    const arr = paceBySubject.get(p.subject) ?? [];
    arr.push(p);
    paceBySubject.set(p.subject, arr);
  }
  const orderedSubjects = [...bp.subjectAllocation]
    .sort((a, b) => b.weight - a.weight)
    .map((a) => a.subject);

  const tasks: PlanTaskDraft[] = [];
  const weekRanges: { subject: string; title: string; label: string; from: number; to: number }[] = [];

  // 新規枠: 各 new 曜日に、配分順で科目を割り当てる
  newDays.forEach((weekday, i) => {
    const subject = orderedSubjects[i % Math.max(1, orderedSubjects.length)];
    const paces = (paceBySubject.get(subject) ?? []).filter(
      (p) => p.hasVolume && p.remainingUnits > 0,
    );
    const pace = paces[0];
    if (pace) {
      // 週次ペースを new 日数で割り、この曜日ぶんの範囲を切り出す
      const perDay = Math.max(1, Math.ceil(pace.weeklyUnits / newDays.length));
      const already = weekRanges
        .filter((r) => r.title === pace.title)
        .reduce((s, r) => s + (r.to - r.from + 1), 0);
      const from = pace.completedUnits + already + 1;
      const to = Math.min(pace.totalUnits, from + perDay - 1);
      if (from <= to) {
        weekRanges.push({ subject, title: pace.title, label: pace.unitLabel, from, to });
        tasks.push({
          weekday,
          slotKind: "new",
          subject,
          materialTitle: pace.title,
          rangeStart: String(from),
          rangeEnd: String(to),
          targetLevel: "解き直しなしで解ける状態に",
          unitLabel: pace.unitLabel,
        });
        return;
      }
    }
    // 総量未登録 or 教材なし: 範囲を捏造せず、登録を促すタスク
    const anyMaterial = (paceBySubject.get(subject) ?? [])[0];
    tasks.push({
      weekday,
      slotKind: "new",
      subject,
      materialTitle: anyMaterial?.title ?? `${subject}の教材`,
      rangeStart: "—",
      rangeEnd: "—",
      targetLevel: "教材の総量(ページ数・問題数)を登録すると範囲を自動算出します",
      unitLabel: anyMaterial?.unitLabel,
      note: "総量未設定のため範囲は未確定",
    });
  });

  // 復習枠: 直近4日で進めた新規範囲をまとめて復習
  reviewDays.forEach((weekday) => {
    if (weekRanges.length === 0) {
      tasks.push({
        weekday,
        slotKind: "review",
        subject: orderedSubjects[0] ?? "全科目",
        materialTitle: "今週の新規範囲",
        rangeStart: "—",
        rangeEnd: "—",
        targetLevel: "新規に進めた範囲を復習",
      });
      return;
    }
    for (const r of weekRanges) {
      tasks.push({
        weekday,
        slotKind: "review",
        subject: r.subject,
        materialTitle: r.title,
        rangeStart: String(r.from),
        rangeEnd: String(r.to),
        targetLevel: "間違えた箇所を再演習して定着",
        unitLabel: r.label,
      });
    }
  });

  // 確認枠: 週の確認テスト+翌週調整
  checkDays.forEach((weekday) => {
    tasks.push({
      weekday,
      slotKind: "check",
      subject: orderedSubjects[0] ?? "全科目",
      materialTitle: "今週の確認テスト",
      rangeStart: "—",
      rangeEnd: "—",
      targetLevel: "今週進めた範囲から確認。誤答は翌週に復習優先",
    });
  });

  return tasks;
}

/** その週のメインテーマ(決定論フォールバック用) */
export function deterministicTheme(bp: PlanBlueprint): string {
  if (bp.phase === "diagnostic") return "現在地の把握と学習リズムづくり";
  // 最も厚く配分した(=苦手な)科目を今週の主役にする
  const top = [...bp.subjectAllocation].sort((a, b) => b.weight - a.weight)[0]
    ?.subject;
  if (top) return `${top}を軸に、基礎の抜けを埋める1週間`;
  return "今週の学習リズムを固める";
}
