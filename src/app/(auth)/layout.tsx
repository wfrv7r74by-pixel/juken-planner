import { GraduationCap } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4">
      {/* 落ち着いた金色のグラデーション */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 45% at 50% 0%, rgba(201,168,106,0.08), transparent 70%)",
        }}
      />
      <div className="relative z-10 mb-8 flex flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-full border border-primary/40 text-primary">
          <GraduationCap className="size-7" />
        </span>
        <span className="font-heading text-2xl font-semibold tracking-wide">
          合格プランナー
        </span>
        <span className="h-px w-16 bg-primary/50" />
      </div>
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}
