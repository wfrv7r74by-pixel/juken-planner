"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BlockCategory, MilestoneKind } from "@/types/database";

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

function revalidateAll() {
  revalidatePath("/", "layout");
}

// ============================================================
// アカウント
// ============================================================

export async function updateDisplayName(
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return { error: "名前を入力してください。" };
  if (displayName.length > 30) return { error: "名前は30文字以内にしてください。" };

  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", user.id);
  if (error) return { error: "名前の更新に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// マイルストーン(本命試験・模試・出願・節目)
// ============================================================

export async function addMilestone(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const title = String(formData.get("title") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  const kind = String(formData.get("kind") ?? "exam") as MilestoneKind;
  const isTarget = formData.get("is_target") === "on";

  if (!title || !date) return { error: "名称と日付を入力してください。" };

  if (isTarget) {
    const { error } = await supabase
      .from("milestones")
      .update({ is_target: false })
      .eq("user_id", user.id)
      .eq("is_target", true);
    if (error) return { error: "既存の本命の更新に失敗しました。" };
  }

  const { error } = await supabase.from("milestones").insert({
    user_id: user.id,
    title,
    date,
    kind,
    is_target: isTarget,
  });
  if (error) return { error: "登録に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deleteMilestone(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("milestones")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// フェーズ
// ============================================================

export async function addPhase(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const memo = String(formData.get("memo") ?? "").trim();

  if (!name || !startDate || !endDate) {
    return { error: "名前と期間を入力してください。" };
  }
  if (startDate > endDate) {
    return { error: "開始日は終了日より前にしてください。" };
  }

  const { error } = await supabase.from("phases").insert({
    user_id: user.id,
    name,
    start_date: startDate,
    end_date: endDate,
    memo: memo || null,
  });
  if (error) return { error: "フェーズの登録に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deletePhase(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("phases")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// ルーティン(曜日別時間ブロック)
// ============================================================

export async function addRoutineBlock(
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const weekdays = formData.getAll("weekday").map(Number);
  const startTime = String(formData.get("start_time") ?? "");
  const endTime = String(formData.get("end_time") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const category = String(
    formData.get("category") ?? "study",
  ) as BlockCategory;
  const subjectId = String(formData.get("subject_id") ?? "");

  if (weekdays.length === 0 || weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) {
    return { error: "曜日を選択してください。" };
  }
  if (!startTime || !endTime || startTime >= endTime) {
    return { error: "開始・終了時刻を正しく入力してください。" };
  }
  if (!title) return { error: "内容を入力してください。" };

  const { error } = await supabase.from("routine_blocks").insert(
    weekdays.map((weekday) => ({
      user_id: user.id,
      weekday,
      start_time: startTime,
      end_time: endTime,
      title,
      category,
      subject_id: subjectId || null,
    })),
  );
  if (error) return { error: "ブロックの登録に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deleteRoutineBlock(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("routine_blocks")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}

/**
 * 勉強ブロックの完了トグル。
 * 完了で study_logs に自動記録し、取り消しで該当記録を削除する。
 */
export async function toggleBlockDone(
  blockId: string,
  date: string,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: block, error: blockError } = await supabase
    .from("routine_blocks")
    .select("*")
    .eq("id", blockId)
    .eq("user_id", user.id)
    .single();
  if (blockError || !block) return { error: "ブロックが見つかりません。" };

  const memoKey = `block:${blockId}`;
  const { data: existing, error: findError } = await supabase
    .from("study_logs")
    .select("id")
    .eq("user_id", user.id)
    .eq("date", date)
    .eq("memo", memoKey)
    .maybeSingle();
  if (findError) return { error: "記録の確認に失敗しました。" };

  if (existing) {
    const { error } = await supabase
      .from("study_logs")
      .delete()
      .eq("id", existing.id);
    if (error) return { error: "取り消しに失敗しました。" };
  } else {
    const [sh, sm] = block.start_time.split(":").map(Number);
    const [eh, em] = block.end_time.split(":").map(Number);
    const minutes = Math.max(1, eh * 60 + em - (sh * 60 + sm));
    const { error } = await supabase.from("study_logs").insert({
      user_id: user.id,
      subject_id: block.subject_id,
      date,
      minutes,
      memo: memoKey,
      source: "task",
    });
    if (error) return { error: "記録に失敗しました。" };
  }

  revalidateAll();
  return ok;
}

// ============================================================
// 振り返り(daily_notes)
// ============================================================

export async function upsertDailyNote(
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const date = String(formData.get("date") ?? "");
  const mood = Number(formData.get("mood"));
  const good = String(formData.get("good") ?? "").trim();
  const issue = String(formData.get("issue") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim();

  if (!date) return { error: "日付が不正です。" };

  const { error } = await supabase.from("daily_notes").upsert(
    {
      user_id: user.id,
      date,
      mood: Number.isInteger(mood) && mood >= 1 && mood <= 5 ? mood : null,
      good: good || null,
      issue: issue || null,
      memo: memo || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,date" },
  );
  if (error) return { error: "振り返りの保存に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// 科目・教材・章
// ============================================================

export async function addSubject(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#4f46e5");
  if (!name) return { error: "科目名を入力してください。" };

  const { error } = await supabase
    .from("subjects")
    .insert({ user_id: user.id, name, color });
  if (error) return { error: "科目の登録に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deleteSubject(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("subjects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deleteMaterial(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}

/** 章のステータスを todo → doing → done → todo と循環させる */
export async function cycleSectionStatus(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: section, error: findError } = await supabase
    .from("material_sections")
    .select("status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (findError || !section) return { error: "章が見つかりません。" };

  const next =
    section.status === "todo"
      ? "doing"
      : section.status === "doing"
        ? "done"
        : "todo";

  const { error } = await supabase
    .from("material_sections")
    .update({ status: next })
    .eq("id", id);
  if (error) return { error: "更新に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// 学習記録
// ============================================================

export async function addStudyLog(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const subjectId = String(formData.get("subject_id") ?? "");
  const date = String(formData.get("date") ?? "");
  const minutes = Number(formData.get("minutes"));
  const memo = String(formData.get("memo") ?? "").trim();

  if (!date) return { error: "日付を入力してください。" };
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return { error: "学習時間(分)は正の数値で入力してください。" };
  }

  const { error } = await supabase.from("study_logs").insert({
    user_id: user.id,
    subject_id: subjectId || null,
    date,
    minutes: Math.floor(minutes),
    memo: memo || null,
    source: "manual",
  });
  if (error) return { error: "学習記録の保存に失敗しました。" };

  revalidateAll();
  return ok;
}

export async function deleteStudyLog(id: string): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("study_logs")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidateAll();
  return ok;
}
