"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { MilestoneKind, Phase, WeekdayMinutes } from "@/types/database";
import type { ActionResult } from "@/lib/actions/plan";

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
// マイルストーン(試験日・模試・出願)
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
    // 本命は常に1件: 既存の is_target を外す
    const { error } = await supabase
      .from("milestones")
      .update({ is_target: false })
      .eq("user_id", user.id)
      .eq("is_target", true);
    if (error) return { error: "既存の本命試験の更新に失敗しました。" };
  }

  const { error } = await supabase.from("milestones").insert({
    user_id: user.id,
    title,
    date,
    kind,
    is_target: isTarget,
  });
  if (error) return { error: "マイルストーンの登録に失敗しました。" };

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
// 科目
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
  if (error) return { error: "削除に失敗しました。関連する教材も確認してください。" };

  revalidateAll();
  return ok;
}

// ============================================================
// 教材
// ============================================================

export async function addMaterial(formData: FormData): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const subjectId = String(formData.get("subject_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const totalUnits = Number(formData.get("total_units"));
  const unitLabel = String(formData.get("unit_label") ?? "ページ").trim();
  const minutesPerUnit = Number(formData.get("minutes_per_unit"));
  const phase = String(formData.get("phase") ?? "basic") as Phase;

  if (!subjectId || !title) return { error: "科目と教材名を入力してください。" };
  if (!Number.isFinite(totalUnits) || totalUnits <= 0) {
    return { error: "総量は1以上の数値で入力してください。" };
  }
  if (!Number.isFinite(minutesPerUnit) || minutesPerUnit <= 0) {
    return { error: "1単位あたりの分数は正の数値で入力してください。" };
  }

  const { error } = await supabase.from("materials").insert({
    user_id: user.id,
    subject_id: subjectId,
    title,
    total_units: Math.floor(totalUnits),
    unit_label: unitLabel || "ページ",
    minutes_per_unit: minutesPerUnit,
    phase,
  });
  if (error) return { error: "教材の登録に失敗しました。" };

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

// ============================================================
// プラン設定(曜日別学習時間・フェーズ配分)
// ============================================================

export async function updatePlanSettings(
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const weekdayMinutes: WeekdayMinutes = {};
  for (let dow = 0; dow <= 6; dow++) {
    const v = Number(formData.get(`weekday_${dow}`));
    if (!Number.isFinite(v) || v < 0 || v > 1440) {
      return { error: "学習時間は0〜1440分の範囲で入力してください。" };
    }
    weekdayMinutes[String(dow)] = Math.floor(v);
  }

  const basicPct = Number(formData.get("basic_pct"));
  const advancePct = Number(formData.get("advance_pct"));
  if (
    !Number.isFinite(basicPct) ||
    !Number.isFinite(advancePct) ||
    basicPct < 1 ||
    advancePct < 1 ||
    basicPct + advancePct > 98
  ) {
    return {
      error: "フェーズ配分は各1%以上、合計98%以下で入力してください(残りが直前期になります)。",
    };
  }

  const { error } = await supabase
    .from("plan_settings")
    .update({
      weekday_minutes: weekdayMinutes,
      basic_ratio: basicPct / 100,
      advance_ratio: advancePct / 100,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);
  if (error) return { error: "設定の保存に失敗しました。" };

  revalidateAll();
  return ok;
}

// ============================================================
// 学習記録(手動)
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
