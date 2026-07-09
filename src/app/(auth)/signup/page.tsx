import type { Metadata } from "next";
import { AuthForm } from "@/components/features/auth/auth-form";

export const metadata: Metadata = { title: "新規登録 | 合格プランナー" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
