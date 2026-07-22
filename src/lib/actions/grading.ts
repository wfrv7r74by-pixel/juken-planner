"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { checkAiAccess } from "@/lib/ai/gate";
import { gradeAnswer } from "@/lib/grading";
import type {
  GradingImage,
  GradingResult,
  GradingSubject,
} from "@/lib/grading/types";

const IMAGE_MEDIA_TYPES: Record<string, GradingImage["mediaType"]> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

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

/** 解答を採点して結果を保存する(imagePath があれば答案写真を vision で採点) */
export async function submitGrading(input: {
  subject: string;
  question: string;
  answer: string;
  rubric?: string;
  imagePath?: string;
}): Promise<GradingState> {
  const subject = SUBJECTS.includes(input.subject as GradingSubject)
    ? (input.subject as GradingSubject)
    : "other";
  const question = String(input.question ?? "").trim();
  const answer = String(input.answer ?? "").trim();
  const rubric = String(input.rubric ?? "").trim();
  const imagePath = String(input.imagePath ?? "").trim();

  if (!question) return { error: "問題文を入力してください。", result: null };
  if (!answer && !imagePath) {
    return { error: "解答(テキストまたは写真)を入力してください。", result: null };
  }
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

  // 答案画像をストレージから取得して base64 化
  let image: GradingImage | undefined;
  if (imagePath) {
    // パスは answers/<uid>/... のみ許可(他人の画像を採点に使わせない)
    if (!imagePath.startsWith(`${user.id}/`)) {
      return { error: "画像の指定が不正です。", result: null };
    }
    const ext = imagePath.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = IMAGE_MEDIA_TYPES[ext];
    if (!mediaType) {
      return { error: "対応していない画像形式です(jpg/png/webp)。", result: null };
    }
    const { data: blob, error: dlError } = await supabase.storage
      .from("answers")
      .download(imagePath);
    if (dlError || !blob) {
      return { error: "答案画像の読み込みに失敗しました。", result: null };
    }
    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    image = { base64, mediaType };
  }

  let result: GradingResult;
  try {
    result = await gradeAnswer({
      subject,
      question,
      answer,
      image,
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
    image_path: imagePath || null,
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
