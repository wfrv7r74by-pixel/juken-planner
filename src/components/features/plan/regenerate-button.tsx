"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { regeneratePlan } from "@/lib/actions/plan";
import { Button } from "@/components/ui/button";

export function RegenerateButton({
  label = "プランを再生成",
  variant = "default",
}: {
  label?: string;
  variant?: "default" | "outline" | "secondary";
}) {
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    startTransition(async () => {
      const res = await regeneratePlan();
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("学習プランを生成しました");
      }
    });
  };

  return (
    <Button onClick={onClick} disabled={pending} variant={variant}>
      <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
      {pending ? "生成中..." : label}
    </Button>
  );
}
