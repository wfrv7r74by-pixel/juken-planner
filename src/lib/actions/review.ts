"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error: string | null;
}

const ok: ActionResult = { error: null };

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** 復習項目を1つ追加(手動) */
export async function addReviewItem(input: {
  subject?: string;
  topic: string;
  detail?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const topic = String(input.topic ?? "").trim();
  if (!topic) return { error: "復習項目を入力してください。" };

  const { error } = await supabase.from("review_items").insert({
    user_id: user.id,
    subject: input.subject?.trim() || "other",
    topic: topic.slice(0, 200),
    detail: input.detail?.trim() || null,
    source: "manual",
  });
  if (error) return { error: "追加に失敗しました。" };

  revalidatePath("/grading");
  return ok;
}

/** 採点結果の復習単元をまとめて復習リストへ登録 */
export async function addReviewItemsFromGrading(input: {
  subject: string;
  topics: string[];
  gradingId?: string;
}): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const topics = (Array.isArray(input.topics) ? input.topics : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 20);
  if (topics.length === 0) return { error: "追加する項目がありません。" };

  const { error } = await supabase.from("review_items").insert(
    topics.map((topic) => ({
      user_id: user.id,
      subject: input.subject || "other",
      topic: topic.slice(0, 200),
      source: "grading" as const,
      grading_id: input.gradingId ?? null,
    })),
  );
  if (error) return { error: "復習リストへの追加に失敗しました。" };

  revalidatePath("/grading");
  return ok;
}

/** 模試の弱点を復習リストへ登録 */
export async function addReviewItemsFromMock(input: {
  items: { subject: string; topic: string; detail?: string }[];
}): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const items = (Array.isArray(input.items) ? input.items : [])
    .filter((i) => i && String(i.topic).trim())
    .slice(0, 20);
  if (items.length === 0) return { error: "追加する項目がありません。" };

  const { error } = await supabase.from("review_items").insert(
    items.map((i) => ({
      user_id: user.id,
      subject: i.subject?.trim() || "other",
      topic: String(i.topic).slice(0, 200),
      detail: i.detail?.trim() || null,
      source: "mock" as const,
    })),
  );
  if (error) return { error: "復習リストへの追加に失敗しました。" };

  revalidatePath("/grading");
  return ok;
}

/** 復習項目の完了/未完了を切り替え */
export async function toggleReviewItem(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("review_items")
    .update({
      status: done ? "done" : "todo",
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "更新に失敗しました。" };

  revalidatePath("/grading");
  return ok;
}

export async function deleteReviewItem(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("review_items")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidatePath("/grading");
  return ok;
}
