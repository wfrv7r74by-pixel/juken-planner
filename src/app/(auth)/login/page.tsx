import type { Metadata } from "next";
import { AuthForm } from "@/components/features/auth/auth-form";

export const metadata: Metadata = { title: "ログイン | 合格プランナー" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
