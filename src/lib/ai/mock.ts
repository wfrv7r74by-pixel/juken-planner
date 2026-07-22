// 模試まわりの AI: ①模試検索(メタ情報)②成績表写真の読取 ③弱点抽出
import Anthropic from "@anthropic-ai/sdk";
import { tierParams, webSearchTool } from "@/lib/ai/models";
import type { MockKind, MockWeakness } from "@/types/database";

export interface MockSearchResult {
  name: string;
  provider?: string;
  kind: MockKind;
  university?: string;
  subjects: string[];
  note?: string;
}

export interface MockScoreExtract {
  overall_deviation?: number;
  subjects: {
    subject: string;
    score?: number;
    max_score?: number;
    deviation?: number;
  }[];
}

// ---------------- ① 模試検索 ----------------

const SEARCH_SYSTEM = `あなたは日本の大学受験模試のデータベース担当。ユーザーが入力した模試名(略称・あいまいでも可)から実際の模試を特定する。

手順:
1. web_search で模試の正式名称・主催(河合塾/駿台/東進/ベネッセ等)・対象科目を調べる(最大3回)。
2. 種別を分類する:
   - common(共通テスト模試): 共通テスト形式の模試(全統共通テスト模試、共通テスト本番レベル模試 等)
   - university(冠模試/大学別模試): 特定大学向け(京大即応オープン、東大実戦、阪大実戦 等)。university に大学名を入れる。
   - ability(学力測定模試): 記述・全国模試など上記以外(全統記述模試、駿台全国模試 等)
3. register ツールを必ず1回呼ぶ。

ルール:
- subjects はその模試の標準的な受験科目(英語/数学/国語/物理/化学/日本史 等)。
- 特定できない場合も register を呼び、note に「特定できなかった」と書いて入力名のまま妥当に補完する。`;

export async function searchMock(query: string): Promise<MockSearchResult | null> {
  const client = new Anthropic();
  const tools: Anthropic.Messages.ToolUnion[] = [
    webSearchTool("utility", 3),
    {
      name: "register",
      description: "特定した模試の情報を登録する(必ず1回呼ぶ)",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "模試の正式名称" },
          provider: { type: "string", description: "主催(河合塾/駿台/東進等)" },
          kind: { type: "string", enum: ["common", "university", "ability"] },
          university: { type: "string", description: "冠模試の対象大学(あれば)" },
          subjects: {
            type: "array",
            items: { type: "string" },
            description: "標準的な受験科目",
          },
          note: { type: "string" },
        },
        required: ["name", "kind", "subjects"],
      },
    },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `模試名: ${query}` },
  ];

  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({
      ...tierParams("utility"),
      max_tokens: 2048,
      system: [
        { type: "text", text: SEARCH_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      tools,
      messages,
    });
    const tu = res.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "register",
    );
    if (tu) {
      const input = tu.input as {
        name?: string;
        provider?: string;
        kind?: MockKind;
        university?: string;
        subjects?: string[];
        note?: string;
      };
      if (!input.name || !input.kind || !Array.isArray(input.subjects)) return null;
      return {
        name: input.name,
        provider: input.provider,
        kind: input.kind,
        university: input.university,
        subjects: input.subjects.filter((s) => typeof s === "string").slice(0, 12),
        note: input.note,
      };
    }
    if (res.stop_reason === "pause_turn" || res.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    break;
  }
  return null;
}

// ---------------- ② 成績表写真の読取 ----------------

const OCR_SYSTEM = `あなたは模試成績表の読み取り担当。画像から数値を正確に読み取る。

読み取るもの:
- overall_deviation: 模試全体の偏差値(総合偏差値)。表になければ空。
- subjects[]: 科目ごとの { subject(科目名), score(得点), max_score(満点), deviation(偏差値) }。
  読み取れない項目は省略してよい。科目名は日本語で(英語/数学/国語 等)。

必ず submit ツールを1回呼ぶ。読めない数値は無理に埋めず省略すること。`;

export async function extractMockScores(image: {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}): Promise<MockScoreExtract | null> {
  const client = new Anthropic();
  const tool: Anthropic.Messages.Tool = {
    name: "submit",
    description: "読み取った成績を提出する(必ず1回呼ぶ)",
    input_schema: {
      type: "object",
      properties: {
        overall_deviation: { type: "number", description: "総合偏差値" },
        subjects: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              score: { type: "number" },
              max_score: { type: "number" },
              deviation: { type: "number" },
            },
            required: ["subject"],
          },
        },
      },
      required: ["subjects"],
    },
  };

  const res = await client.messages.create({
    ...tierParams("utility"),
    max_tokens: 2048,
    system: [
      { type: "text", text: OCR_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [tool],
    tool_choice: { type: "tool", name: "submit" },
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "この模試成績表を読み取ってください。" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image.mediaType,
              data: image.base64,
            },
          },
        ],
      },
    ],
  });

  const tu = res.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit",
  );
  if (!tu) return null;
  const input = tu.input as MockScoreExtract;
  return {
    overall_deviation:
      typeof input.overall_deviation === "number"
        ? input.overall_deviation
        : undefined,
    subjects: Array.isArray(input.subjects)
      ? input.subjects.filter((s) => s && typeof s.subject === "string")
      : [],
  };
}

// ---------------- ③ 弱点抽出 ----------------

const WEAKNESS_SYSTEM = `あなたは受験模試の分析コーチ。模試の科目別成績から弱点を抽出する。

方針:
- 偏差値が相対的に低い科目、得点率が低い科目を弱点として挙げる。
- 冠模試(大学別)の場合はその大学の入試傾向を踏まえる。
- 各弱点は { subject(科目), point(具体的な弱点), advice(高校範囲での具体的な対策・復習単元) }。
- 弱点は最大4件。全体的に良好なら無理に挙げず、伸ばすべき点を1件程度に。

必ず submit ツールを1回呼ぶ。`;

export async function extractWeaknesses(input: {
  kind: MockKind;
  university?: string | null;
  overallDeviation?: number | null;
  subjects: { subject: string; score?: number | null; maxScore?: number | null; deviation?: number | null }[];
}): Promise<MockWeakness[]> {
  const client = new Anthropic();
  const tool: Anthropic.Messages.Tool = {
    name: "submit",
    description: "弱点分析を提出する(必ず1回呼ぶ)",
    input_schema: {
      type: "object",
      properties: {
        weaknesses: {
          type: "array",
          items: {
            type: "object",
            properties: {
              subject: { type: "string" },
              point: { type: "string" },
              advice: { type: "string" },
            },
            required: ["subject", "point", "advice"],
          },
        },
      },
      required: ["weaknesses"],
    },
  };

  const kindLabel =
    input.kind === "common"
      ? "共通テスト模試"
      : input.kind === "university"
        ? `冠模試(${input.university ?? "大学別"})`
        : "学力測定模試";
  const lines = input.subjects
    .map(
      (s) =>
        `- ${s.subject}: 得点${s.score ?? "-"}${s.maxScore ? `/${s.maxScore}` : ""}, 偏差値${s.deviation ?? "-"}`,
    )
    .join("\n");
  const userText = `種別: ${kindLabel}\n総合偏差値: ${input.overallDeviation ?? "-"}\n科目別:\n${lines}`;

  const res = await client.messages.create({
    ...tierParams("strategy"),
    max_tokens: 2048,
    system: [
      { type: "text", text: WEAKNESS_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [tool],
    tool_choice: { type: "tool", name: "submit" },
    messages: [{ role: "user", content: userText }],
  });

  const tu = res.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === "submit",
  );
  if (!tu) return [];
  const out = tu.input as { weaknesses?: MockWeakness[] };
  return Array.isArray(out.weaknesses)
    ? out.weaknesses
        .filter((w) => w && w.subject && w.point && w.advice)
        .slice(0, 4)
    : [];
}
