"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import { enrichRoadmapAI } from "@/lib/ai/roadmap";
import { suggestMaterials } from "@/lib/ai/material-suggest";
import { generateWeeklyTimetable } from "@/lib/actions/timetable";
import { loadProfile } from "@/lib/actions/learning";
import { canGeneratePlan } from "@/lib/learning/profile";
import {
  buildRoadmapSkeleton,
  deterministicMonthlyGoals,
  deterministicWeeklyGoal,
  DIVISION_NAME,
  type Division,
  type DivisionKind,
  type RoadmapData,
} from "@/lib/learning/roadmap";
import { SUBJECT_CHOICES } from "@/lib/learning/questions";
import type { LevelBand } from "@/lib/learning/types";
import type { StudyRoadmapRow } from "@/types/database";

export interface ActionResult {
  error: string | null;
}
export interface GenerateResult extends ActionResult {
  missing?: string[];
}

const SUBJECT_LABEL: Record<string, string> = Object.fromEntries(
  SUBJECT_CHOICES.map((c) => [c.value, c.label]),
);

const DIVISION_COLOR: Record<DivisionKind, string> = {
  basic: "#2563eb",
  practice: "#16a34a",
  advance: "#7c3aed",
  past: "#ea580c",
  common: "#d97706",
};

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
type Supa = Awaited<ReturnType<typeof createClient>>;

async function resolveExamDate(
  supabase: Supa,
  userId: string,
  examFromProfile: string | null,
): Promise<string | null> {
  const { data } = await supabase
    .from("milestones")
    .select("date")
    .eq("user_id", userId)
    .eq("is_target", true)
    .order("date")
    .limit(1)
    .maybeSingle();
  return data?.date ?? examFromProfile;
}

/** ロードマップで生成した区分(kind付き)を phases テーブルへ同期する(手動 phase は残す) */
async function syncPhases(
  supabase: Supa,
  userId: string,
  roadmap: RoadmapData,
): Promise<void> {
  // 前回のロードマップ由来 phase(kind not null)だけ入れ替える
  const { error: delErr } = await supabase
    .from("phases")
    .delete()
    .eq("user_id", userId)
    .not("kind", "is", null);
  if (delErr) {
    console.error("syncPhases delete:", delErr.message);
    return;
  }
  if (roadmap.divisions.length === 0) return;
  const { error: insErr } = await supabase.from("phases").insert(
    roadmap.divisions.map((d, i) => ({
      user_id: userId,
      name: d.name,
      start_date: d.startDate,
      end_date: d.endDate,
      color: DIVISION_COLOR[d.kind],
      kind: d.kind,
      sort_order: i,
      memo: null,
    })),
  );
  if (insErr) console.error("syncPhases insert:", insErr.message);
}

/**
 * ロードマップを生成する。第1・2・4層が未取得ならブロック(第4層は前提ステップで満たす)。
 * 本命試験日が無いと逆算できないためブロック。AI で文言を肉付けし、失敗時は決定論。
 * 生成後、既存の今週の計画も生成する。
 */
export async function generateRoadmap(): Promise<GenerateResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const profile = await loadProfile();
  const gate = canGeneratePlan(profile);
  if (!gate.ok) {
    return {
      error: "計画に必要な情報が不足しています。相談と前提入力を先に済ませてください。",
      missing: gate.missing,
    };
  }

  const examFromProfile = profile.goal.targetSchools.value?.[0]?.examDate ?? null;
  const examDate = await resolveExamDate(supabase, user.id, examFromProfile);
  if (!examDate) {
    return {
      error:
        "本命試験日が未設定です。設定ページ(またはマイルストーン)で本命試験日を登録してください。",
    };
  }

  const levelBand: LevelBand =
    profile.goal.targetSchools.value?.[0]?.levelBand ??
    profile.goal.levelBand.value ??
    "middle";
  const subjects = (profile.goal.subjects.value ?? [])
    // 有効な科目コードのみ(受験方式の "general" 等が混入しても除外する)
    .filter((s) => s.code in SUBJECT_LABEL)
    .map((s) => SUBJECT_LABEL[s.code]);
  const tone =
    profile.traits.preferredTone.value === "strict" ? "厳しめ" : "励まし寄り";

  // 『共通テスト』マイルストーンがあれば共テ日として優先(無ければ自動=1月中旬)
  const { data: milestones } = await supabase
    .from("milestones")
    .select("title, date")
    .eq("user_id", user.id);
  const commonTestDate =
    (milestones ?? []).find((m) => /共通テスト|共テ/.test(m.title))?.date ?? null;

  const today = todayJST();
  const skeleton = buildRoadmapSkeleton({
    today,
    examDate,
    levelBand,
    subjects,
    commonTestDate,
  });

  // AI で文言を肉付け(gate.ts を通す)。不可・失敗時は骨格のまま。
  let roadmap: RoadmapData = skeleton;
  const access = await checkAiAccess(supabase, user.id);
  if (access.allowed) {
    const ai = await enrichRoadmapAI(skeleton, { levelBand, tone });
    if (ai) {
      roadmap = {
        ...skeleton,
        concepts: ai.concepts,
        monthlyGoals: ai.monthlyGoals,
        currentWeeklyGoal: ai.currentWeeklyGoal,
        generatedBy: "ai",
      };
    }
  }

  // 保存
  const { error: saveErr } = await supabase.from("study_roadmaps").upsert(
    {
      user_id: user.id,
      exam_date: examDate,
      roadmap,
      generated_by: roadmap.generatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (saveErr) {
    console.error("generateRoadmap save:", saveErr.message);
    return {
      error:
        "ロードマップの保存に失敗しました。migration 0010_roadmap.sql を適用してください。",
    };
  }

  await syncPhases(supabase, user.id, roadmap);

  revalidatePath("/", "layout");

  // 今週の時間割も生成しホームの予定に反映(失敗しても roadmap は保存済み)。
  const weekly = await generateWeeklyTimetable();
  if (weekly.error) return { error: weekly.error, missing: weekly.missing };

  return { error: null };
}

/** ロードマップを取得(なければ null)。テーブル未適用でも UI は動く。 */
export async function loadRoadmap(): Promise<StudyRoadmapRow | null> {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("study_roadmaps")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("loadRoadmap:", error.message);
    return null;
  }
  return data;
}

// ---------------- 第2弾: 区分の教材提案 ----------------

async function loadRoadmapData(
  supabase: Supa,
  userId: string,
): Promise<RoadmapData | null> {
  const { data } = await supabase
    .from("study_roadmaps")
    .select("roadmap")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.roadmap as RoadmapData) ?? null;
}

async function saveRoadmapData(
  supabase: Supa,
  userId: string,
  roadmap: RoadmapData,
): Promise<string | null> {
  const { error } = await supabase
    .from("study_roadmaps")
    .update({ roadmap, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  return error ? error.message : null;
}

/**
 * 指定区分の抽象概念に対応する具体的参考書を AI 提案し、roadmap にキャッシュする。
 * (追加は既存の教材登録、検索は searchMaterial を UI から使う)
 */
export async function suggestDivisionMaterials(
  divisionKind: DivisionKind,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };
  const access = await checkAiAccess(supabase, user.id);
  if (!access.allowed) return { error: access.reason };

  const roadmap = await loadRoadmapData(supabase, user.id);
  if (!roadmap) return { error: "先にロードマップを作成してください。" };
  const dc = roadmap.concepts.find((c) => c.divisionKind === divisionKind);
  if (!dc || dc.subjects.length === 0)
    return { error: "この区分の到達目標がありません。" };

  const { data: target } = await supabase
    .from("milestones")
    .select("title, date")
    .eq("user_id", user.id)
    .eq("is_target", true)
    .limit(1)
    .maybeSingle();
  const goal = target
    ? `${target.title}(${target.date})合格`
    : "一般的な大学受験";

  const suggestions = await suggestMaterials({
    divisionName: DIVISION_NAME[divisionKind],
    goal,
    items: dc.subjects.map((s) => ({ subject: s.subject, concept: s.concept })),
  });
  if (!suggestions) {
    return {
      error: "教材の提案に失敗しました。時間をおいて再度お試しください。",
    };
  }

  const steps = roadmap.materialSteps.filter(
    (s) => s.divisionKind !== divisionKind,
  );
  steps.push({ divisionKind, resolved: false, suggestions });
  const saveErr = await saveRoadmapData(supabase, user.id, {
    ...roadmap,
    materialSteps: steps,
  });
  if (saveErr) {
    console.error("suggestDivisionMaterials:", saveErr);
    return { error: "提案の保存に失敗しました。" };
  }
  revalidatePath("/ai");
  return { error: null };
}

/** 指定区分の教材ステップを「完了」にし、提案カードを再表示しないようにする。 */
export async function resolveDivisionMaterials(
  divisionKind: DivisionKind,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const roadmap = await loadRoadmapData(supabase, user.id);
  if (!roadmap) return { error: "ロードマップが見つかりません。" };

  let steps = roadmap.materialSteps.map((s) =>
    s.divisionKind === divisionKind ? { ...s, resolved: true } : s,
  );
  if (!steps.some((s) => s.divisionKind === divisionKind)) {
    steps = [...steps, { divisionKind, resolved: true, suggestions: [] }];
  }
  const saveErr = await saveRoadmapData(supabase, user.id, {
    ...roadmap,
    materialSteps: steps,
  });
  if (saveErr) return { error: "更新に失敗しました。" };
  revalidatePath("/ai");
  return { error: null };
}

// ---------------- 第3弾: 区分の期間の編集・削除 ----------------

/** 期間変更後、月/週目標を決定論で再計算し phases も同期する共通処理 */
async function applyDivisionChange(
  supabase: Supa,
  userId: string,
  roadmap: RoadmapData,
  divisions: Division[],
): Promise<string | null> {
  const today = todayJST();
  const exam = roadmap.examDate ?? divisions[divisions.length - 1]?.endDate ?? today;
  const kinds = new Set(divisions.map((d) => d.kind));
  const next: RoadmapData = {
    ...roadmap,
    divisions,
    concepts: roadmap.concepts.filter((c) => kinds.has(c.divisionKind)),
    monthlyGoals: deterministicMonthlyGoals(divisions, today, exam),
    currentWeeklyGoal: deterministicWeeklyGoal(divisions, today),
  };
  const saveErr = await saveRoadmapData(supabase, userId, next);
  if (saveErr) return saveErr;
  await syncPhases(supabase, userId, next);
  return null;
}

/** 区分の期間(開始/終了)を一括更新する。 */
export async function updateRoadmapDivisions(
  edits: { kind: DivisionKind; startDate: string; endDate: string }[],
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const roadmap = await loadRoadmapData(supabase, user.id);
  if (!roadmap) return { error: "ロードマップが見つかりません。" };

  const byKind = new Map(roadmap.divisions.map((d) => [d.kind, d]));
  const divisions: Division[] = [];
  for (const e of edits) {
    const base = byKind.get(e.kind);
    if (!base) continue;
    if (!e.startDate || !e.endDate || e.startDate > e.endDate) {
      return {
        error: `${DIVISION_NAME[e.kind]}の期間が不正です(開始≤終了にしてください)。`,
      };
    }
    divisions.push({ ...base, startDate: e.startDate, endDate: e.endDate });
  }
  if (divisions.length === 0) return { error: "区分がありません。" };

  const err = await applyDivisionChange(supabase, user.id, roadmap, divisions);
  if (err) {
    console.error("updateRoadmapDivisions:", err);
    return { error: "期間の更新に失敗しました。" };
  }
  revalidatePath("/", "layout");
  return { error: null };
}

/** 区分を削除し、空いた期間を隣の区分に吸収する。 */
export async function deleteRoadmapDivision(
  kind: DivisionKind,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const roadmap = await loadRoadmapData(supabase, user.id);
  if (!roadmap) return { error: "ロードマップが見つかりません。" };
  if (roadmap.divisions.length <= 1)
    return { error: "区分は最低1つ必要です。" };

  const idx = roadmap.divisions.findIndex((d) => d.kind === kind);
  if (idx < 0) return { error: "区分が見つかりません。" };

  const removed = roadmap.divisions[idx];
  const divisions = roadmap.divisions.filter((_, i) => i !== idx);
  // 空いた期間を吸収: 前の区分の終了を延ばす(先頭なら次の区分の開始を早める)
  if (idx > 0) {
    divisions[idx - 1] = { ...divisions[idx - 1], endDate: removed.endDate };
  } else {
    divisions[0] = { ...divisions[0], startDate: removed.startDate };
  }

  const err = await applyDivisionChange(supabase, user.id, roadmap, divisions);
  if (err) {
    console.error("deleteRoadmapDivision:", err);
    return { error: "区分の削除に失敗しました。" };
  }
  revalidatePath("/", "layout");
  return { error: null };
}
