// セットアップウィザード用のプリセットデータ
import type { Phase } from "@/types/database";

export interface ExamPreset {
  id: string;
  title: string;
  /** yyyy-MM-dd。目安の日付(ユーザーが編集可能) */
  date: string;
}

// 2027年度入試の目安日程
export const EXAM_PRESETS: ExamPreset[] = [
  { id: "kyotsu", title: "共通テスト", date: "2027-01-16" },
  { id: "shidai", title: "私大一般入試", date: "2027-02-01" },
  { id: "kokkoritsu", title: "国公立二次(前期)", date: "2027-02-25" },
];

export interface SubjectPreset {
  name: string;
  color: string;
}

export const SUBJECT_PRESETS: SubjectPreset[] = [
  { name: "英語", color: "#2563eb" },
  { name: "数学", color: "#4f46e5" },
  { name: "国語", color: "#db2777" },
  { name: "理科", color: "#16a34a" },
  { name: "社会", color: "#ea580c" },
  { name: "情報", color: "#0891b2" },
];

export interface MaterialTemplate {
  title: string;
  total_units: number;
  unit_label: string;
  minutes_per_unit: number;
  phase: Phase;
  /** デフォルトでチェックを入れるか */
  recommended: boolean;
}

/** 科目名に応じた教材テンプレート */
export function templatesForSubject(subjectName: string): MaterialTemplate[] {
  if (subjectName.includes("英")) {
    return [
      { title: "英単語帳", total_units: 200, unit_label: "ページ", minutes_per_unit: 2, phase: "basic", recommended: true },
      { title: "英文法問題集", total_units: 300, unit_label: "問", minutes_per_unit: 2, phase: "basic", recommended: true },
      { title: "長文読解問題集", total_units: 30, unit_label: "題", minutes_per_unit: 25, phase: "advance", recommended: true },
      { title: "過去問(英語)", total_units: 10, unit_label: "年分", minutes_per_unit: 90, phase: "final", recommended: true },
    ];
  }
  if (subjectName.includes("数")) {
    return [
      { title: "数学 基礎問題集", total_units: 300, unit_label: "問", minutes_per_unit: 8, phase: "basic", recommended: true },
      { title: "数学 応用問題集", total_units: 150, unit_label: "問", minutes_per_unit: 15, phase: "advance", recommended: true },
      { title: "過去問(数学)", total_units: 10, unit_label: "年分", minutes_per_unit: 120, phase: "final", recommended: true },
    ];
  }
  if (subjectName.includes("国")) {
    return [
      { title: "古文単語帳", total_units: 100, unit_label: "ページ", minutes_per_unit: 3, phase: "basic", recommended: true },
      { title: "現代文読解問題集", total_units: 25, unit_label: "題", minutes_per_unit: 25, phase: "advance", recommended: true },
      { title: "過去問(国語)", total_units: 10, unit_label: "年分", minutes_per_unit: 90, phase: "final", recommended: true },
    ];
  }
  if (subjectName.includes("理")) {
    return [
      { title: "理科 講義系参考書", total_units: 250, unit_label: "ページ", minutes_per_unit: 4, phase: "basic", recommended: true },
      { title: "理科 問題集", total_units: 200, unit_label: "問", minutes_per_unit: 8, phase: "advance", recommended: true },
      { title: "過去問(理科)", total_units: 10, unit_label: "年分", minutes_per_unit: 90, phase: "final", recommended: true },
    ];
  }
  if (subjectName.includes("社") || subjectName.includes("歴") || subjectName.includes("地") || subjectName.includes("公")) {
    return [
      { title: "講義系参考書(社会)", total_units: 300, unit_label: "ページ", minutes_per_unit: 3, phase: "basic", recommended: true },
      { title: "一問一答(社会)", total_units: 250, unit_label: "ページ", minutes_per_unit: 3, phase: "advance", recommended: true },
      { title: "過去問(社会)", total_units: 10, unit_label: "年分", minutes_per_unit: 70, phase: "final", recommended: true },
    ];
  }
  return [
    { title: "参考書", total_units: 200, unit_label: "ページ", minutes_per_unit: 4, phase: "basic", recommended: true },
    { title: "問題集", total_units: 200, unit_label: "問", minutes_per_unit: 6, phase: "advance", recommended: true },
    { title: "過去問", total_units: 10, unit_label: "年分", minutes_per_unit: 90, phase: "final", recommended: true },
  ];
}
