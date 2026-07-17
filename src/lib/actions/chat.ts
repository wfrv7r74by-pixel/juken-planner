"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { runChat, type AiContext } from "@/lib/ai/chat";
import type {
  ChatMetadata,
  MaterialProposal,
  MilestonesProposal,
  PhasesProposal,
  Proposal,
  RoutineProposal,
} from "@/types/database";
import type { ActionResult } from "@/lib/actions/masters";

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const SUBJECT_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#22c55e",
  "#f97316",
  "#06b6d4",
  "#eab308",
];

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** ユーザーの現在データを AI 用コンテキストに集約する */
async function buildContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  displayName: string,
): Promise<AiContext> {
  const today = format(new Date(), "yyyy-MM-dd");
  const from14 = format(
    new Date(Date.now() - 13 * 24 * 60 * 60 * 1000),
    "yyyy-MM-dd",
  );

  const [milestones, phases, subjects, materials, sections, blocks, logs, notes] =
    await Promise.all([
      supabase
        .from("milestones")
        .select("title, date, kind, is_target")
        .eq("user_id", userId)
        .gte("date", today)
        .order("date")
        .limit(10),
      supabase
        .from("phases")
        .select("name, start_date, end_date, memo")
        .eq("user_id", userId)
        .order("start_date"),
      supabase.from("subjects").select("id, name").eq("user_id", userId),
      supabase
        .from("materials")
        .select("id, title, subject_id")
        .eq("user_id", userId),
      supabase
        .from("material_sections")
        .select("material_id, status")
        .eq("user_id", userId),
      supabase
        .from("routine_blocks")
        .select("weekday, start_time, end_time, title, category")
        .eq("user_id", userId)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("study_logs")
        .select("date, minutes")
        .eq("user_id", userId)
        .gte("date", from14),
      supabase
        .from("daily_notes")
        .select("date, good, issue")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(5),
    ]);

  const subjectNameById = new Map(
    (subjects.data ?? []).map((s) => [s.id, s.name]),
  );
  const sectionsByMaterial = new Map<string, { done: number; total: number }>();
  for (const s of sections.data ?? []) {
    const cur = sectionsByMaterial.get(s.material_id) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (s.status === "done") cur.done += 1;
    sectionsByMaterial.set(s.material_id, cur);
  }

  // 曜日ごとの勉強時間サマリー
  const studyMinutesByWeekday = new Map<number, number>();
  for (const b of blocks.data ?? []) {
    if (b.category !== "study") continue;
    const [sh, sm] = b.start_time.split(":").map(Number);
    const [eh, em] = b.end_time.split(":").map(Number);
    studyMinutesByWeekday.set(
      b.weekday,
      (studyMinutesByWeekday.get(b.weekday) ?? 0) + (eh * 60 + em - sh * 60 - sm),
    );
  }
  const routineSummary = [...studyMinutesByWeekday.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, m]) => `${WEEKDAY_LABELS[w]}:勉強${(m / 60).toFixed(1)}h`)
    .join(" ");

  const totalMinutes = (logs.data ?? []).reduce((a, l) => a + l.minutes, 0);
  const recentStudy =
    (logs.data ?? []).length > 0
      ? `直近14日で合計${(totalMinutes / 60).toFixed(1)}時間`
      : "";

  return {
    today,
    displayName,
    milestones: milestones.data ?? [],
    phases: phases.data ?? [],
    subjects: (subjects.data ?? []).map((s) => s.name),
    materials: (materials.data ?? []).map((m) => ({
      subject: subjectNameById.get(m.subject_id) ?? "-",
      title: m.title,
      ...(sectionsByMaterial.get(m.id) ?? { done: 0, total: 0 }),
    })),
    routineSummary,
    recentStudy,
    recentNotes: notes.data ?? [],
  };
}

/** チャットにメッセージを送り、AI の応答(+提案)を保存する */
export async function sendChatMessage(content: string): Promise<ActionResult> {
  const trimmed = content.trim();
  if (!trimmed) return { error: "メッセージを入力してください。" };
  if (trimmed.length > 4000) return { error: "メッセージが長すぎます。" };

  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      error:
        "AI 機能が未設定です。.env.local に ANTHROPIC_API_KEY を設定してサーバーを再起動してください。",
    };
  }

  const [profileRes, historyRes] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase
      .from("chat_messages")
      .select("role, content")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24),
  ]);
  if (historyRes.error) return { error: "履歴の取得に失敗しました。" };

  const { error: insertUserError } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, role: "user", content: trimmed });
  if (insertUserError) return { error: "メッセージの保存に失敗しました。" };
  revalidatePath("/ai");

  const context = await buildContext(
    supabase,
    user.id,
    profileRes.data?.display_name ?? "",
  );

  const history = [...historyRes.data].reverse();
  let turn;
  try {
    turn = await runChat([...history, { role: "user", content: trimmed }], context);
  } catch (e) {
    console.error("AI chat failed:", e);
    return {
      error:
        "AI の応答に失敗しました。APIキーの設定・クレジット残高を確認して、もう一度お試しください。",
    };
  }

  const metadata: ChatMetadata | null =
    turn.proposals.length > 0 ? { proposals: turn.proposals } : null;
  const { error: insertAiError } = await supabase.from("chat_messages").insert({
    user_id: user.id,
    role: "assistant",
    content: turn.text,
    metadata,
  });
  if (insertAiError) return { error: "応答の保存に失敗しました。" };

  revalidatePath("/", "layout");
  return { error: null };
}

/** チャット履歴を全削除する */
export async function clearChat(): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", user.id);
  if (error) return { error: "削除に失敗しました。" };

  revalidatePath("/ai");
  return { error: null };
}

async function ensureSubject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  name: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("subjects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
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
      name,
      color: SUBJECT_COLORS[(count ?? 0) % SUBJECT_COLORS.length],
    })
    .select("id")
    .single();
  if (error || !inserted) return null;
  return inserted.id;
}

/** AI の提案をデータに反映する */
export async function applyProposal(
  messageId: string,
  proposalIndex: number,
): Promise<ActionResult> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: message, error: findError } = await supabase
    .from("chat_messages")
    .select("id, metadata")
    .eq("id", messageId)
    .eq("user_id", user.id)
    .single();
  if (findError || !message?.metadata?.proposals) {
    return { error: "提案が見つかりません。" };
  }
  const proposal: Proposal | undefined =
    message.metadata.proposals[proposalIndex];
  if (!proposal) return { error: "提案が見つかりません。" };
  if (proposal.applied) return { error: "この提案は反映済みです。" };

  if (proposal.type === "propose_phases") {
    const data = proposal.data as PhasesProposal;
    if (data.replace) {
      const { error } = await supabase
        .from("phases")
        .delete()
        .eq("user_id", user.id);
      if (error) return { error: "既存フェーズの削除に失敗しました。" };
    }
    const { error } = await supabase.from("phases").insert(
      data.phases.map((p, i) => ({
        user_id: user.id,
        name: p.name,
        start_date: p.start_date,
        end_date: p.end_date,
        memo: p.memo ?? null,
        sort_order: i,
      })),
    );
    if (error) return { error: "フェーズの登録に失敗しました。" };
  } else if (proposal.type === "propose_routine") {
    const data = proposal.data as RoutineProposal;
    if (data.replace) {
      const { error } = await supabase
        .from("routine_blocks")
        .delete()
        .eq("user_id", user.id)
        .in("weekday", data.weekdays);
      if (error) return { error: "既存ブロックの削除に失敗しました。" };
    }
    const rows = [];
    for (const weekday of data.weekdays) {
      for (const b of data.blocks) {
        let subjectId: string | null = null;
        if (b.subject) {
          subjectId = await ensureSubject(supabase, user.id, b.subject);
        }
        rows.push({
          user_id: user.id,
          weekday,
          start_time: b.start_time,
          end_time: b.end_time,
          title: b.title,
          category: b.category,
          subject_id: subjectId,
        });
      }
    }
    const { error } = await supabase.from("routine_blocks").insert(rows);
    if (error) return { error: "ルーティンの登録に失敗しました。" };
  } else if (proposal.type === "propose_material") {
    const data = proposal.data as MaterialProposal;
    const subjectId = await ensureSubject(supabase, user.id, data.subject);
    if (!subjectId) return { error: "科目の作成に失敗しました。" };
    const { data: material, error: materialError } = await supabase
      .from("materials")
      .insert({
        user_id: user.id,
        subject_id: subjectId,
        title: data.title,
        total_units: Math.max(1, data.sections.length),
        unit_label: "章",
        minutes_per_unit: 60,
      })
      .select("id")
      .single();
    if (materialError || !material) {
      return { error: "教材の登録に失敗しました。" };
    }
    const { error: sectionsError } = await supabase
      .from("material_sections")
      .insert(
        data.sections.map((title, i) => ({
          user_id: user.id,
          material_id: material.id,
          title,
          sort_order: i,
        })),
      );
    if (sectionsError) return { error: "章の登録に失敗しました。" };
  } else if (proposal.type === "propose_milestones") {
    const data = proposal.data as MilestonesProposal;
    if (data.milestones.some((m) => m.is_target)) {
      const { error } = await supabase
        .from("milestones")
        .update({ is_target: false })
        .eq("user_id", user.id)
        .eq("is_target", true);
      if (error) return { error: "既存の本命の更新に失敗しました。" };
    }
    const { error } = await supabase.from("milestones").insert(
      data.milestones.map((m) => ({
        user_id: user.id,
        title: m.title,
        date: m.date,
        kind: m.kind,
        is_target: m.is_target ?? false,
      })),
    );
    if (error) return { error: "マイルストーンの登録に失敗しました。" };
  }

  // 反映済みフラグを保存
  const updatedProposals = message.metadata.proposals.map((p, i) =>
    i === proposalIndex ? { ...p, applied: true } : p,
  );
  const { error: markError } = await supabase
    .from("chat_messages")
    .update({ metadata: { proposals: updatedProposals } })
    .eq("id", messageId);
  if (markError) {
    console.error("failed to mark proposal applied:", markError.message);
  }

  revalidatePath("/", "layout");
  return { error: null };
}
