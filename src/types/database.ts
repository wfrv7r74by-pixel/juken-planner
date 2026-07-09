// Supabase スキーマの型定義(supabase/migrations/0001_init.sql に対応)

export type MilestoneKind = "exam" | "mock" | "application" | "other";
export type Phase = "basic" | "advance" | "final";
export type TaskStatus = "pending" | "done";
export type LogSource = "manual" | "task";

/** 曜日(0=日〜6=土)ごとの学習可能分数 */
export type WeekdayMinutes = Record<string, number>;

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
}

export type PlanSettings = {
  user_id: string;
  weekday_minutes: WeekdayMinutes;
  basic_ratio: number;
  advance_ratio: number;
  updated_at: string;
}

export type Milestone = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  kind: MilestoneKind;
  is_target: boolean;
  memo: string | null;
  created_at: string;
}

export type Subject = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export type Material = {
  id: string;
  user_id: string;
  subject_id: string;
  title: string;
  total_units: number;
  unit_label: string;
  minutes_per_unit: number;
  phase: Phase;
  priority: number;
  created_at: string;
}

export type StudyTask = {
  id: string;
  user_id: string;
  material_id: string;
  date: string;
  planned_units: number;
  unit_start: number;
  unit_end: number;
  status: TaskStatus;
  completed_at: string | null;
  created_at: string;
}

export type StudyLog = {
  id: string;
  user_id: string;
  subject_id: string | null;
  task_id: string | null;
  date: string;
  minutes: number;
  memo: string | null;
  source: LogSource;
  created_at: string;
}

/** supabase-js の createClient に渡す Database 型 */
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & Pick<Profile, "id">;
        Update: Partial<Profile>;
        Relationships: [];
      };
      plan_settings: {
        Row: PlanSettings;
        Insert: Partial<PlanSettings> & Pick<PlanSettings, "user_id">;
        Update: Partial<PlanSettings>;
        Relationships: [];
      };
      milestones: {
        Row: Milestone;
        Insert: Partial<Milestone> &
          Pick<Milestone, "user_id" | "title" | "date">;
        Update: Partial<Milestone>;
        Relationships: [];
      };
      subjects: {
        Row: Subject;
        Insert: Partial<Subject> & Pick<Subject, "user_id" | "name">;
        Update: Partial<Subject>;
        Relationships: [];
      };
      materials: {
        Row: Material;
        Insert: Partial<Material> &
          Pick<Material, "user_id" | "subject_id" | "title" | "total_units">;
        Update: Partial<Material>;
        Relationships: [];
      };
      study_tasks: {
        Row: StudyTask;
        Insert: Partial<StudyTask> &
          Pick<
            StudyTask,
            | "user_id"
            | "material_id"
            | "date"
            | "planned_units"
            | "unit_start"
            | "unit_end"
          >;
        Update: Partial<StudyTask>;
        Relationships: [];
      };
      study_logs: {
        Row: StudyLog;
        Insert: Partial<StudyLog> &
          Pick<StudyLog, "user_id" | "date" | "minutes">;
        Update: Partial<StudyLog>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
