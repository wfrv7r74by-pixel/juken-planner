// 学習相談 Phase 1-3: 週次計画の「タスク具体化」を担う AI 層(サーバー専用)。
//
// 決定論エンジン(src/lib/learning/plan.ts)が確定させた制約(ブループリント)を渡し、
// Opus(strategy ティア)が範囲ベースの具体タスク(教材名+開始+終了+到達度)へ落とし込む。
// 失敗時は null を返し、呼び出し側(actions)が決定論フォールバックへ切り替える。
import Anthropic from "@anthropic-ai/sdk";
import { tierParams } from "@/lib/ai/models";
import type {
  PlanBlueprint,
  PlanTaskDraft,
  PlanTaskKind,
} from "@/lib/learning/plan";
import type { UserLearningProfile } from "@/lib/learning/types";

export interface PlanAiResult {
  theme: string;
  tasks: PlanTaskDraft[];
}

const SYSTEM = `あなたは大手学習塾の受験コーチ。生徒の「今週の学習計画」を組む。

# 絶対ルール(違反は不可)
- タスクは必ず「範囲ベース」。時間ベース(「英語を2時間」等)は禁止。
- 各タスクに 教材名 / 開始位置 / 終了位置 / 目標到達度 の4要素を必ず含める。
  例: システム英単語 / 401 / 800 / 「見て0.5秒で意味が出る状態に」
- slots で渡された曜日のみにタスクを置く。忙しい曜日(部活・バイト)には絶対に置かない。
- 各曜日の slotKind に従う:
  - new(新規): 新しい範囲を進める。配分比率(weight)が高い科目ほど多く割り当てる。
  - review(復習): その週の new で進めた範囲を復習する。
  - check(確認): 今週進めた範囲からの確認テスト。誤答は翌週に復習優先と note に書く。
- unlearnedUnits(未習単元)には演習タスクを割り当てない。
- 総量が既知の教材(hasVolume=true)は remaining の範囲内で切る。
  未登録(hasVolume=false)でも、その教材の一般的な構成の知識から具体的な範囲を提案してよい
  (ただし推測なら note に「目安」と記す)。
- diagnostic フェーズは易しめ・少なめ。過剰に盛らない。
- トーンは preferredTone に従う。達成を促す前向きな note を添える。合否の断定はしない。

# 出力
submit ツールを必ず1回だけ呼ぶ。theme(今週のメインテーマを1つ)と tasks を返す。`;

function toneLabel(p: UserLearningProfile): string {
  return p.traits.preferredTone.value === "strict" ? "厳しめ(管理型)" : "励まし寄り(伴走型)";
}

/** ブループリントを AI へ渡す JSON 文字列に整形する */
function buildContext(
  bp: PlanBlueprint,
  profile: UserLearningProfile,
  unlearnedUnits: { subject: string; unit: string }[],
): string {
  const slots = Object.entries(bp.slots).map(([wd, kind]) => ({
    weekday: Number(wd),
    slotKind: kind,
  }));
  const context = {
    weekStart: bp.weekStart,
    phase: bp.phase,
    preferredTone: toneLabel(profile),
    weeksUntilExam: bp.weeksUntilExam,
    examDate: bp.examDate,
    busyWeekdays: bp.busyWeekdays,
    slots,
    subjectAllocation: bp.subjectAllocation,
    materials: bp.materialPaces.map((m) => ({
      subject: m.subject,
      title: m.title,
      unitLabel: m.unitLabel,
      hasVolume: m.hasVolume,
      completedUnits: m.completedUnits,
      totalUnits: m.totalUnits,
      remainingUnits: m.remainingUnits,
      weeklyUnits: m.weeklyUnits,
    })),
    unlearnedUnits,
    notes: bp.notes,
  };
  return [
    "曜日は 0=日,1=月,...,6=土。",
    "以下の制約(ブループリント)に厳密に従って今週のタスクを作ってください。",
    "```json",
    JSON.stringify(context, null, 2),
    "```",
  ].join("\n");
}

const KINDS: PlanTaskKind[] = ["new", "review", "check"];

/** AI 出力を検証し、ルール違反タスクを除外して正規化する */
function sanitize(
  raw: unknown,
  bp: PlanBlueprint,
): PlanTaskDraft[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { tasks?: unknown }).tasks))
    return [];
  const allowedDays = new Set(Object.keys(bp.slots).map(Number));
  const out: PlanTaskDraft[] = [];
  for (const t of (raw as { tasks: unknown[] }).tasks) {
    if (!t || typeof t !== "object") continue;
    const o = t as Record<string, unknown>;
    const weekday = Number(o.weekday);
    const slotKind = o.slotKind as PlanTaskKind;
    const subject = typeof o.subject === "string" ? o.subject.trim() : "";
    const materialTitle =
      typeof o.materialTitle === "string" ? o.materialTitle.trim() : "";
    const rangeStart =
      o.rangeStart == null ? "" : String(o.rangeStart).trim();
    const rangeEnd = o.rangeEnd == null ? "" : String(o.rangeEnd).trim();
    const targetLevel =
      typeof o.targetLevel === "string" ? o.targetLevel.trim() : "";

    // 4要素 + 曜日/種別の妥当性を必須にする(範囲ベース厳守)
    if (!allowedDays.has(weekday)) continue;
    if (!KINDS.includes(slotKind)) continue;
    if (!subject || !materialTitle || !rangeStart || !rangeEnd || !targetLevel)
      continue;

    out.push({
      weekday,
      slotKind,
      subject,
      materialTitle,
      rangeStart,
      rangeEnd,
      targetLevel,
      unitLabel:
        typeof o.unitLabel === "string" && o.unitLabel.trim()
          ? o.unitLabel.trim()
          : undefined,
      note:
        typeof o.note === "string" && o.note.trim() ? o.note.trim() : undefined,
    });
  }
  return out;
}

/**
 * Opus に範囲タスクを具体化させる。失敗(APIエラー/未呼び出し/検証で全滅)時は null。
 * 呼び出し側は null なら決定論フォールバックへ切り替える。
 */
export async function generatePlanTasksAI(
  bp: PlanBlueprint,
  profile: UserLearningProfile,
  unlearnedUnits: { subject: string; unit: string }[],
): Promise<PlanAiResult | null> {
  const tool: Anthropic.Messages.Tool = {
    name: "submit",
    description: "今週の学習計画(テーマとタスク)を提出する(必ず1回呼ぶ)",
    input_schema: {
      type: "object",
      properties: {
        theme: { type: "string", description: "今週のメインテーマ(1つ)" },
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              weekday: { type: "integer", minimum: 0, maximum: 6 },
              slotKind: { type: "string", enum: ["new", "review", "check"] },
              subject: { type: "string" },
              materialTitle: { type: "string", description: "教材名" },
              rangeStart: { type: "string", description: "開始位置(ページ/問題番号/単語番号)" },
              rangeEnd: { type: "string", description: "終了位置" },
              targetLevel: { type: "string", description: "目標到達度" },
              unitLabel: { type: "string", description: "単位(ページ/問/語)" },
              note: { type: "string" },
            },
            required: [
              "weekday",
              "slotKind",
              "subject",
              "materialTitle",
              "rangeStart",
              "rangeEnd",
              "targetLevel",
            ],
          },
        },
      },
      required: ["theme", "tasks"],
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
        { role: "user", content: buildContext(bp, profile, unlearnedUnits) },
      ],
    });

    const tu = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "submit",
    );
    if (!tu) return null;
    const input = tu.input as { theme?: unknown };
    const tasks = sanitize(tu.input, bp);
    if (tasks.length === 0) return null;
    const theme =
      typeof input.theme === "string" && input.theme.trim()
        ? input.theme.trim()
        : "今週の学習計画";
    return { theme, tasks };
  } catch (e) {
    console.error("generatePlanTasksAI:", e instanceof Error ? e.message : e);
    return null;
  }
}
