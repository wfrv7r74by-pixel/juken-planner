"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadProfile } from "@/lib/actions/learning";
import { computeCompleteness, setField } from "@/lib/learning/profile";
import {
  DEFAULT_STUDY_WINDOW,
  deriveWeekdayWeekendHours,
  type FixedBlock,
  type StudyWindow,
} from "@/lib/learning/roadmap";

export interface ActionResult {
  error: string | null;
}

export interface PrerequisitesInput {
  /** 週の固定予定(学校/部活/バイト/塾/通学 等)。時刻は HH:MM。 */
  fixedBlocks: {
    weekday: number;
    startTime: string;
    endTime: string;
    title: string;
  }[];
  homeworkLoad: "heavy" | "normal" | "light" | "none";
  /** 1日の勉強可能ウィンドウ(任意, HH:MM)。未指定なら既定(平日16-22/休日9-21)。 */
  studyWindow?: {
    weekdayStart: string;
    weekdayEnd: string;
    weekendStart: string;
    weekendEnd: string;
  };
}

function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * 勉強計画の前提を保存する:
 * ① 固定予定 → routine_blocks(category=life)を置き換え
 * ② 宿題量 → profile.schoolAssignmentLoad
 * ③ 固定予定から可処分時間(平日/休日h)を導出し profile.availability に書き戻す
 *    (これで canGeneratePlan の第4層が満たされる)
 * ※基礎教材の登録はフォームから既存の confirmMaterial を直接使う(本アクションの対象外)。
 */
export async function savePrerequisites(
  input: PrerequisitesInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  // 1. 固定予定(life)を置き換え
  const { error: delErr } = await supabase
    .from("routine_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("category", "life");
  if (delErr) return { error: "固定予定の更新に失敗しました。" };

  const blocks = input.fixedBlocks.filter(
    (b) =>
      b.startTime &&
      b.endTime &&
      b.startTime < b.endTime &&
      b.weekday >= 0 &&
      b.weekday <= 6,
  );
  if (blocks.length > 0) {
    const { error: insErr } = await supabase.from("routine_blocks").insert(
      blocks.map((b) => ({
        user_id: user.id,
        weekday: b.weekday,
        start_time: `${b.startTime}:00`,
        end_time: `${b.endTime}:00`,
        title: b.title.trim() || "予定",
        category: "life" as const,
      })),
    );
    if (insErr) return { error: "固定予定の登録に失敗しました。" };
  }

  // 2. 可処分時間の導出
  const win: StudyWindow = input.studyWindow
    ? {
        weekdayStartMin: hhmmToMin(input.studyWindow.weekdayStart),
        weekdayEndMin: hhmmToMin(input.studyWindow.weekdayEnd),
        weekendStartMin: hhmmToMin(input.studyWindow.weekendStart),
        weekendEndMin: hhmmToMin(input.studyWindow.weekendEnd),
      }
    : DEFAULT_STUDY_WINDOW;
  const fixed: FixedBlock[] = blocks.map((b) => ({
    weekday: b.weekday,
    startMin: hhmmToMin(b.startTime),
    endMin: hhmmToMin(b.endTime),
  }));
  const derived = deriveWeekdayWeekendHours(fixed, win);

  // 3. profile 更新(availability・宿題)
  const p = await loadProfile();
  p.availability.weekdayHours = setField(derived.weekday, "confirmed", "user_input");
  p.availability.weekendHours = setField(derived.weekend, "confirmed", "user_input");
  p.schoolAssignmentLoad = setField(input.homeworkLoad, "confirmed", "user_input");
  if (input.studyWindow) p.studyWindow = input.studyWindow;
  const completeness = computeCompleteness(p);

  const { error: upErr } = await supabase.from("user_learning_profiles").upsert(
    {
      user_id: user.id,
      profile: { ...p, completeness },
      phase: p.phase,
      completeness,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (upErr) {
    console.error("savePrerequisites:", upErr.message);
    return {
      error:
        "前提情報の保存に失敗しました。migration 0008 を適用してください。",
    };
  }

  revalidatePath("/ai");
  return { error: null };
}
