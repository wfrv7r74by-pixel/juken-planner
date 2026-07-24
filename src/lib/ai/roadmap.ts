// 勉強計画 ロードマップの「文言の肉付け」を担う AI 層(サーバー専用)。
//
// 決定論エンジン(src/lib/learning/roadmap.ts)が確定させた区分・月境界・週境界の
// 「構造(日付/種別)」はそのままに、科目別の抽象概念(到達目標)や月/週目標の
// 文言だけを Opus が具体化する。失敗時は骨格(決定論)をそのまま使う。
import Anthropic from "@anthropic-ai/sdk";
import { tierParams } from "@/lib/ai/models";
import {
  DIVISION_NAME,
  type DivisionConcepts,
  type DivisionKind,
  type MonthlyGoal,
  type RoadmapData,
  type WeeklyGoal,
} from "@/lib/learning/roadmap";

export interface RoadmapAiResult {
  concepts: DivisionConcepts[];
  monthlyGoals: MonthlyGoal[];
  currentWeeklyGoal: WeeklyGoal | null;
}

const SYSTEM = `あなたは大手学習塾の受験カリキュラム設計者。生徒の「受験までのロードマップ」の文言を作る。

# 前提
区分の期間(日付)・種別(基礎/演習/発展/過去問/共テ)・月境界は既に決定済み。あなたは文言だけを埋める。

# 絶対ルール
- 出力は「抽象概念(到達目標)」まで。具体的な参考書名・問題集名は書かない(教材提案は別ステップ)。
  良い例: 「英語基礎=単語2000語を即答＋文法を一周」「数学基礎=典型例題を自力で解けるまで」
- 各区分でも復習の確保を前提に、盛りすぎない現実的な目標にする。
- 合否の断定・他者比較・過度な不安の煽りは禁止。トーンは preferredTone に従う。
- 与えた divisions / months / weekStart の構造(divisionKind・month・weekStart)は変えない。文言のみ。

# 出力
submit を必ず1回呼ぶ。concepts(区分×科目の到達目標)、monthlyGoals(各月の目標)、
currentWeeklyGoal(今週の目標) を返す。`;

/** 骨格を AI へ渡す JSON に整形 */
function buildContext(
  skeleton: RoadmapData,
  levelBand: string,
  tone: string,
): string {
  const context = {
    preferredTone: tone,
    levelBand,
    examDate: skeleton.examDate,
    divisions: skeleton.divisions.map((d) => ({
      divisionKind: d.kind,
      name: DIVISION_NAME[d.kind],
      startDate: d.startDate,
      endDate: d.endDate,
    })),
    subjects: skeleton.concepts[0]?.subjects.map((s) => s.subject) ?? [],
    months: skeleton.monthlyGoals.map((m) => ({
      month: m.month,
      divisionKind: m.divisionKind,
    })),
    currentWeek: skeleton.currentWeeklyGoal
      ? {
          weekStart: skeleton.currentWeeklyGoal.weekStart,
          divisionKind: skeleton.currentWeeklyGoal.divisionKind,
        }
      : null,
  };
  return [
    "以下の構造(日付・種別は固定)に、抽象概念と目標の文言を入れてください。",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
  ].join("\n");
}

const KINDS: DivisionKind[] = ["basic", "practice", "advance", "past", "common"];

type RawConcept = { divisionKind?: unknown; subjects?: unknown };
type RawSubject = { subject?: unknown; concept?: unknown };

/**
 * AI 出力を骨格に重ねる(構造は骨格を正、文言は AI があれば採用)。
 * これにより日付・種別・月境界がずれない。
 */
function merge(skeleton: RoadmapData, raw: unknown): RoadmapAiResult {
  const obj = (raw ?? {}) as {
    concepts?: unknown;
    monthlyGoals?: unknown;
    currentWeeklyGoal?: unknown;
  };

  // concepts: kind×subject の文言を map 化
  const conceptMap = new Map<string, string>();
  if (Array.isArray(obj.concepts)) {
    for (const c of obj.concepts as RawConcept[]) {
      const kind = c.divisionKind;
      if (typeof kind !== "string" || !KINDS.includes(kind as DivisionKind))
        continue;
      if (!Array.isArray(c.subjects)) continue;
      for (const s of c.subjects as RawSubject[]) {
        if (typeof s.subject === "string" && typeof s.concept === "string") {
          conceptMap.set(`${kind}::${s.subject}`, s.concept.trim());
        }
      }
    }
  }
  const concepts: DivisionConcepts[] = skeleton.concepts.map((dc) => ({
    divisionKind: dc.divisionKind,
    subjects: dc.subjects.map((s) => ({
      subject: s.subject,
      concept:
        conceptMap.get(`${dc.divisionKind}::${s.subject}`) || s.concept,
    })),
  }));

  // monthlyGoals: month の文言を map 化
  const monthMap = new Map<string, string>();
  if (Array.isArray(obj.monthlyGoals)) {
    for (const m of obj.monthlyGoals as { month?: unknown; goal?: unknown }[]) {
      if (typeof m.month === "string" && typeof m.goal === "string") {
        monthMap.set(m.month, m.goal.trim());
      }
    }
  }
  const monthlyGoals: MonthlyGoal[] = skeleton.monthlyGoals.map((mg) => ({
    ...mg,
    goal: monthMap.get(mg.month) || mg.goal,
  }));

  // currentWeeklyGoal: 文言のみ差し替え
  let currentWeeklyGoal: WeeklyGoal | null = skeleton.currentWeeklyGoal;
  const cw = obj.currentWeeklyGoal as { goal?: unknown } | undefined;
  if (currentWeeklyGoal && cw && typeof cw.goal === "string" && cw.goal.trim()) {
    currentWeeklyGoal = { ...currentWeeklyGoal, goal: cw.goal.trim() };
  }

  return { concepts, monthlyGoals, currentWeeklyGoal };
}

export async function enrichRoadmapAI(
  skeleton: RoadmapData,
  ctx: { levelBand: string; tone: string },
): Promise<RoadmapAiResult | null> {
  if (skeleton.divisions.length === 0) return null;

  const tool: Anthropic.Messages.Tool = {
    name: "submit",
    description: "ロードマップの文言(概念・月/週目標)を提出する(必ず1回呼ぶ)",
    input_schema: {
      type: "object",
      properties: {
        concepts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              divisionKind: {
                type: "string",
                enum: ["basic", "practice", "advance", "past", "common"],
              },
              subjects: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    subject: { type: "string" },
                    concept: {
                      type: "string",
                      description: "抽象概念(到達目標)。書名は書かない",
                    },
                  },
                  required: ["subject", "concept"],
                },
              },
            },
            required: ["divisionKind", "subjects"],
          },
        },
        monthlyGoals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              month: { type: "string", description: "YYYY-MM" },
              goal: { type: "string" },
            },
            required: ["month", "goal"],
          },
        },
        currentWeeklyGoal: {
          type: "object",
          properties: { goal: { type: "string" } },
          required: ["goal"],
        },
      },
      required: ["concepts", "monthlyGoals"],
    },
  };

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      ...tierParams("strategy"),
      max_tokens: 4096,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "submit" },
      messages: [
        {
          role: "user",
          content: buildContext(skeleton, ctx.levelBand, ctx.tone),
        },
      ],
    });
    const tu = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "submit",
    );
    if (!tu) return null;
    return merge(skeleton, tu.input);
  } catch (e) {
    console.error("enrichRoadmapAI:", e instanceof Error ? e.message : e);
    return null;
  }
}
