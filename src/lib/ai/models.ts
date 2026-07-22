// AI モデルのティア設定を一元管理する。
// 用途ごとにモデルを使い分け、コストと品質のバランスを取る。
// 将来モデルを差し替える・別プロバイダを足す場合もこのファイルだけ変更すればよい。
import type Anthropic from "@anthropic-ai/sdk";

export type AiTier = "strategy" | "utility" | "grading";

export interface TierConfig {
  model: string;
  /** web検索ツールの型。新しいモデルは dynamic filtering 付き(_20260209) */
  webSearchType: "web_search_20260209" | "web_search_20250305";
  /** adaptive thinking を使うか(4.6+のみ対応) */
  adaptiveThinking: boolean;
  /** effort(4.6+のみ。Haiku 4.5 等では未指定) */
  effort?: "low" | "medium" | "high";
}

export const AI_TIERS: Record<AiTier, TierConfig> = {
  // 戦略・相談: 高い知能が価値になる領域。最上位の Opus を使う
  strategy: {
    model: "claude-opus-4-8",
    webSearchType: "web_search_20260209",
    adaptiveThinking: true,
    effort: "medium",
  },
  // 分類・目次取得など軽い定型作業: Haiku 4.5(Opus の約1/5のコスト)
  utility: {
    model: "claude-haiku-4-5",
    webSearchType: "web_search_20250305",
    adaptiveThinking: false,
  },
  // 解答採点: 誤採点は学習の害になるため正確性優先。Opus + 高 effort
  grading: {
    model: "claude-opus-4-8",
    webSearchType: "web_search_20260209",
    adaptiveThinking: true,
    effort: "high",
  },
};

/** ティアに応じた messages.create の共通パラメータを組み立てる */
export function tierParams(
  tier: AiTier,
): Pick<
  Anthropic.Messages.MessageCreateParamsNonStreaming,
  "model" | "thinking" | "output_config"
> {
  const config = AI_TIERS[tier];
  return {
    model: config.model,
    ...(config.adaptiveThinking
      ? { thinking: { type: "adaptive" as const } }
      : {}),
    ...(config.effort ? { output_config: { effort: config.effort } } : {}),
  };
}

/** ティアに応じた web検索ツール定義 */
export function webSearchTool(
  tier: AiTier,
  maxUses: number,
): Anthropic.Messages.ToolUnion {
  return {
    type: AI_TIERS[tier].webSearchType,
    name: "web_search",
    max_uses: maxUses,
  } as Anthropic.Messages.ToolUnion;
}
