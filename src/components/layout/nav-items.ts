import {
  BookOpen,
  CalendarCheck,
  LayoutDashboard,
  PenLine,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ホーム", icon: LayoutDashboard },
  { href: "/ai", label: "勉強計画", icon: CalendarCheck },
  { href: "/grading", label: "採点", icon: PenLine },
  { href: "/mocks", label: "模試", icon: TrendingUp },
  { href: "/materials", label: "教材", icon: BookOpen },
  { href: "/settings", label: "設定", icon: Settings },
];
