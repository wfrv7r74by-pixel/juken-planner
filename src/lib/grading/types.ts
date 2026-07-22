// 解答採点システムの型定義(開発エリア)。
// 本実装前でも、UI や DB 設計がこの形に沿えるよう先に定義しておく。

export type GradingSubject =
  | "math"
  | "english"
  | "physics"
  | "chemistry"
  | "biology"
  | "other";

export interface GradingRequest {
  subject: GradingSubject;
  /** 問題文(テキスト)。画像対応は将来 image_url を足す */
  question: string;
  /** ユーザーの解答 */
  answer: string;
  /** 模範解答やルーブリック(任意) */
  rubric?: string;
}

export interface GradingResult {
  /** 0〜100 の得点率 */
  score: number;
  /** 満点に対する部分点の内訳(任意) */
  breakdown?: { point: string; earned: number; max: number }[];
  /** 添削コメント */
  feedback: string;
  /** 次に復習すべき単元・キーワード */
  reviewTopics: string[];
}
