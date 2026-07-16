import {
  BookOpen,
  CalendarDays,
  ChartColumn,
  House,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "今日", icon: House },
  { href: "/calendar", label: "カレンダー", icon: CalendarDays },
  { href: "/materials", label: "教材", icon: BookOpen },
  { href: "/stats", label: "統計", icon: ChartColumn },
  { href: "/settings", label: "設定", icon: Settings },
];
