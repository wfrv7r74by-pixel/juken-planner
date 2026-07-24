// 初回ヒアリングの質問定義(§4-2 必須10問)。
// すべて「わからない/未定」を持ち、選択式を基本とする。
import type { UserLearningProfile } from "./types";
import {
  hasGoalLayer,
  hasAvailabilityLayer,
  hasCurrentLevelLayer,
} from "./profile";

export type QuestionId =
  | "goal.school"
  | "goal.levelBand"
  | "goal.admissionType"
  | "goal.subjects"
  | "goal.grade"
  | "availability.club"
  | "availability.job"
  | "materials.owned"
  | "level.entry"
  | "level.proxy"
  | "traits.tone";

export interface Choice {
  value: string;
  label: string;
}

export type QuestionType =
  | "single" // 単一選択
  | "multi" // 複数選択
  | "school" // 志望校(名称+学部)
  | "hours" // 平日/休日スライダー
  | "club" // 部活(有無+引退月)
  | "job" // バイト曜日
  | "materials" // 教材(科目+名称)
  | "mock" // 模試の有無
  | "proxy"; // 現在地の代替指標(模試なし時, §5-3①)

export interface Question {
  id: QuestionId;
  title: string;
  help?: string;
  type: QuestionType;
  choices?: Choice[];
  /** 「わからない/未定」を選んだときのラベル */
  unknownLabel: string;
}

export const LEVEL_BANDS: Choice[] = [
  { value: "top", label: "最難関(旧帝・早慶・医学部)" },
  { value: "upper", label: "難関(上位国公立・上位私大)" },
  { value: "middle", label: "中堅(地方国公立・中堅私大)" },
  { value: "basic", label: "基礎固めから" },
];

export const ADMISSION_TYPES: Choice[] = [
  { value: "general", label: "一般選抜" },
  { value: "common_test", label: "共通テスト利用" },
  { value: "recommendation", label: "学校推薦型" },
  { value: "comprehensive", label: "総合型(旧AO)" },
];

export const SUBJECT_CHOICES: Choice[] = [
  { value: "english", label: "英語" },
  { value: "math", label: "数学" },
  { value: "japanese", label: "国語" },
  { value: "physics", label: "物理" },
  { value: "chemistry", label: "化学" },
  { value: "biology", label: "生物" },
  { value: "japanese_history", label: "日本史" },
  { value: "world_history", label: "世界史" },
  { value: "geography", label: "地理" },
  { value: "civics", label: "公民" },
  { value: "information", label: "情報" },
];

export const GRADES: Choice[] = [
  { value: "hs1", label: "高1" },
  { value: "hs2", label: "高2" },
  { value: "hs3", label: "高3" },
  { value: "ronin", label: "浪人" },
];

export const TONES: Choice[] = [
  { value: "supportive", label: "励まし寄り(伴走型)" },
  { value: "strict", label: "厳しめ(管理型)" },
];

/** 全10問の定義(表示順) */
export const QUESTIONS: Question[] = [
  {
    id: "goal.school",
    title: "志望校・学部は決まっていますか?",
    help: "第一志望を1つ。複数はあとで追加できます",
    type: "school",
    unknownLabel: "まだ未定",
  },
  {
    id: "goal.levelBand",
    title: "目標のレベル帯は?",
    help: "志望校が未定でも、狙う難易度帯を教えてください",
    type: "single",
    choices: LEVEL_BANDS,
    unknownLabel: "わからない",
  },
  {
    id: "goal.admissionType",
    title: "受験方式は?(複数可)",
    type: "multi",
    choices: ADMISSION_TYPES,
    unknownLabel: "わからない",
  },
  {
    id: "goal.subjects",
    title: "受験科目は?(複数可)",
    help: "迷い中の科目も選んでOK",
    type: "multi",
    choices: SUBJECT_CHOICES,
    unknownLabel: "迷い中(方式から推定)",
  },
  {
    id: "goal.grade",
    title: "学年は?",
    type: "single",
    choices: GRADES,
    unknownLabel: "その他",
  },
  {
    id: "availability.club",
    title: "部活はしていますか?",
    help: "引退予定の月があれば選んでください",
    type: "club",
    unknownLabel: "していない",
  },
  {
    id: "availability.job",
    title: "バイトの曜日は?",
    type: "job",
    unknownLabel: "していない",
  },
  {
    id: "materials.owned",
    title: "持っている参考書・問題集は?",
    help: "科目と教材名。あとで検索追加もできます",
    type: "materials",
    unknownLabel: "特にない/あとで登録",
  },
  {
    id: "level.entry",
    title: "模試を受けたことはありますか?",
    help: "あれば成績から現在地を判定します",
    type: "mock",
    unknownLabel: "受けたことがない",
  },
  {
    id: "traits.tone",
    title: "どんなトーンで伴走してほしいですか?",
    type: "single",
    choices: TONES,
    unknownLabel: "おまかせ(励まし寄り)",
  },
];

/**
 * 現在地の代替指標(§5-3①)。模試なしユーザーで第2層が未取得のときだけ聞く。
 * 英検などの資格、または高校の学力帯＋学年順位で現在地を推定できる。
 */
export const PROXY_QUESTION: Question = {
  id: "level.proxy",
  title: "今の学力の目安を教えてください",
  help: "模試がなくても、英検などの資格 / 高校の成績＋学年順位(高2・高3) / 高校入試の結果(新高1・高1)で現在地を推定できます",
  type: "proxy",
  unknownLabel: "わからない(診断テストは近日対応)",
};

/**
 * プロフィールを見て、まだ聞いていない質問だけを返す(一度聞いた項目は再提示しない)。
 * 回答済みは answeredQuestionIds で判定(「わからない」を選んでも再提示しない)。
 * goal.levelBand は志望校が確定しているなら不要。
 * 模試なし & 第2層未取得なら、代替指標(level.proxy)を末尾に追加する。
 */
export function pendingQuestions(p: UserLearningProfile): Question[] {
  const answered = new Set(p.answeredQuestionIds);
  const schoolsSet = (p.goal.targetSchools.value?.length ?? 0) > 0;

  const base = QUESTIONS.filter((q) => {
    if (answered.has(q.id)) return false;
    // レベル帯は志望校が確定しているなら不要
    if (q.id === "goal.levelBand" && schoolsSet) return false;
    return true;
  });

  // 模試を「なし」と答え、かつ現在地(第2層)がまだ埋まっていないなら代替指標を聞く
  const needProxy =
    answered.has("level.entry") &&
    !p.currentLevel.hasMockExam &&
    !hasCurrentLevelLayer(p) &&
    !answered.has("level.proxy");

  return needProxy ? [...base, PROXY_QUESTION] : base;
}

// 進行度: 第1・4層が揃えば計画生成に進める
export function onboardingReady(p: UserLearningProfile): boolean {
  return hasGoalLayer(p) && hasAvailabilityLayer(p);
}
