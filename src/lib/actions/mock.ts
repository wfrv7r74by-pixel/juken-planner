"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import {
  extractMockScores,
  extractWeaknesses,
  searchMock,
  type MockScoreExtract,
  type MockSearchResult,
} from "@/lib/ai/mock";
import type { MockKind } from "@/types/database";

const KINDS: MockKind[] = ["common", "university", "ability"];

const IMAGE_MEDIA: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// ① 模試検索
export async function searchMockAction(
  query: string,
): Promise<{ error: string | null; result: MockSearchResult | null }> {
  const trimmed = query.trim();
  if (!trimmed) return { error: "模試名を入力してください。", result: null };

  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。", result: null };
  const access = await checkAiAccess(supabase, user.id);
  if (!access.allowed) return { error: access.reason, result: null };

  try {
    const result = await searchMock(trimmed);
    if (!result) {
      return { error: "模試を特定できませんでした。名称を変えてお試しください。", result: null };
    }
    return { error: null, result };
  } catch (e) {
    console.error("mock search failed:", e);
    return { error: "検索に失敗しました。クレジット残高を確認してください。", result: null };
  }
}

// ②③ 成績表写真の読み取り
export async function extractMockScoresAction(
  imagePath: string,
): Promise<{ error: string | null; result: MockScoreExtract | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。", result: null };
  const access = await checkAiAccess(supabase, user.id);
  if (!access.allowed) return { error: access.reason, result: null };

  if (!imagePath.startsWith(`${user.id}/`)) {
    return { error: "画像の指定が不正です。", result: null };
  }
  const ext = imagePath.split(".").pop()?.toLowerCase() ?? "";
  const mediaType = IMAGE_MEDIA[ext];
  if (!mediaType) return { error: "対応していない画像形式です。", result: null };

  const { data: blob, error: dlError } = await supabase.storage
    .from("answers")
    .download(imagePath);
  if (dlError || !blob) return { error: "画像の読み込みに失敗しました。", result: null };

  try {
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const result = await extractMockScores({ base64, mediaType });
    if (!result) return { error: "成績表を読み取れませんでした。", result: null };
    return { error: null, result };
  } catch (e) {
    console.error("mock ocr failed:", e);
    return { error: "読み取りに失敗しました。", result: null };
  }
}

export interface SaveMockInput {
  kind: string;
  name: string;
  provider?: string;
  university?: string;
  date: string;
  overallDeviation?: number | null;
  memo?: string;
  imagePath?: string;
  subjects: {
    subject: string;
    score?: number | null;
    maxScore?: number | null;
    deviation?: number | null;
  }[];
}

// 模試を保存 → 弱点抽出まで実行
export async function saveMock(
  input: SaveMockInput,
): Promise<{ error: string | null; mockId: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。", mockId: null };

  const kind = KINDS.includes(input.kind as MockKind)
    ? (input.kind as MockKind)
    : "ability";
  const name = String(input.name ?? "").trim();
  const date = String(input.date ?? "");
  if (!name) return { error: "模試名を入力してください。", mockId: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "受験日を入力してください。", mockId: null };
  }
  const subjects = (input.subjects ?? [])
    .map((s) => ({
      subject: String(s.subject ?? "").trim(),
      score: numOrNull(s.score),
      max_score: numOrNull(s.maxScore),
      deviation: numOrNull(s.deviation),
    }))
    .filter((s) => s.subject);

  // 弱点抽出(科目データがあるときのみ)
  let weaknesses = null;
  if (subjects.length > 0) {
    const access = await checkAiAccess(supabase, user.id);
    if (access.allowed) {
      try {
        weaknesses = await extractWeaknesses({
          kind,
          university: input.university,
          overallDeviation: numOrNull(input.overallDeviation),
          subjects: subjects.map((s) => ({
            subject: s.subject,
            score: s.score,
            maxScore: s.max_score,
            deviation: s.deviation,
          })),
        });
      } catch (e) {
        console.error("weakness extraction failed:", e);
      }
    }
  }

  const { data: mock, error: mockError } = await supabase
    .from("mock_exams")
    .insert({
      user_id: user.id,
      kind,
      name,
      provider: input.provider?.trim() || null,
      university: kind === "university" ? input.university?.trim() || null : null,
      date,
      overall_deviation: numOrNull(input.overallDeviation),
      weaknesses,
      image_path: input.imagePath || null,
      memo: input.memo?.trim() || null,
    })
    .select("id")
    .single();
  if (mockError || !mock) return { error: "模試の保存に失敗しました。", mockId: null };

  if (subjects.length > 0) {
    const { error: subjError } = await supabase.from("mock_subjects").insert(
      subjects.map((s, i) => ({
        user_id: user.id,
        mock_id: mock.id,
        subject: s.subject,
        score: s.score,
        max_score: s.max_score,
        deviation: s.deviation,
        sort_order: i,
      })),
    );
    if (subjError) return { error: "科目成績の保存に失敗しました。", mockId: mock.id };
  }

  revalidatePath("/mocks");
  return { error: null, mockId: mock.id };
}

export async function deleteMock(id: string): Promise<{ error: string | null }> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };
  const { error } = await supabase
    .from("mock_exams")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };
  revalidatePath("/mocks");
  return { error: null };
}

function numOrNull(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
