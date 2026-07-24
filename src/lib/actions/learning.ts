"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  computeCompleteness,
  defaultProfile,
  setField,
} from "@/lib/learning/profile";
import type {
  AdmissionType,
  Grade,
  LevelBand,
  UserLearningProfile,
} from "@/lib/learning/types";
import type { QuestionId } from "@/lib/learning/questions";

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

/** プロフィールを取得(なければ既定を返す)。DB未適用でも既定でUIは動く。 */
export async function loadProfile(): Promise<UserLearningProfile> {
  const { supabase, user } = await getUser();
  if (!user) return defaultProfile();

  const { data, error } = await supabase
    .from("user_learning_profiles")
    .select("profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("loadProfile:", error.message);
    return defaultProfile();
  }
  // 既定とマージして欠損キーを補完(スキーマ進化に耐える)
  return { ...defaultProfile(), ...(data.profile as UserLearningProfile) };
}

async function saveProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  profile: UserLearningProfile,
): Promise<string | null> {
  const completeness = computeCompleteness(profile);
  const next = { ...profile, completeness };
  const { error } = await supabase.from("user_learning_profiles").upsert(
    {
      user_id: userId,
      profile: next,
      phase: profile.phase,
      completeness,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("saveProfile:", error.message);
    return "プロフィールの保存に失敗しました。migration 0008 を適用してください。";
  }
  return null;
}

export type AnswerPayload =
  | { id: "goal.school"; unknown: boolean; name?: string; faculty?: string; examDate?: string | null }
  | { id: "goal.levelBand"; unknown: boolean; levelBand?: LevelBand }
  | { id: "goal.admissionType"; unknown: boolean; types?: AdmissionType[] }
  | { id: "goal.subjects"; unknown: boolean; codes?: string[] }
  | { id: "goal.grade"; unknown: boolean; grade?: Grade }
  | { id: "availability.club"; unknown: boolean; active?: boolean; retirementMonth?: string | null; days?: number[] }
  | { id: "availability.job"; unknown: boolean; days?: number[] }
  | { id: "availability.hours"; unknown: boolean; weekday?: number; weekend?: number }
  | { id: "materials.owned"; unknown: boolean; items?: { subject: string; title: string }[] }
  | { id: "level.entry"; unknown: boolean; hasMock?: boolean }
  | {
      id: "level.proxy";
      unknown: boolean;
      certName?: string;
      certGrade?: string;
      schoolLevelBand?: LevelBand;
      rank?: number;
      totalStudents?: number;
      /** 新高1・高1向け: 高校入試の得点率(%) or 内申点。現在地の代替指標にする。 */
      entranceScore?: number;
      entranceLabel?: string;
    }
  | { id: "traits.tone"; unknown: boolean; tone?: "strict" | "supportive" };

/** 1問の回答をプロフィールへ反映する。「わからない」は仮値(estimated)で埋める。 */
export async function answerQuestion(
  answer: AnswerPayload,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const p = await loadProfile();
  const src = answer.unknown ? "default" : "user_input";
  const conf = answer.unknown ? "estimated" : "confirmed";

  switch (answer.id) {
    case "goal.school":
      if (answer.unknown) {
        // 未定: レベル帯だけあとで聞く。空配列を estimated で置く
        p.goal.targetSchools = setField([], "estimated", "default");
      } else if (answer.name) {
        p.goal.targetSchools = setField(
          [
            {
              name: answer.name,
              faculty: answer.faculty ?? "",
              priority: 1,
              examDate: answer.examDate ?? null,
              levelBand: "upper",
            },
          ],
          "confirmed",
          "user_input",
        );
      }
      break;
    case "goal.levelBand":
      p.goal.levelBand = setField(answer.levelBand ?? "middle", conf, src);
      break;
    case "goal.admissionType":
      p.goal.admissionType = setField(
        answer.unknown ? ["general"] : (answer.types ?? ["general"]),
        conf,
        src,
      );
      break;
    case "goal.subjects":
      p.goal.subjects = setField(
        (answer.codes ?? []).map((code) => ({ code, status: "fixed" as const })),
        conf,
        src,
      );
      break;
    case "goal.grade":
      p.goal.grade = setField(answer.grade ?? "hs3", conf, src);
      break;
    case "availability.club":
      p.availability.clubActivity = setField(
        answer.unknown
          ? { active: false, retirementMonth: null, days: [] }
          : {
              active: answer.active ?? false,
              retirementMonth: answer.retirementMonth ?? null,
              days: answer.days ?? [],
            },
        conf,
        src,
      );
      break;
    case "availability.job":
      p.availability.partTimeJob = setField(
        (answer.unknown ? [] : (answer.days ?? [])).map((d) => ({
          dayOfWeek: d,
          startAt: "17:00",
          endAt: "21:00",
        })),
        conf,
        src,
      );
      break;
    case "availability.hours":
      p.availability.weekdayHours = setField(
        answer.unknown ? 2 : (answer.weekday ?? 2),
        conf,
        src,
      );
      p.availability.weekendHours = setField(
        answer.unknown ? 5 : (answer.weekend ?? 5),
        conf,
        src,
      );
      break;
    case "materials.owned":
      p.materials = setField(
        (answer.unknown ? [] : (answer.items ?? [])).map((m) => ({
          subject: m.subject,
          title: m.title,
          totalUnits: 0,
          completedUnits: 0,
          laps: 0,
        })),
        conf,
        src,
      );
      break;
    case "level.entry": {
      // 既存の模試データを参照して現在地を要約
      const { count } = await supabase
        .from("mock_exams")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      const { data: latest } = await supabase
        .from("mock_exams")
        .select("overall_deviation")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const has = (count ?? 0) > 0;
      p.currentLevel.hasMockExam = has;
      p.currentLevel.mockSummary = setField(
        { latestOverall: latest?.overall_deviation ?? null, count: count ?? 0 },
        has ? "confirmed" : "estimated",
        has ? "mock_exam" : "default",
      );
      break;
    }
    case "level.proxy":
      // 代替指標(§5-3①)。自己申告なので推定値(estimated)で保持する。
      // 「わからない」の場合は何も設定しない(第2層は未達のまま。UIで模試/診断へ誘導)。
      if (!answer.unknown) {
        if (answer.certName) {
          p.currentLevel.proxyIndicators.certifications = setField(
            [{ name: answer.certName, grade: answer.certGrade ?? "" }],
            "estimated",
            "user_input",
          );
        }
        if (answer.schoolLevelBand) {
          p.currentLevel.proxyIndicators.schoolLevelBand = setField(
            answer.schoolLevelBand,
            "estimated",
            "user_input",
          );
        }
        if (
          typeof answer.rank === "number" &&
          typeof answer.totalStudents === "number"
        ) {
          p.currentLevel.proxyIndicators.classRank = setField(
            { rank: answer.rank, totalStudents: answer.totalStudents },
            "estimated",
            "user_input",
          );
        }
        // 新高1・高1: 高校入試の得点/内申を現在地の代替指標にする(§5-3①)
        if (typeof answer.entranceScore === "number") {
          p.currentLevel.proxyIndicators.periodicTestScores = setField(
            [
              {
                subject: answer.entranceLabel ?? "高校入試",
                score: answer.entranceScore,
              },
            ],
            "estimated",
            "user_input",
          );
        }
      }
      break;
    case "traits.tone":
      p.traits.preferredTone = setField(
        answer.unknown ? "supportive" : (answer.tone ?? "supportive"),
        conf,
        src,
      );
      break;
  }

  if (!p.answeredQuestionIds.includes(answer.id)) {
    p.answeredQuestionIds.push(answer.id as QuestionId);
  }

  const saveError = await saveProfile(supabase, user.id, p);
  if (saveError) return { error: saveError };

  revalidatePath("/ai");
  return ok;
}

/** ヒアリングをやり直す(プロフィールを初期化) */
export async function resetOnboarding(): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };
  const saveError = await saveProfile(supabase, user.id, defaultProfile());
  if (saveError) return { error: saveError };
  revalidatePath("/ai");
  return ok;
}
