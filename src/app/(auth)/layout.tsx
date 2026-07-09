import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-primary/5 to-background px-4">
      <div className="mb-8 flex items-center gap-2 text-primary">
        <GraduationCap className="size-8" />
        <span className="text-2xl font-bold tracking-tight">合格プランナー</span>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
