"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { regeneratePlan, type ActionResult } from "@/lib/actions/plan";
import type { Phase } from "@/types/database";

export interface SetupPayload {
  examTitle: string;
  examDate: string;
  subjects: { name: string; color: string }[];
  materials: {
    subjectName: string;
    title: string;
    total_units: number;
    unit_label: string;
    minutes_per_unit: number;
    phase: Phase;
  }[];
}

const PHASES: Phase[] = ["basic", "advance", "final"];

/** ウィザードの入力を一括登録し、プランを自動生成する */
export async function completeSetup(
  payload: SetupPayload,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const examTitle = payload.examTitle.trim();
  const examDate = payload.examDate;
  if (!examTitle || !/^\d{4}-\d{2}-\d{2}$/.test(examDate)) {
    return { error: "試験名と日付を入力してください。" };
  }
  if (new Date(`${examDate}T00:00:00`) <= new Date()) {
    return { error: "試験日は明日以降の日付にしてください。" };
  }
  if (payload.subjects.length === 0) {
    return { error: "科目を1つ以上選んでください。" };
  }
  for (const m of payload.materials) {
    if (
      !m.title.trim() ||
      !Number.isFinite(m.total_units) ||
      m.total_units <= 0 ||
      !Number.isFinite(m.minutes_per_unit) ||
      m.minutes_per_unit <= 0 ||
      !PHASES.includes(m.phase)
    ) {
      return { error: "教材の内容に不備があります。" };
    }
  }

  // 本命試験日(既存の本命は外す)
  const { error: unsetError } = await supabase
    .from("milestones")
    .update({ is_target: false })
    .eq("user_id", user.id)
    .eq("is_target", true);
  if (unsetError) return { error: "既存の設定の更新に失敗しました。" };

  const { error: milestoneError } = await supabase.from("milestones").insert({
    user_id: user.id,
    title: examTitle,
    date: examDate,
    kind: "exam",
    is_target: true,
  });
  if (milestoneError) return { error: "試験日の登録に失敗しました。" };

  // 科目(同名があれば再利用)
  const { data: existingSubjects, error: subjectsFetchError } = await supabase
    .from("subjects")
    .select("id, name")
    .eq("user_id", user.id);
  if (subjectsFetchError) return { error: "科目の取得に失敗しました。" };

  const subjectIdByName = new Map(
    existingSubjects.map((s) => [s.name, s.id]),
  );
  const newSubjects = payload.subjects.filter(
    (s) => !subjectIdByName.has(s.name),
  );
  if (newSubjects.length > 0) {
    const { data: inserted, error: subjectInsertError } = await supabase
      .from("subjects")
      .insert(
        newSubjects.map((s, i) => ({
          user_id: user.id,
          name: s.name,
          color: s.color,
          sort_order: existingSubjects.length + i,
        })),
      )
      .select("id, name");
    if (subjectInsertError || !inserted) {
      return { error: "科目の登録に失敗しました。" };
    }
    for (const s of inserted) subjectIdByName.set(s.name, s.id);
  }

  // 教材
  if (payload.materials.length > 0) {
    const rows = [];
    for (const m of payload.materials) {
      const subjectId = subjectIdByName.get(m.subjectName);
      if (!subjectId) {
        return { error: `科目「${m.subjectName}」が見つかりません。` };
      }
      rows.push({
        user_id: user.id,
        subject_id: subjectId,
        title: m.title.trim(),
        total_units: Math.floor(m.total_units),
        unit_label: m.unit_label.trim() || "ページ",
        minutes_per_unit: m.minutes_per_unit,
        phase: m.phase,
      });
    }
    const { error: materialError } = await supabase
      .from("materials")
      .insert(rows);
    if (materialError) return { error: "教材の登録に失敗しました。" };
  }

  revalidatePath("/", "layout");

  // 教材があればそのままプラン生成まで行う
  if (payload.materials.length > 0) {
    return regeneratePlan();
  }
  return { error: null };
}
