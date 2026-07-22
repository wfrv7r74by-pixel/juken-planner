// 解答採点システムのエントリポイント。
// 採点基準は高校履修範囲。大学範囲の背景はプラスαの補足として分離し、
// 高校で習わないが難関大でよく必要な技能は「注目ポイント」にまとめる。
import Anthropic from "@anthropic-ai/sdk";
import { tierParams } from "@/lib/ai/models";
import {
  GRADING_SUBJECT_LABELS,
  type GradingRequest,
  type GradingResult,
} from "./types";

export type {
  GradingRequest,
  GradingResult,
  GradingSubject,
} from "./types";
export { GRADING_SUBJECT_LABELS } from "./types";

const SYSTEM = `あなたは大学受験の答案採点者。採点の基準は「高校の履修範囲(学習指導要領)」とする。

## 採点方針
- 高校範囲を基準に、論理・計算過程・記述の妥当性を評価する。答えが合っていても過程に飛躍・誤りがあれば減点する。
- 部分点を明示する。減点した箇所は必ず理由を添える。
- 高校範囲で復習すべき単元を review_topics に挙げる。
- 高校の学習内容を超える解法を要求して減点してはならない。

## プラスαの補足(該当する場合のみ)
- 問題の背景に大学範囲の理論・概念がある場合、university_context で簡潔に説明する。
  例:「この極限は大学では ε-δ 論法で厳密に定義される」「この反応は大学の分子軌道論で説明される」。
  これは発展的な補足であり、高校範囲の採点には一切影響させない。

## 注目ポイント(該当する場合のみ)
- 高校では明示的に習わないが、難関大の試験で頻出・有利になる技能や着眼点があれば advanced_skills にまとめる。
  例:「対称性を利用した計算の省略」「特定の不等式評価のパターン」「記述答案での論証の型」。

## 科目別の観点
- 数学: 論証の飛躍・場合分けの漏れ・計算ミス・記述の厳密さ
- 物理/化学/生物: 現象の理解・立式の妥当性・有効数字・記述の因果関係
- 英語: 英作文は文法/語法/論理/自然さ、読解は要点把握の正確さ
- 国語: 記述の要素・論理・本文根拠

必ず submit_grading ツールを1回だけ呼んで採点結果を返すこと。`;

const GRADING_TOOL: Anthropic.Messages.Tool = {
  name: "submit_grading",
  description: "採点結果を提出する(必ず1回呼ぶこと)",
  input_schema: {
    type: "object",
    properties: {
      score: { type: "integer", description: "0〜100 の得点率" },
      verdict: { type: "string", description: "一言講評(合格ラインか等、40字程度)" },
      breakdown: {
        type: "array",
        description: "配点別の内訳",
        items: {
          type: "object",
          properties: {
            point: { type: "string", description: "採点項目" },
            earned: { type: "number", description: "獲得点" },
            max: { type: "number", description: "配点" },
          },
          required: ["point", "earned", "max"],
        },
      },
      feedback: { type: "string", description: "添削・改善コメント(具体的に)" },
      review_topics: {
        type: "array",
        items: { type: "string" },
        description: "高校範囲で復習すべき単元",
      },
      university_context: {
        type: "string",
        description: "背景にある大学範囲の内容の補足(あれば。なければ空)",
      },
      advanced_skills: {
        type: "array",
        items: { type: "string" },
        description: "高校では習わないが大学試験で必要な技能・注目ポイント(あれば)",
      },
    },
    required: ["score", "verdict", "feedback", "review_topics"],
  },
};

interface GradingToolInput {
  score?: number;
  verdict?: string;
  breakdown?: { point: string; earned: number; max: number }[];
  feedback?: string;
  review_topics?: string[];
  university_context?: string;
  advanced_skills?: string[];
}

/** 解答を採点する。採点基準は高校範囲、背景は注目ポイント/補足として分離。 */
export async function gradeAnswer(
  request: GradingRequest,
): Promise<GradingResult> {
  const client = new Anthropic();

  const userContent = [
    `科目: ${GRADING_SUBJECT_LABELS[request.subject]}`,
    `【問題】\n${request.question}`,
    `【あなたの解答】\n${request.answer}`,
    request.rubric ? `【模範解答・配点(参考)】\n${request.rubric}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userContent },
  ];

  const response = await client.messages.create({
    ...tierParams("grading"),
    max_tokens: 8192,
    system: [
      { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [GRADING_TOOL],
    tool_choice: { type: "tool", name: "submit_grading" },
    messages,
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit_grading",
  );
  if (!toolUse) {
    throw new Error("採点結果を取得できませんでした。");
  }

  const input = toolUse.input as GradingToolInput;
  const score =
    Number.isFinite(input.score) && input.score! >= 0 && input.score! <= 100
      ? Math.round(input.score!)
      : 0;

  return {
    score,
    verdict: input.verdict ?? "",
    breakdown: Array.isArray(input.breakdown) ? input.breakdown : undefined,
    feedback: input.feedback ?? "",
    reviewTopics: Array.isArray(input.review_topics)
      ? input.review_topics.filter((t) => typeof t === "string")
      : [],
    universityContext: input.university_context?.trim() || undefined,
    advancedSkills:
      Array.isArray(input.advanced_skills) && input.advanced_skills.length > 0
        ? input.advanced_skills.filter((s) => typeof s === "string")
        : undefined,
  };
}
