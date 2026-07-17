"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  type MotionStyle,
} from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Aceternity UI の CardSpotlight 風。
 * マウス位置に追従する光 + 常時うっすら光る枠。
 * glow は "R,G,B" 形式で指定する。
 */
export function GlowCard({
  children,
  className,
  glow = "59,130,246",
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  return (
    <div
      onMouseMove={(e) => {
        const { left, top } = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - left);
        mouseY.set(e.clientY - top);
      }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-card",
        className,
      )}
      style={{
        boxShadow: `inset 0 1px 0 0 rgba(${glow},0.12), 0 0 24px -12px rgba(${glow},0.35)`,
      }}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={
          {
            background: useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, rgba(${glow},0.14), transparent 80%)`,
          } as MotionStyle
        }
      />
      <div className="relative">{children}</div>
    </div>
  );
}
