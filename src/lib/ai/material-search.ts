// 教材検索: 教材名から Web 検索で書誌情報を特定し、教科を自動分類して章立てを返す
import Anthropic from "@anthropic-ai/sdk";
import type { MaterialProposal } from "@/types/database";

const SYSTEM = `あなたは日本の受験教材のデータベース担当。ユーザーが入力した教材名(あいまい・略称でもよい)から実際の教材を特定する。

手順:
1. web_search で教材の正式名称と目次(章構成)を調べる(最大3回)。
2. 教科を自動分類する。次の中から選ぶ: 英語 / 数学 / 現代文 / 古文 / 漢文 / 国語 / 物理 / 化学 / 生物 / 地学 / 日本史 / 世界史 / 地理 / 公民 / 情報 / その他
   (科目が細分化できない場合は 国語 など大きい括りでよい)
3. register_material ツールを必ず1回呼んで結果を登録する。

ルール:
- sections は取り組む順に、実際の目次に基づいて。目次が見つからなければ教材の性質から妥当な構成を作り、note にその旨を書く。
- 章が多すぎる場合(30超)は意味のある単位にまとめて 30 以内にする。
- 特定できない・実在が疑わしい場合も register_material を呼び、note に「特定できなかった」と書いた上で入力名のまま妥当な構成を提案する。`;

export interface MaterialLookup extends MaterialProposal {
  note?: string;
}

export async function lookupMaterial(
  query: string,
): Promise<MaterialLookup | null> {
  const client = new Anthropic();

  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 3 },
    {
      name: "register_material",
      description: "特定した教材の情報を登録する(必ず1回呼ぶこと)",
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string", description: "教材の正式名称" },
          subject: { type: "string", description: "自動分類した教科名" },
          sections: {
            type: "array",
            items: { type: "string" },
            description: "章・項目(取り組む順、最大30)",
          },
          note: {
            type: "string",
            description: "補足(目次が見つからなかった場合など)",
          },
        },
        required: ["title", "subject", "sections"],
      },
    },
  ];

  let messages: Anthropic.MessageParam[] = [
    { role: "user", content: `教材名: ${query}` },
  ];

  for (let i = 0; i < 5; i++) {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: SYSTEM,
      tools,
      messages,
    });

    if (response.stop_reason === "pause_turn") {
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "register_material",
    );
    if (toolUse) {
      const input = toolUse.input as {
        title?: string;
        subject?: string;
        sections?: string[];
        note?: string;
      };
      if (!input.title || !input.subject || !Array.isArray(input.sections)) {
        return null;
      }
      return {
        title: input.title,
        subject: input.subject,
        sections: input.sections.filter((s) => typeof s === "string").slice(0, 30),
        note: input.note,
      };
    }

    if (response.stop_reason === "tool_use") {
      // register_material 以外(想定外)のクライアントツール: 続行を促す
      messages = [...messages, { role: "assistant", content: response.content }];
      const results = response.content
        .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
        .map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: "register_material を呼んでください。",
        }));
      if (results.length > 0) {
        messages = [...messages, { role: "user", content: results }];
      }
      continue;
    }

    break; // end_turn なのに register_material が呼ばれなかった
  }

  return null;
}
