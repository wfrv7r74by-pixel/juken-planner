"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup, type AuthState } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initialState: AuthState = { error: null };

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const action = mode === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === "login" ? "ログイン" : "新規登録"}</CardTitle>
        <CardDescription>
          {mode === "login"
            ? "登録済みのアカウントでログインします"
            : "アカウントを作成して学習計画を始めましょう"}
        </CardDescription>
      </CardHeader>
      <form action={formAction}>
        <CardContent className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-2">
              <Label htmlFor="display_name">名前</Label>
              <Input
                id="display_name"
                name="display_name"
                placeholder="山田 太郎"
                required
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">メールアドレス</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">パスワード</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "signup" ? 8 : undefined}
              required
            />
          </div>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </CardContent>
        <CardFooter className="mt-6 flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending
              ? "送信中..."
              : mode === "login"
                ? "ログイン"
                : "登録する"}
          </Button>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                アカウントをお持ちでない方は{" "}
                <Link href="/signup" className="text-primary underline">
                  新規登録
                </Link>
              </>
            ) : (
              <>
                すでにアカウントをお持ちの方は{" "}
                <Link href="/login" className="text-primary underline">
                  ログイン
                </Link>
              </>
            )}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
