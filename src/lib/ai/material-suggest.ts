// 教材提案(第2弾): 区分の抽象概念(到達目標)に対応する具体的な参考書を提案する。
// 「どの本を使うか」の推薦は軽い定型作業なので utility ティア(Haiku 4.5)+ web検索を使う。
import Anthropic from "@anthropic-ai/sdk";
import { tierParams, webSearchTool } from "@/lib/ai/models";
import type { MaterialSuggestion } from "@/lib/learning/roadmap";

const SYSTEM = `あなたは日本の大学受験の教材アドバイザー。生徒の「区分(基礎/演習/発展/過去問/共テ)」と
科目ごとの到達目標(抽象概念)に対して、実在する定番の参考書・問題集を提案する。

手順:
1. 必要なら web_search で、その目標・レベルに合う定番教材を確認する(最大3回)。
2. submit_suggestions を必ず1回呼ぶ。

ルール:
- 各(科目×到達目標)につき、実在する参考書を1〜2冊。マイナー本や実在が怪しい本は挙げない。
- reason は「なぜこの目標に合うか」を40字程度で率直に。難易度・目的が目標に合うものを選ぶ。
- 過去問区分は「(志望校)の過去問・赤本」等、共テ区分は共通テスト対策本を中心に。
- 生徒が既に持っている本があれば別で検索追加する前提。ここでは定番の提案に徹する。
- 合否の断定や、特定教材の過度な断定はしない。`;

export async function suggestMaterials(input: {
  divisionName: string;
  goal: string;
  items: { subject: string; concept: string }[];
}): Promise<MaterialSuggestion[] | null> {
  if (input.items.length === 0) return [];
  const client = new Anthropic();

  const tools: Anthropic.Messages.ToolUnion[] = [
    webSearchTool("utility", 3),
    {
      name: "submit_suggestions",
      description: "参考書の提案を提出する(必ず1回呼ぶ)",
      input_schema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                subject: { type: "string" },
                concept: { type: "string", description: "対応する到達目標" },
                books: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string", description: "参考書の正式名称" },
                      reason: { type: "string", description: "目標に合う理由(40字程度)" },
                    },
                    required: ["title", "reason"],
                  },
                },
              },
              required: ["subject", "concept", "books"],
            },
          },
        },
        required: ["suggestions"],
      },
    },
  ];

  const itemsText = input.items
    .map((it) => `- ${it.subject}: ${it.concept}`)
    .join("\n");
  let messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `区分: ${input.divisionName}\n目標(志望): ${input.goal}\n科目別の到達目標:\n${itemsText}`,
    },
  ];
  const system: Anthropic.Messages.TextBlockParam[] = [
    { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
  ];

  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({
      ...tierParams("utility"),
      max_tokens: 3072,
      system,
      tools,
      messages,
    });

    if (res.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: res.content }];
      continue;
    }

    const tu = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "submit_suggestions",
    );
    if (tu) {
      const out = tu.input as { suggestions?: unknown };
      if (!Array.isArray(out.suggestions)) return null;
      const suggestions: MaterialSuggestion[] = [];
      for (const s of out.suggestions as Record<string, unknown>[]) {
        if (typeof s.subject !== "string" || typeof s.concept !== "string")
          continue;
        const books = Array.isArray(s.books)
          ? (s.books as Record<string, unknown>[])
              .filter(
                (b) => typeof b.title === "string" && typeof b.reason === "string",
              )
              .map((b) => ({ title: b.title as string, reason: b.reason as string }))
              .slice(0, 2)
          : [];
        if (books.length > 0)
          suggestions.push({ subject: s.subject, concept: s.concept, books });
      }
      return suggestions;
    }

    if (res.stop_reason === "tool_use") {
      messages = [...messages, { role: "assistant", content: res.content }];
      const results = res.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: "submit_suggestions を呼んでください。",
        }));
      if (results.length > 0)
        messages = [...messages, { role: "user", content: results }];
      continue;
    }

    break;
  }
  return null;
}
