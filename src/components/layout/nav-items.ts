import {
  BookOpen,
  LayoutDashboard,
  PenLine,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: LayoutDashboard },
  { href: "/ai", label: "AI相談", icon: Sparkles },
  { href: "/grading", label: "採点", icon: PenLine },
  { href: "/materials", label: "教材", icon: BookOpen },
  { href: "/settings", label: "設定", icon: Settings },
];
