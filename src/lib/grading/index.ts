// 解答採点システムのエントリポイント(開発エリア)。
// 現状はスタブ。詳細は ./README.md 参照。
import type { GradingRequest, GradingResult } from "./types";

export type { GradingRequest, GradingResult, GradingSubject } from "./types";

/**
 * 解答を採点する(未実装)。
 * 実装時は src/lib/ai/models.ts のティアと src/lib/ai/gate.ts のゲートを通すこと。
 */
export async function gradeAnswer(
  _request: GradingRequest,
): Promise<GradingResult> {
  throw new Error("採点システムは未実装です(src/lib/grading/README.md 参照)");
}
