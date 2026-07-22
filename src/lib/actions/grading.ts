"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import { gradeAnswer } from "@/lib/grading";
import type { GradingResult, GradingSubject } from "@/lib/grading/types";

const SUBJECTS: GradingSubject[] = [
  "math",
  "english",
  "physics",
  "chemistry",
  "biology",
  "japanese",
  "other",
];

export interface GradingState {
  error: string | null;
  result: GradingResult | null;
}

/** 解答を採点して結果を保存する */
export async function submitGrading(input: {
  subject: string;
  question: string;
  answer: string;
  rubric?: string;
}): Promise<GradingState> {
  const subject = SUBJECTS.includes(input.subject as GradingSubject)
    ? (input.subject as GradingSubject)
    : "other";
  const question = String(input.question ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  const rubric = String(input.rubric ?? "").trim();

  if (!question) return { error: "問題文を入力してください。", result: null };
  if (!answer) return { error: "解答を入力してください。", result: null };
  if (question.length > 6000 || answer.length > 6000) {
    return { error: "入力が長すぎます(各6000字以内)。", result: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。", result: null };

  const access = await checkAiAccess(supabase, user.id);
  if (!access.allowed) return { error: access.reason, result: null };

  let result: GradingResult;
  try {
    result = await gradeAnswer({
      subject,
      question,
      answer,
      rubric: rubric || undefined,
    });
  } catch (e) {
    console.error("grading failed:", e);
    return {
      error:
        "採点に失敗しました。APIキーの設定・クレジット残高を確認してください。",
      result: null,
    };
  }

  const { error: saveError } = await supabase.from("grading_results").insert({
    user_id: user.id,
    subject,
    question,
    answer,
    score: result.score,
    result,
  });
  if (saveError) {
    console.error("failed to save grading:", saveError.message);
    // 保存に失敗しても採点結果は返す
  }

  revalidatePath("/grading");
  return { error: null, result };
}

export async function deleteGrading(
  id: string,
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("grading_results")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidatePath("/grading");
  return { error: null };
}
