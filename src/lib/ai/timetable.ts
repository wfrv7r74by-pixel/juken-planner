// 時間割の「各学習コマの内容(title)」を作る AI 層(サーバー専用)。
// 決定論の時間割スケルトン(時間・科目)はそのままに、科目ごとの学習活動を数種類提案させ、
// アクション側がコマに割り当てる。失敗時は汎用の活動名にフォールバック。
import Anthropic from "@anthropic-ai/sdk";
import { tierParams } from "@/lib/ai/models";

export interface SubjectActivities {
  subject: string;
  activities: string[];
}

const SYSTEM = `あなたは受験コーチ。生徒の「今の区分(基礎/演習/発展/過去問/共テ)」と科目ごとの到達目標に対し、
1コマ(約90分)でやる学習活動を科目ごとに2〜4種類あげる。

ルール:
- 各活動は20字程度の具体的な行動。区分に合わせる(基礎=暗記/例題、演習=標準問題、発展=応用、
  過去問=過去問演習、共テ=形式演習)。
- 手持ち教材があれば範囲入りで(例「システム英単語 401-800」「Next Stage 文法200-300」)。
- 合否の断定・不安を煽る表現はしない。トーンは preferredTone に従う。
- submit を必ず1回呼ぶ。`;

export async function suggestSessionActivities(input: {
  divisionName: string;
  goal: string;
  tone: string;
  items: { subject: string; concept: string }[];
  materials: { subject: string; title: string }[];
}): Promise<SubjectActivities[] | null> {
  if (input.items.length === 0) return [];

  const tool: Anthropic.Messages.Tool = {
    name: "submit",
    description: "科目ごとの学習活動を提出する(必ず1回呼ぶ)",
    input_schema: {
      type: "object",
      properties: {
        subjects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              activities: {
                type: "array",
                items: { type: "string" },
                description: "1コマの学習活動(20字程度)を2〜4個",
              },
            },
            required: ["subject", "activities"],
          },
        },
      },
      required: ["subjects"],
    },
  };

  const matText = input.materials.length
    ? input.materials.map((m) => `${m.subject}: ${m.title}`).join(" / ")
    : "(登録教材なし)";
  const itemsText = input.items
    .map((it) => `- ${it.subject}: ${it.concept}`)
    .join("\n");

  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      ...tierParams("utility"),
      max_tokens: 2048,
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools: [tool],
      tool_choice: { type: "tool", name: "submit" },
      messages: [
        {
          role: "user",
          content: `区分: ${input.divisionName}\n目標(志望): ${input.goal}\nトーン: ${input.tone}\n手持ち教材: ${matText}\n科目別の到達目標:\n${itemsText}`,
        },
      ],
    });
    const tu = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "submit",
    );
    if (!tu) return null;
    const out = tu.input as { subjects?: unknown };
    if (!Array.isArray(out.subjects)) return null;
    const result: SubjectActivities[] = [];
    for (const s of out.subjects as Record<string, unknown>[]) {
      if (typeof s.subject !== "string" || !Array.isArray(s.activities)) continue;
      const activities = (s.activities as unknown[])
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .map((a) => a.trim())
        .slice(0, 4);
      if (activities.length > 0)
        result.push({ subject: s.subject, activities });
    }
    return result;
  } catch (e) {
    console.error("suggestSessionActivities:", e instanceof Error ? e.message : e);
    return null;
  }
}
