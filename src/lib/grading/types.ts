// 解答採点システムの型定義。

export type GradingSubject =
  | "math"
  | "english"
  | "physics"
  | "chemistry"
  | "biology"
  | "japanese"
  | "other";

export const GRADING_SUBJECT_LABELS: Record<GradingSubject, string> = {
  math: "数学",
  english: "英語",
  physics: "物理",
  chemistry: "化学",
  biology: "生物",
  japanese: "国語",
  other: "その他",
};

export interface GradingRequest {
  subject: GradingSubject;
  /** 問題文(テキスト)。画像対応は将来 image を足す */
  question: string;
  /** ユーザーの解答 */
  answer: string;
  /** 模範解答や配点(任意) */
  rubric?: string;
}

export interface GradingResult {
  /** 0〜100 の得点率 */
  score: number;
  /** 一言講評(合格ラインか等) */
  verdict: string;
  /** 配点別の内訳(任意) */
  breakdown?: { point: string; earned: number; max: number }[];
  /** 添削・改善コメント */
  feedback: string;
  /** 高校範囲で復習すべき単元 */
  reviewTopics: string[];
  /**
   * プラスα: 問題の背景にある大学範囲の理論・概念の説明(あれば)。
   * 高校範囲の採点には影響させない発展的補足。
   */
  universityContext?: string;
  /**
   * 注目ポイント: 高校では明示的に習わないが、
   * 難関大の試験で頻出・有利になる技能や着眼点(あれば)。
   */
  advancedSkills?: string[];
}
