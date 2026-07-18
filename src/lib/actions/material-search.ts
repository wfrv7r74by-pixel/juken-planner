"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupMaterial, type MaterialLookup } from "@/lib/ai/material-search";
import { insertMaterialWithSections } from "@/lib/data/materials";

export interface SearchState {
  error: string | null;
  result: MaterialLookup | null;
}

/** 教材名から AI 検索(Web参照 + 教科自動分類) */
export async function searchMaterial(query: string): Promise<SearchState> {
  const trimmed = query.trim();
  if (!trimmed) return { error: "教材名を入力してください。", result: null };
  if (trimmed.length > 100) {
    return { error: "教材名が長すぎます。", result: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。", result: null };

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error:
        "AI 機能が未設定です。設定ページから API キーの状態を確認してください。",
      result: null,
    };
  }

  try {
    const result = await lookupMaterial(trimmed);
    if (!result) {
      return {
        error: "教材を特定できませんでした。名称を変えて試してください。",
        result: null,
      };
    }
    return { error: null, result };
  } catch (e) {
    console.error("material search failed:", e);
    return {
      error:
        "検索に失敗しました。APIキーの設定・クレジット残高を確認してください。",
      result: null,
    };
  }
}

/** 検索結果を確認のうえ教材として登録する */
export async function confirmMaterial(data: {
  subject: string;
  title: string;
  sections: string[];
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const subject = String(data.subject ?? "").trim();
  const title = String(data.title ?? "").trim();
  const sections = Array.isArray(data.sections)
    ? data.sections
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, 50)
    : [];
  if (!subject || !title) {
    return { error: "教科と教材名が必要です。" };
  }

  const error = await insertMaterialWithSections(supabase, user.id, {
    subject,
    title,
    sections,
  });
  if (error) return { error };

  revalidatePath("/", "layout");
  return { error: null };
}
