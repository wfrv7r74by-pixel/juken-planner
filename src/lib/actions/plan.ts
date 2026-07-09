"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { generateSchedule, type MaterialInput } from "@/lib/plan/engine";

export interface ActionResult {
  error: string | null;
}

const ok: ActionResult = { error: null };

function revalidateAll() {
  revalidatePath("/", "layout");
}

/**
 * 逆算プランを(再)生成する。
 * 未完了タスクをすべて削除し、教材の残量を今日以降に配分し直す。
 * 遅れが出たときのリスケジュールもこのアクションで行う。
 */
export async function regeneratePlan(): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const [milestoneRes, settingsRes, materialsRes, doneTasksRes] =
    await Promise.all([
      supabase
        .from("milestones")
        .select("date")
        .eq("user_id", user.id)
        .eq("is_target", true)
        .order("date")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("plan_settings")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase.from("materials").select("*").eq("user_id", user.id),
      supabase
        .from("study_tasks")
        .select("material_id, planned_units")
        .eq("user_id", user.id)
        .eq("status", "done"),
    ]);

  if (milestoneRes.error || !milestoneRes.data) {
    return { error: "本命の試験日が設定されていません。設定画面から登録してください。" };
  }
  if (settingsRes.error || !settingsRes.data) {
    return { error: "学習時間の設定が見つかりません。" };
  }
  if (materialsRes.error) {
    return { error: "教材の取得に失敗しました。" };
  }
  if (doneTasksRes.error) {
    return { error: "進捗の取得に失敗しました。" };
  }
  if (!materialsRes.data.length) {
    return { error: "教材が登録されていません。教材画面から追加してください。" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const examDate = new Date(`${milestoneRes.data.date}T00:00:00`);
  if (examDate <= today) {
    return { error: "試験日が過去の日付です。設定を確認してください。" };
  }

  const doneUnitsByMaterial = new Map<string, number>();
  for (const t of doneTasksRes.data) {
    doneUnitsByMaterial.set(
      t.material_id,
      (doneUnitsByMaterial.get(t.material_id) ?? 0) + t.planned_units,
    );
  }

  const inputs: MaterialInput[] = materialsRes.data.map((m) => {
    const done = Math.min(
      doneUnitsByMaterial.get(m.id) ?? 0,
      m.total_units,
    );
    return {
      id: m.id,
      phase: m.phase,
      doneUnits: done,
      remainingUnits: m.total_units - done,
      minutesPerUnit: m.minutes_per_unit,
    };
  });

  const settings = settingsRes.data;
  const { tasks } = generateSchedule(
    today,
    examDate,
    settings.weekday_minutes,
    settings.basic_ratio,
    settings.advance_ratio,
    inputs,
  );

  // 未完了タスクを全削除(完了済みは実績として残す)
  const { error: deleteError } = await supabase
    .from("study_tasks")
    .delete()
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (deleteError) {
    return { error: "既存プランの削除に失敗しました。" };
  }

  // 大量になり得るので分割して insert
  const rows = tasks.map((t) => ({ ...t, user_id: user.id }));
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: insertError } = await supabase
      .from("study_tasks")
      .insert(rows.slice(i, i + CHUNK));
    if (insertError) {
      return { error: "プランの保存に失敗しました。もう一度お試しください。" };
    }
  }

  revalidateAll();
  return ok;
}

/** タスクの完了/未完了を切り替える。完了時は学習時間を自動記録する。 */
export async function toggleTask(
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: task, error: taskError } = await supabase
    .from("study_tasks")
    .select("id, planned_units, material_id, date")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .single();
  if (taskError || !task) {
    return { error: "タスクが見つかりません。" };
  }

  const { error: updateError } = await supabase
    .from("study_tasks")
    .update({
      status: done ? "done" : "pending",
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq("id", taskId);
  if (updateError) {
    return { error: "タスクの更新に失敗しました。" };
  }

  if (done) {
    const { data: material, error: materialError } = await supabase
      .from("materials")
      .select("subject_id, minutes_per_unit")
      .eq("id", task.material_id)
      .single();
    if (!materialError && material) {
      const minutes = Math.max(
        1,
        Math.round(task.planned_units * material.minutes_per_unit),
      );
      const { error: logError } = await supabase.from("study_logs").insert({
        user_id: user.id,
        subject_id: material.subject_id,
        task_id: task.id,
        date: format(new Date(), "yyyy-MM-dd"),
        minutes,
        source: "task",
      });
      if (logError) {
        console.error("failed to insert study log:", logError.message);
      }
    }
  } else {
    // 完了取り消し時は自動記録した学習時間も削除
    const { error: deleteLogError } = await supabase
      .from("study_logs")
      .delete()
      .eq("user_id", user.id)
      .eq("task_id", taskId);
    if (deleteLogError) {
      console.error("failed to delete study log:", deleteLogError.message);
    }
  }

  revalidateAll();
  return ok;
}
