"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { lookupMaterial, type MaterialLookup } from "@/lib/ai/material-search";
import { insertMaterialWithSections } from "@/lib/data/materials";
import { checkAiAccess } from "@/lib/ai/gate";

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

  const access = await checkAiAccess(supabase, user.id);
  if (!access.allowed) return { error: access.reason, result: null };

  const { data: target } = await supabase
    .from("milestones")
    .select("title, date")
    .eq("user_id", user.id)
    .eq("is_target", true)
    .limit(1)
    .maybeSingle();
  const goal = target
    ? `${target.title}(${target.date})合格`
    : "未設定(一般的な大学受験を想定)";

  try {
    const result = await lookupMaterial(trimmed, goal);
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
  fit_score?: number;
  fit_comment?: string;
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

  const fitScore =
    Number.isInteger(data.fit_score) &&
    data.fit_score! >= 1 &&
    data.fit_score! <= 5
      ? data.fit_score
      : undefined;

  const error = await insertMaterialWithSections(supabase, user.id, {
    subject,
    title,
    sections,
    fit_score: fitScore,
    fit_comment:
      typeof data.fit_comment === "string"
        ? data.fit_comment.slice(0, 300)
        : undefined,
  });
  if (error) return { error };

  revalidatePath("/", "layout");
  return { error: null };
}

/** 教材名から AI 検索して、そのまま教材登録まで一気に行う(提案カードの「追加」用) */
export async function quickAddMaterial(
  title: string,
): Promise<{ error: string | null }> {
  const search = await searchMaterial(title);
  if (search.error || !search.result) {
    return { error: search.error ?? "教材を特定できませんでした。" };
  }
  return confirmMaterial({
    subject: search.result.subject,
    title: search.result.title,
    sections: search.result.sections,
    fit_score: search.result.fit_score,
    fit_comment: search.result.fit_comment,
  });
}
