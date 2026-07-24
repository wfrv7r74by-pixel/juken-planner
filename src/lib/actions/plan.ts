"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import { generatePlanTasksAI } from "@/lib/ai/plan";
import { loadProfile } from "@/lib/actions/learning";
import {
  buildBlueprint,
  buildDeterministicTasks,
  deterministicTheme,
  type PlanEngineInput,
  type PlanTask,
  type PlanTaskDraft,
  type WeeklyPlanData,
} from "@/lib/learning/plan";
import { SUBJECT_CHOICES } from "@/lib/learning/questions";
import type { UserLearningProfile } from "@/lib/learning/types";
import type { WeeklyPlanRow } from "@/types/database";

export interface ActionResult {
  error: string | null;
}

const SUBJECT_LABEL: Record<string, string> = Object.fromEntries(
  SUBJECT_CHOICES.map((c) => [c.value, c.label]),
);
const label = (v: string) => SUBJECT_LABEL[v] ?? v;

/** 現在日(Asia/Tokyo, YYYY-MM-DD) */
function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
  }).format(new Date());
}

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type Supa = Awaited<ReturnType<typeof createClient>>;

// ---------------- エンジン入力の組み立て ----------------

/** 本命試験日(milestones.is_target)。無ければプロフィールの第一志望の入試日。 */
async function resolveExamDate(
  supabase: Supa,
  userId: string,
  profile: UserLearningProfile,
): Promise<string | null> {
  const { data } = await supabase
    .from("milestones")
    .select("date")
    .eq("user_id", userId)
    .eq("is_target", true)
    .order("date")
    .limit(1)
    .maybeSingle();
  if (data?.date) return data.date;
  const school = profile.goal.targetSchools.value?.[0];
  return school?.examDate ?? null;
}

/** 教材の実体積(materials テーブル) + ヒアリングで挙がった教材名を統合する。 */
async function resolveMaterials(
  supabase: Supa,
  userId: string,
  profile: UserLearningProfile,
): Promise<PlanEngineInput["materials"]> {
  const { data: rows } = await supabase
    .from("materials")
    .select("title, total_units, unit_label, subject_id, subjects(name)")
    .eq("user_id", userId);

  const out: PlanEngineInput["materials"] = [];
  const seen = new Set<string>();
  for (const r of rows ?? []) {
    const row = r as unknown as {
      title: string;
      total_units: number | null;
      unit_label: string | null;
      subjects: { name: string } | { name: string }[] | null;
    };
    const subj = Array.isArray(row.subjects)
      ? row.subjects[0]?.name
      : row.subjects?.name;
    out.push({
      subject: subj ?? "その他",
      title: row.title,
      unitLabel: row.unit_label ?? "問",
      totalUnits: row.total_units ?? 0,
      completedUnits: 0,
    });
    seen.add(row.title);
  }
  // ヒアリングで挙がった教材で、materials 未登録のものを補う(総量は未知)
  for (const m of profile.materials.value ?? []) {
    if (seen.has(m.title)) continue;
    out.push({
      subject: label(m.subject),
      title: m.title,
      unitLabel: "",
      totalUnits: m.totalUnits ?? 0,
      completedUnits: m.completedUnits ?? 0,
    });
    seen.add(m.title);
  }
  return out;
}

/** 未習単元(unit_mastery level 0)。テーブル未適用なら空。 */
async function resolveUnlearnedUnits(
  supabase: Supa,
  userId: string,
): Promise<{ subject: string; unit: string }[]> {
  const { data, error } = await supabase
    .from("unit_mastery")
    .select("subject, unit, level")
    .eq("user_id", userId)
    .eq("level", 0);
  if (error || !data) return [];
  return data.map((d) => ({ subject: d.subject, unit: d.unit }));
}

/** 直近模試の科目別偏差値。テーブル未適用なら undefined(配分は自己申告等で代替)。 */
async function resolveSubjectDeviations(
  supabase: Supa,
  userId: string,
): Promise<PlanEngineInput["subjectDeviations"]> {
  const { data: latest, error } = await supabase
    .from("mock_exams")
    .select("id")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !latest) return undefined;
  const { data: subs } = await supabase
    .from("mock_subjects")
    .select("subject, deviation")
    .eq("user_id", userId)
    .eq("mock_id", latest.id);
  if (!subs || subs.length === 0) return undefined;
  return subs.map((s) => ({ subject: s.subject, deviation: s.deviation }));
}

// ---------------- 生成 ----------------

export interface GenerateResult extends ActionResult {
  /** 計画生成がブロックされた場合の不足層 */
  missing?: string[];
}

/**
 * 今週の週次計画を生成し weekly_plans に保存する(既存週は上書き=再生成)。
 * 第1・2・4層が未取得ならブロックし missing を返す(§10)。
 * AI 利用可なら Opus が範囲タスクを具体化、不可時は決定論フォールバック。
 */
export async function generateWeeklyPlan(): Promise<GenerateResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const profile = await loadProfile();
  const today = todayJST();

  const [examDate, materials, unlearnedUnits, subjectDeviations] =
    await Promise.all([
      resolveExamDate(supabase, user.id, profile),
      resolveMaterials(supabase, user.id, profile),
      resolveUnlearnedUnits(supabase, user.id),
      resolveSubjectDeviations(supabase, user.id),
    ]);

  const input: PlanEngineInput = {
    profile,
    today,
    examDate,
    materials,
    subjectDeviations,
    unlearnedUnits,
  };
  const bp = buildBlueprint(input);
  if (!bp.gate.ok) {
    return {
      error:
        "計画生成に必要な情報が不足しています。ヒアリングで不足項目を埋めてください。",
      missing: bp.gate.missing,
    };
  }

  // AI 具体化(gate.ts を通す)。不可・失敗時は決定論フォールバック。
  let drafts: PlanTaskDraft[] | null = null;
  let theme = "";
  let generatedBy: "ai" | "deterministic" = "deterministic";

  const access = await checkAiAccess(supabase, user.id);
  if (access.allowed) {
    const ai = await generatePlanTasksAI(bp, profile, unlearnedUnits);
    if (ai) {
      drafts = ai.tasks;
      theme = ai.theme;
      generatedBy = "ai";
    }
  }
  if (!drafts) {
    drafts = buildDeterministicTasks(bp);
    theme = deterministicTheme(bp);
    generatedBy = "deterministic";
  }

  const tasks: PlanTask[] = drafts.map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    done: false,
  }));

  const planData: WeeklyPlanData = {
    weekStart: bp.weekStart,
    phase: bp.phase,
    theme,
    tasks,
    subjectAllocation: bp.subjectAllocation,
    availability: {
      effectiveWeeklyHours: bp.availability.effectiveWeeklyHours,
      rawWeeklyHours: bp.availability.rawWeeklyHours,
      commuteMinutesPerWeek: bp.availability.commuteMinutesPerWeek,
    },
    notes: bp.notes,
    examDate: bp.examDate,
    weeksUntilExam: bp.weeksUntilExam,
    busyWeekdays: bp.busyWeekdays,
    generatedBy,
    generatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("weekly_plans").upsert(
    {
      user_id: user.id,
      week_start: bp.weekStart,
      phase: bp.phase,
      theme,
      plan: planData,
      generated_by: generatedBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" },
  );
  if (error) {
    console.error("generateWeeklyPlan:", error.message);
    return {
      error:
        "計画の保存に失敗しました。migration 0009_weekly_plans.sql を適用してください。",
    };
  }

  revalidatePath("/ai");
  return { error: null };
}

// ---------------- 読み込み ----------------

/** 今週の計画を取得(なければ null)。テーブル未適用でも UI は動く。 */
export async function loadCurrentWeeklyPlan(): Promise<WeeklyPlanRow | null> {
  const { supabase, user } = await getUser();
  if (!user) return null;
  const { mondayOf } = await import("@/lib/learning/plan");
  const weekStart = mondayOf(todayJST());
  const { data, error } = await supabase
    .from("weekly_plans")
    .select("*")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("loadCurrentWeeklyPlan:", error.message);
    return null;
  }
  return data;
}

// ---------------- 完了トグル ----------------

/** 週次計画タスクの完了をトグルする(クライアントは taskId のみ渡す)。 */
export async function toggleWeeklyPlanTask(
  taskId: string,
  done: boolean,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { mondayOf } = await import("@/lib/learning/plan");
  const weekStart = mondayOf(todayJST());
  const { data, error } = await supabase
    .from("weekly_plans")
    .select("plan")
    .eq("user_id", user.id)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error || !data) return { error: "計画が見つかりません。" };

  const plan = data.plan as WeeklyPlanData;
  let found = false;
  const tasks = plan.tasks.map((t) => {
    if (t.id === taskId) {
      found = true;
      return { ...t, done };
    }
    return t;
  });
  if (!found) return { error: "タスクが見つかりません。" };

  const { error: upErr } = await supabase
    .from("weekly_plans")
    .update({ plan: { ...plan, tasks }, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("week_start", weekStart);
  if (upErr) return { error: "更新に失敗しました。" };

  revalidatePath("/ai");
  return { error: null };
}
