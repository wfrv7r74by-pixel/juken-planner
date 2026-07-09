import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";

export function Header({ displayName }: { displayName: string }) {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-4 md:px-6">
      <span className="font-bold text-primary md:hidden">合格プランナー</span>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-muted-foreground">
          {displayName || "受験生"} さん
        </span>
        <form action={logout}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="size-4" />
            <span className="hidden sm:inline">ログアウト</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
