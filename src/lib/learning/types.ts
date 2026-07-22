// 学習相談: ユーザー学習プロフィール(5層モデル)の型定義。
// 全項目に confidence を持たせ、推定値と確定値を区別する。

export type Confidence = "confirmed" | "estimated" | "unknown";

export type FieldSource =
  | "user_input"
  | "mock_exam"
  | "diagnostic_test"
  | "weekly_check"
  | "default";

export interface Field<T> {
  value: T | null;
  confidence: Confidence;
  updatedAt: string; // ISO8601
  source: FieldSource;
}

export type LevelBand = "top" | "upper" | "middle" | "basic";
export type AdmissionType =
  | "general"
  | "common_test"
  | "recommendation"
  | "comprehensive";
export type Grade = "hs1" | "hs2" | "hs3" | "ronin";

export interface TargetSchool {
  name: string;
  faculty: string;
  priority: 1 | 2 | 3;
  examDate: string | null;
  levelBand: LevelBand;
}

export interface GoalLayer {
  targetSchools: Field<TargetSchool[]>;
  admissionType: Field<AdmissionType[]>;
  subjects: Field<{ code: string; status: "fixed" | "undecided" }[]>;
  grade: Field<Grade>;
  concurrentApplicationCount: Field<number>;
}

export interface UnitMasteryEntry {
  subject: string;
  unit: string;
  level: 0 | 1 | 2 | 3;
  verifiedBy: "self_report" | "diagnostic" | "mock_exam" | "weekly_check";
}

export interface CurrentLevelLayer {
  hasMockExam: boolean;
  /** 既存の mock_exams を参照する形なので、ここは要約のみ保持 */
  mockSummary: Field<{ latestOverall: number | null; count: number }>;
  proxyIndicators: {
    schoolName: Field<string>;
    schoolLevelBand: Field<LevelBand>;
    classRank: Field<{ rank: number; totalStudents: number }>;
    periodicTestScores: Field<{ subject: string; score: number }[]>;
    certifications: Field<{ name: string; grade: string; score?: number }[]>;
  };
  unitMastery: Field<UnitMasteryEntry[]>;
  /** 未回答率(学力不足と処理速度不足の分離用) */
  timeShortageRatio: Field<number>;
}

export interface MaterialEntry {
  subject: string;
  title: string;
  totalUnits: number;
  completedUnits: number;
  laps: number;
}

export interface AvailabilityLayer {
  clubActivity: Field<{
    active: boolean;
    retirementMonth: string | null;
    days: number[];
  }>;
  partTimeJob: Field<{ dayOfWeek: number; startAt: string; endAt: string }[]>;
  commuteMinutesPerDay: Field<number>;
  weekdayHours: Field<number>;
  weekendHours: Field<number>;
  fixedEvents: Field<
    {
      name: string;
      startDate: string;
      endDate: string;
      impact: "block" | "reduce";
    }[]
  >;
  studyLocation: Field<("home" | "school" | "library" | "cram_school")[]>;
}

export interface TraitsLayer {
  pastFailurePattern: Field<string>;
  selfAssessedStrengths: Field<string[]>;
  selfAssessedWeaknesses: Field<string[]>;
  preferredTaskType: Field<"memorization" | "practice" | "no_preference">;
  preferredTone: Field<"strict" | "supportive">;
  reportFrequency: Field<"daily" | "weekly">;
}

export type LearningPhase = "onboarding" | "diagnostic" | "steady";

export interface UserLearningProfile {
  goal: GoalLayer;
  currentLevel: CurrentLevelLayer;
  materials: Field<MaterialEntry[]>;
  schoolProgress: Field<{ subject: string; coveredUnits: string[] }[]>;
  schoolAssignmentLoad: Field<"heavy" | "normal" | "light" | "none">;
  externalClasses: Field<
    { name: string; dayOfWeek: number; startAt: string; endAt: string }[]
  >;
  availability: AvailabilityLayer;
  traits: TraitsLayer;
  phase: LearningPhase;
  completeness: number;
}
