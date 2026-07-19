// 教材・科目まわりの共有ロジック(Server Actions から利用)
import type { createClient } from "@/lib/supabase/server";

type Supa = Awaited<ReturnType<typeof createClient>>;

const SUBJECT_COLORS = [
  "#c9a86a",
  "#7f97ad",
  "#9a8fb5",
  "#93ac89",
  "#c08a5f",
  "#a8788a",
  "#8aa3a0",
];

/** 科目名から ID を取得(なければ作成) */
export async function ensureSubject(
  supabase: Supa,
  userId: string,
  name: string,
): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: existing } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", trimmed)
    .maybeSingle();
  if (existing) return existing.id;

  const { count } = await supabase
    .from("subjects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const { data: inserted, error } = await supabase
    .from("subjects")
    .insert({
      user_id: userId,
      name: trimmed,
      color: SUBJECT_COLORS[(count ?? 0) % SUBJECT_COLORS.length],
    })
    .select("id")
    .single();
  if (error || !inserted) return null;
  return inserted.id;
}

/** 教材 + 章を一括登録する */
export async function insertMaterialWithSections(
  supabase: Supa,
  userId: string,
  data: {
    subject: string;
    title: string;
    sections: string[];
    fit_score?: number;
    fit_comment?: string;
  },
): Promise<string | null> {
  const subjectId = await ensureSubject(supabase, userId, data.subject);
  if (!subjectId) return "科目の作成に失敗しました。";

  const { data: material, error: materialError } = await supabase
    .from("materials")
    .insert({
      user_id: userId,
      subject_id: subjectId,
      title: data.title.trim(),
      total_units: Math.max(1, data.sections.length),
      unit_label: "章",
      minutes_per_unit: 60,
      fit_score: data.fit_score ?? null,
      fit_comment: data.fit_comment?.trim() || null,
    })
    .select("id")
    .single();
  if (materialError || !material) return "教材の登録に失敗しました。";

  if (data.sections.length > 0) {
    const { error: sectionsError } = await supabase
      .from("material_sections")
      .insert(
        data.sections.map((title, i) => ({
          user_id: userId,
          material_id: material.id,
          title: title.trim(),
          sort_order: i,
        })),
      );
    if (sectionsError) return "章の登録に失敗しました。";
  }
  return null;
}
