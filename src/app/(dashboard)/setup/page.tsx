import type { Metadata } from "next";
import { SetupWizard } from "@/components/features/setup/setup-wizard";

export const metadata: Metadata = { title: "はじめる | 合格プランナー" };

export default function SetupPage() {
  return (
    <div className="py-4">
      <SetupWizard />
    </div>
  );
}
