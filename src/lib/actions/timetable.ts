"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import { suggestSessionActivities } from "@/lib/ai/timetable";
import { loadProfile } from "@/lib/actions/learning";
import { canGeneratePlan, computeAvailability } from "@/lib/learning/profile";
import { computeSubjectAllocation } from "@/lib/learning/plan";
import { buildWeeklyTimetable } from "@/lib/learning/timetable";
import {
  currentDivision,
  DEFAULT_STUDY_WINDOW,
  DIVISION_NAME,
  mondayOf,
  type RoadmapData,
  type StudyWindow,
} from "@/lib/learning/roadmap";
import { ensureSubject } from "@/lib/data/materials";

export interface ActionResult {
  error: string | null;
}
export interface GenerateResult extends ActionResult {
  missing?: string[];
}

function todayJST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(
    new Date(),
  );
}
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/**
 * 今週の時間割を生成し、ホームの「予定」(routine_blocks, category=study)に書き込む。
 * 生成した勉強ブロック(effective_from が非NULL)のみ置換し、手動追加や生活予定は保持する。
 * ホームの予定タブがそのまま時間割として表示・完了チェックする(連携)。
 */
export async function generateWeeklyTimetable(): Promise<GenerateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const profile = await loadProfile();
  const gate = canGeneratePlan(profile);
  if (!gate.ok) {
    return {
      error: "計画に必要な情報が不足しています。相談と前提入力を先に済ませてください。",
      missing: gate.missing,
    };
  }

  const today = todayJST();

  // 科目配分(既存ロジック再利用)
  const allocation = computeSubjectAllocation(
    { profile, today, examDate: null, materials: [] },
    computeAvailability(profile).effectiveWeeklyHours,
  ).map((a) => ({ subject: a.subject, weight: a.weight }));
  if (allocation.length === 0) {
    return { error: "受験科目が未設定です。相談で科目を選んでください。" };
  }

  // 勉強可能ウィンドウ(前提入力) と 固定予定(生活ブロック)
  const win: StudyWindow = profile.studyWindow
    ? {
        weekdayStartMin: toMin(profile.studyWindow.weekdayStart),
        weekdayEndMin: toMin(profile.studyWindow.weekdayEnd),
        weekendStartMin: toMin(profile.studyWindow.weekendStart),
        weekendEndMin: toMin(profile.studyWindow.weekendEnd),
      }
    : DEFAULT_STUDY_WINDOW;

  const { data: lifeRows } = await supabase
    .from("routine_blocks")
    .select("weekday, start_time, end_time")
    .eq("user_id", user.id)
    .eq("category", "life");
  const fixedBlocks = (lifeRows ?? []).map((b) => ({
    weekday: b.weekday,
    startMin: toMin(b.start_time),
    endMin: toMin(b.end_time),
  }));

  const timetable = buildWeeklyTimetable({
    studyWindow: win,
    fixedBlocks,
    allocation,
  });
  if (timetable.length === 0) {
    return {
      error:
        "勉強に使える空き時間が見つかりません。前提の「勉強できる時間帯」や固定予定を見直してください。",
    };
  }

  // 現区分と到達目標(AI の内容付けに使う)
  const { data: rmRow } = await supabase
    .from("study_roadmaps")
    .select("roadmap")
    .eq("user_id", user.id)
    .maybeSingle();
  const roadmap = (rmRow?.roadmap as RoadmapData) ?? null;
  const current = roadmap ? currentDivision(roadmap.divisions, today) : null;

  // AI で各科目の学習活動を作る(不可・失敗時は科目名のみ)
  let activityMap = new Map<string, string[]>();
  const access = await checkAiAccess(supabase, user.id);
  if (access.allowed && current && roadmap) {
    const concepts =
      roadmap.concepts.find((c) => c.divisionKind === current.kind)?.subjects ??
      [];
    const { data: target } = await supabase
      .from("milestones")
      .select("title, date")
      .eq("user_id", user.id)
      .eq("is_target", true)
      .limit(1)
      .maybeSingle();
    const goal = target ? `${target.title}(${target.date})合格` : "一般的な大学受験";
    const tone =
      profile.traits.preferredTone.value === "strict" ? "厳しめ" : "励まし寄り";
    const materials = (profile.materials.value ?? []).map((m) => ({
      subject: m.subject,
      title: m.title,
    }));
    const ai = await suggestSessionActivities({
      divisionName: DIVISION_NAME[current.kind],
      goal,
      tone,
      items: concepts.map((s) => ({ subject: s.subject, concept: s.concept })),
      materials,
    });
    if (ai) activityMap = new Map(ai.map((a) => [a.subject, a.activities]));
  }

  // 科目→ID(色付き)キャッシュ
  const subjectIdCache = new Map<string, string | null>();
  const subjectId = async (name: string): Promise<string | null> => {
    if (subjectIdCache.has(name)) return subjectIdCache.get(name) ?? null;
    const id = await ensureSubject(supabase, user.id, name);
    subjectIdCache.set(name, id);
    return id;
  };

  const weekStart = mondayOf(today);
  const effUntil = current?.endDate ?? null;
  const perSubjectIdx = new Map<string, number>();

  const rows: {
    user_id: string;
    weekday: number;
    start_time: string;
    end_time: string;
    title: string;
    category: "study";
    subject_id: string | null;
    effective_from: string;
    effective_until: string | null;
  }[] = [];

  for (const b of timetable) {
    let title: string;
    let subject_id: string | null = null;
    if (b.kind === "review") {
      title = "宿題処理・週次の復習";
    } else if (b.kind === "plan") {
      title = "翌週の計画・確認";
    } else {
      const subject = b.subject ?? "学習";
      const acts = activityMap.get(subject) ?? [];
      const idx = perSubjectIdx.get(subject) ?? 0;
      perSubjectIdx.set(subject, idx + 1);
      title = acts.length ? `${subject}：${acts[idx % acts.length]}` : subject;
      subject_id = await subjectId(subject);
    }
    rows.push({
      user_id: user.id,
      weekday: b.weekday,
      start_time: toTime(b.startMin),
      end_time: toTime(b.endMin),
      title,
      category: "study",
      subject_id,
      effective_from: weekStart,
      effective_until: effUntil,
    });
  }

  // 生成した勉強ブロックだけ置換(手動=effective_from が NULL は保持)
  const { error: delErr } = await supabase
    .from("routine_blocks")
    .delete()
    .eq("user_id", user.id)
    .eq("category", "study")
    .not("effective_from", "is", null);
  if (delErr) {
    console.error("generateWeeklyTimetable delete:", delErr.message);
    return { error: "既存の時間割の更新に失敗しました。" };
  }
  const { error: insErr } = await supabase.from("routine_blocks").insert(rows);
  if (insErr) {
    console.error("generateWeeklyTimetable insert:", insErr.message);
    return { error: "時間割の保存に失敗しました。" };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
