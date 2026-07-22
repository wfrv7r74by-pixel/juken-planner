import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MockHub } from "@/components/features/mocks/mock-hub";
import type { MockSubject } from "@/types/database";

export const metadata: Metadata = { title: "模試 | 合格プランナー" };

export default async function MocksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [mocksRes, subjectsRes] = await Promise.all([
    supabase
      .from("mock_exams")
      .select("*")
      .eq("user_id", user.id)
      .order("date", { ascending: false }),
    supabase
      .from("mock_subjects")
      .select("*")
      .eq("user_id", user.id)
      .order("sort_order"),
  ]);

  if (mocksRes.error) {
    console.error("failed to load mocks:", mocksRes.error.message);
  }

  const subjectsByMock: Record<string, MockSubject[]> = {};
  for (const s of subjectsRes.data ?? []) {
    (subjectsByMock[s.mock_id] ??= []).push(s);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold">模試</h1>
        <p className="text-sm text-muted-foreground">
          共通テスト・冠模試・学力測定模試の成績を記録し、推移と弱点を管理
        </p>
      </div>
      <MockHub
        userId={user.id}
        mocks={mocksRes.data ?? []}
        subjectsByMock={subjectsByMock}
      />
    </div>
  );
}
