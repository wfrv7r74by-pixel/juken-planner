"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface AuthState {
  error: string | null;
}

export async function login(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "メールアドレスとパスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "ログインに失敗しました。メールアドレスとパスワードを確認してください。" };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!displayName || !email || !password) {
    return { error: "すべての項目を入力してください。" };
  }
  if (password.length < 8) {
    return { error: "パスワードは8文字以上にしてください。" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });

  if (error) {
    const messages: Record<string, string> = {
      user_already_exists: "このメールアドレスは既に登録されています。",
      email_address_invalid: "このメールアドレスは使用できません。別のアドレスをお試しください。",
      over_email_send_rate_limit:
        "メール送信の上限に達しました。1時間ほど待ってから再度お試しください。",
      weak_password: "パスワードが簡単すぎます。より複雑なものにしてください。",
    };
    return {
      error:
        (error.code && messages[error.code]) ??
        "登録に失敗しました。時間をおいて再度お試しください。",
    };
  }

  // メール確認が有効な場合はセッションが作られない
  if (!data.session) {
    return {
      error:
        "確認メールを送信しました。メール内のリンクを開いて登録を完了してから、ログインしてください。",
    };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    // サインアウト失敗時もログイン画面へ逃がす(セッションは proxy で再検証される)
    console.error("signOut failed:", error.message);
  }
  revalidatePath("/", "layout");
  redirect("/login");
}
