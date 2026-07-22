// Supabase スキーマの型定義(supabase/migrations/ に対応)
// 注意: Row 型は interface ではなく type で定義する(supabase-js の型制約)

export type MilestoneKind = "exam" | "mock" | "application" | "other";
export type Phase = "basic" | "advance" | "final";
export type LogSource = "manual" | "task";
export type BlockCategory = "study" | "life";
export type SectionStatus = "todo" | "doing" | "done";
export type ChatRole = "user" | "assistant";

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type Milestone = {
  id: string;
  user_id: string;
  title: string;
  date: string;
  kind: MilestoneKind;
  is_target: boolean;
  memo: string | null;
  created_at: string;
};

export type StudyPhase = {
  id: string;
  user_id: string;
  name: string;
  start_date: string;
  end_date: string;
  color: string;
  memo: string | null;
  sort_order: number;
  created_at: string;
};

export type RoutineBlock = {
  id: string;
  user_id: string;
  weekday: number;
  /** HH:MM:SS */
  start_time: string;
  end_time: string;
  title: string;
  category: BlockCategory;
  subject_id: string | null;
  effective_from: string | null;
  effective_until: string | null;
  created_at: string;
};

export type Subject = {
  id: string;
  user_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
};

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
  /** 目標適合度(AI 評価, 1〜5) */
  fit_score: number | null;
  fit_comment: string | null;
  created_at: string;
};

export type MaterialSection = {
  id: string;
  user_id: string;
  material_id: string;
  title: string;
  sort_order: number;
  status: SectionStatus;
  memo: string | null;
  created_at: string;
};

export type DailyNote = {
  id: string;
  user_id: string;
  date: string;
  mood: number | null;
  good: string | null;
  issue: string | null;
  memo: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  user_id: string;
  role: ChatRole;
  content: string;
  metadata: ChatMetadata | null;
  created_at: string;
};

/** AI の提案(chat_messages.metadata に保存) */
export type ChatMetadata = {
  proposals?: Proposal[];
};

export type Proposal =
  | { type: "propose_phases"; data: PhasesProposal; applied?: boolean }
  | { type: "propose_routine"; data: RoutineProposal; applied?: boolean }
  | { type: "propose_material"; data: MaterialProposal; applied?: boolean }
  | { type: "propose_milestones"; data: MilestonesProposal; applied?: boolean };

export type PhasesProposal = {
  phases: { name: string; start_date: string; end_date: string; memo?: string }[];
  replace: boolean;
};

export type RoutineProposal = {
  weekdays: number[];
  blocks: {
    start_time: string;
    end_time: string;
    title: string;
    category: BlockCategory;
    subject?: string;
  }[];
  replace: boolean;
};

export type MaterialProposal = {
  subject: string;
  title: string;
  sections: string[];
  fit_score?: number;
  fit_comment?: string;
};

export type MilestonesProposal = {
  milestones: {
    title: string;
    date: string;
    kind: MilestoneKind;
    is_target?: boolean;
  }[];
};

export type StudyLog = {
  id: string;
  user_id: string;
  subject_id: string | null;
  date: string;
  minutes: number;
  memo: string | null;
  source: LogSource;
  created_at: string;
};

export type GradingRecord = {
  id: string;
  user_id: string;
  subject: string;
  question: string;
  answer: string;
  score: number;
  result: import("@/lib/grading/types").GradingResult;
  created_at: string;
};

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
      milestones: {
        Row: Milestone;
        Insert: Partial<Milestone> &
          Pick<Milestone, "user_id" | "title" | "date">;
        Update: Partial<Milestone>;
        Relationships: [];
      };
      phases: {
        Row: StudyPhase;
        Insert: Partial<StudyPhase> &
          Pick<StudyPhase, "user_id" | "name" | "start_date" | "end_date">;
        Update: Partial<StudyPhase>;
        Relationships: [];
      };
      routine_blocks: {
        Row: RoutineBlock;
        Insert: Partial<RoutineBlock> &
          Pick<
            RoutineBlock,
            "user_id" | "weekday" | "start_time" | "end_time" | "title"
          >;
        Update: Partial<RoutineBlock>;
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
          Pick<Material, "user_id" | "subject_id" | "title">;
        Update: Partial<Material>;
        Relationships: [];
      };
      material_sections: {
        Row: MaterialSection;
        Insert: Partial<MaterialSection> &
          Pick<MaterialSection, "user_id" | "material_id" | "title">;
        Update: Partial<MaterialSection>;
        Relationships: [];
      };
      daily_notes: {
        Row: DailyNote;
        Insert: Partial<DailyNote> & Pick<DailyNote, "user_id" | "date">;
        Update: Partial<DailyNote>;
        Relationships: [];
      };
      chat_messages: {
        Row: ChatMessage;
        Insert: Partial<ChatMessage> &
          Pick<ChatMessage, "user_id" | "role" | "content">;
        Update: Partial<ChatMessage>;
        Relationships: [];
      };
      study_logs: {
        Row: StudyLog;
        Insert: Partial<StudyLog> &
          Pick<StudyLog, "user_id" | "date" | "minutes">;
        Update: Partial<StudyLog>;
        Relationships: [];
      };
      grading_results: {
        Row: GradingRecord;
        Insert: Partial<GradingRecord> &
          Pick<
            GradingRecord,
            "user_id" | "subject" | "question" | "answer" | "score" | "result"
          >;
        Update: Partial<GradingRecord>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
