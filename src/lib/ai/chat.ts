// AI 相談のコア: Claude API 呼び出し(サーバー専用)
// - モデル: claude-opus-4-8(adaptive thinking)
// - Web 検索: サーバーサイドツール web_search_20260209
// - 提案系ツール: 実行せず「提案カード」として UI に返し、ユーザーが反映を承認する
import Anthropic from "@anthropic-ai/sdk";
import type { Proposal } from "@/types/database";

export interface AiContext {
  today: string;
  displayName: string;
  milestones: { title: string; date: string; kind: string; is_target: boolean }[];
  phases: { name: string; start_date: string; end_date: string; memo: string | null }[];
  subjects: string[];
  materials: { subject: string; title: string; done: number; total: number }[];
  routineSummary: string;
  recentStudy: string;
  recentNotes: { date: string; good: string | null; issue: string | null }[];
}

export interface AiTurn {
  text: string;
  proposals: Proposal[];
}

const PROPOSAL_TOOLS: Anthropic.Messages.ToolUnion[] = [
  {
    name: "propose_phases",
    description:
      "年間のフェーズ戦略(例:「英語立て直し+数学発展加速」)を提案する。ユーザーには反映ボタン付きのカードとして表示される。期間が重ならないようにし、日付は YYYY-MM-DD。",
    input_schema: {
      type: "object",
      properties: {
        phases: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "フェーズ名(戦略が伝わる短い名前)" },
              start_date: { type: "string", description: "YYYY-MM-DD" },
              end_date: { type: "string", description: "YYYY-MM-DD" },
              memo: { type: "string", description: "狙い・重点事項" },
            },
            required: ["name", "start_date", "end_date"],
          },
        },
        replace: {
          type: "boolean",
          description: "true なら既存フェーズを全て置き換える",
        },
      },
      required: ["phases", "replace"],
    },
  },
  {
    name: "propose_routine",
    description:
      "曜日の1日ルーティン(時間ブロック)を提案する。勉強ブロックは category='study' で科目名も付ける。通学・授業・食事などは category='life'。時刻は HH:MM。同じ内容を複数曜日にまとめて提案してよい。",
    input_schema: {
      type: "object",
      properties: {
        weekdays: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 6 },
          description: "対象曜日(0=日,1=月,...,6=土)",
        },
        blocks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              start_time: { type: "string", description: "HH:MM" },
              end_time: { type: "string", description: "HH:MM" },
              title: { type: "string" },
              category: { type: "string", enum: ["study", "life"] },
              subject: { type: "string", description: "勉強ブロックの科目名(任意)" },
            },
            required: ["start_time", "end_time", "title", "category"],
          },
        },
        replace: {
          type: "boolean",
          description: "true なら対象曜日の既存ブロックを置き換える",
        },
      },
      required: ["weekdays", "blocks", "replace"],
    },
  },
  {
    name: "propose_material",
    description:
      "教材を章・項目に分割して登録する提案。教材名が具体的な市販教材の場合は、先に web_search で実際の目次・章構成を調べてから、正確な章立てで提案すること。",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string", description: "科目名" },
        title: { type: "string", description: "教材名" },
        sections: {
          type: "array",
          items: { type: "string" },
          description: "章・項目のリスト(取り組む順)",
        },
      },
      required: ["subject", "title", "sections"],
    },
  },
  {
    name: "propose_milestones",
    description:
      "試験日・模試・出願・節目(休学開始など)の日付イベントを提案する。本命の試験は is_target=true(1つだけ)。",
    input_schema: {
      type: "object",
      properties: {
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              date: { type: "string", description: "YYYY-MM-DD" },
              kind: {
                type: "string",
                enum: ["exam", "mock", "application", "other"],
              },
              is_target: { type: "boolean" },
            },
            required: ["title", "date", "kind"],
          },
        },
      },
      required: ["milestones"],
    },
  },
];

const PROPOSAL_TOOL_NAMES = new Set([
  "propose_phases",
  "propose_routine",
  "propose_material",
  "propose_milestones",
]);

function buildSystemPrompt(ctx: AiContext): string {
  return `あなたは受験戦略コーチ。ユーザー(${ctx.displayName || "受験生"})と相談しながら、受験までの計画を一緒に作る。

## 現在の状況(アプリのデータ)
- 今日: ${ctx.today}
- マイルストーン: ${ctx.milestones.length ? ctx.milestones.map((m) => `${m.title}(${m.date}${m.is_target ? "・本命" : ""})`).join(", ") : "未設定"}
- フェーズ: ${ctx.phases.length ? ctx.phases.map((p) => `${p.name}(${p.start_date}〜${p.end_date})`).join(", ") : "未設定"}
- 科目: ${ctx.subjects.join(", ") || "未設定"}
- 教材: ${ctx.materials.length ? ctx.materials.map((m) => `${m.title}(${m.subject}, ${m.done}/${m.total}章)`).join(", ") : "未登録"}
- ルーティン: ${ctx.routineSummary || "未設定"}
- 直近の学習: ${ctx.recentStudy || "記録なし"}
- 直近の振り返り: ${ctx.recentNotes.length ? ctx.recentNotes.map((n) => `${n.date}: 良${n.good ?? "-"}/課題${n.issue ?? "-"}`).join(" | ") : "なし"}

## 行動指針
- あなたは一歩前に出るコーチ。質問攻めにせず、**まず現状データから具体的な叩き台を提案し、対話で磨く**。情報が足りなくても妥当な仮定を置いて提案し、仮定は一言添えて、ユーザーの反応で調整する。
- 確認の質問は1ターンに最大1つまで。「どうしますか?」より「こうしませんか?」。
- 現状データに穴(フェーズ未設定、ルーティンが空、模試予定なし等)があれば、聞かれなくても指摘して提案する。
- 具体的な変更はすべて propose_* ツールで提案する(あなたは直接データを書き換えられない。ユーザーがカードの「反映」ボタンで承認する)。
- 市販教材の章立てを提案するときは、必ず web_search で実際の目次を確認する。見つからなければ一般的な構成で提案し、その旨を伝える。
- 模試日程など日付が不確かな情報も web_search で確認してよい。
- 提案ツールを使ったら、本文ではその狙いを2〜3文で簡潔に説明する(内容の繰り返しは不要。カードに表示される)。
- 返答は簡潔な日本語で。長い箇条書きの羅列より、要点を絞った短い文章。`;
}

/**
 * 1ターンの AI 応答を得る。提案ツールの呼び出しは実行せず Proposal として返す。
 */
export async function runChat(
  history: { role: "user" | "assistant"; content: string }[],
  ctx: AiContext,
): Promise<AiTurn> {
  const client = new Anthropic();

  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 4 },
    ...PROPOSAL_TOOLS,
  ];

  let messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const proposals: Proposal[] = [];
  const texts: string[] = [];

  // 提案ツール(クライアント側ツール)と pause_turn を処理するループ
  for (let iteration = 0; iteration < 6; iteration++) {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 8192,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: buildSystemPrompt(ctx),
      tools,
      messages,
    });

    for (const block of response.content) {
      if (block.type === "text") texts.push(block.text);
    }

    if (response.stop_reason === "pause_turn") {
      // サーバーサイドツール(web_search)の続行
      messages = [...messages, { role: "assistant", content: response.content }];
      continue;
    }

    if (response.stop_reason === "tool_use") {
      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      const clientToolUses = toolUses.filter((t) =>
        PROPOSAL_TOOL_NAMES.has(t.name),
      );
      if (clientToolUses.length === 0) {
        // 想定外: サーバーツールのみなら続行
        messages = [...messages, { role: "assistant", content: response.content }];
        continue;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of clientToolUses) {
        proposals.push({
          type: toolUse.name,
          data: toolUse.input,
        } as Proposal);
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content:
            "提案カードとしてユーザーに表示しました。ユーザーは「反映」ボタンで承認できます。追加の提案がなければ、狙いを簡潔に説明して締めてください。",
        });
      }

      messages = [
        ...messages,
        { role: "assistant", content: response.content },
        { role: "user", content: results },
      ];
      continue;
    }

    break; // end_turn / max_tokens / refusal
  }

  return {
    text: texts.join("\n\n").trim() || "(応答を生成できませんでした)",
    proposals,
  };
}
