import { GraduationCap } from "lucide-react";
import { BackgroundBeams } from "@/components/ui/aceternity/background-beams";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4">
      <BackgroundBeams />
      <div className="relative z-10 mb-8 flex items-center gap-2 text-primary">
        <GraduationCap className="size-8" />
        <span className="text-2xl font-black tracking-tight">合格プランナー</span>
      </div>
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}
