import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AiHub } from "@/components/features/chat/ai-hub";
import { loadProfile } from "@/lib/actions/learning";
import { loadRoadmap } from "@/lib/actions/roadmap";

export const metadata: Metadata = { title: "勉強計画 | 合格プランナー" };

export default async function AiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [materialsRes, blocksRes, subjectsRes] = await Promise.all([
    supabase
      .from("materials")
      .select("title, subjects(name)")
      .eq("user_id", user.id),
    supabase
      .from("routine_blocks")
      .select("*")
      .eq("user_id", user.id)
      .order("start_time"),
    supabase.from("subjects").select("*").eq("user_id", user.id),
  ]);
  const { data: materialRows, error } = materialsRes;

  if (error) {
    return <p className="text-sm text-destructive">読み込みに失敗しました。</p>;
  }

  const materials = (materialRows ?? []).map((r) => {
    const row = r as unknown as {
      title: string;
      subjects: { name: string } | { name: string }[] | null;
    };
    const subject = Array.isArray(row.subjects)
      ? row.subjects[0]?.name
      : row.subjects?.name;
    return { subject: subject ?? "その他", title: row.title };
  });

  const allBlocks = blocksRes.data ?? [];
  const lifeBlocks = allBlocks
    .filter((b) => b.category === "life")
    .map((b) => ({
      weekday: b.weekday,
      startTime: b.start_time.slice(0, 5),
      endTime: b.end_time.slice(0, 5),
      title: b.title,
    }));
  const weekBlocks = allBlocks.filter((b) => b.category === "study");

  const [profile, roadmap] = await Promise.all([loadProfile(), loadRoadmap()]);

  return (
    <AiHub
      profile={profile}
      roadmap={roadmap}
      weekBlocks={weekBlocks}
      subjects={subjectsRes.data ?? []}
      materials={materials}
      lifeBlocks={lifeBlocks}
    />
  );
}
