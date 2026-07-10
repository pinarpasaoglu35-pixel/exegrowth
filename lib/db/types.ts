// Row types mirroring supabase/migrations/0001_init.sql.
// Keep the two in sync: if a migration changes a column, change it here.

export type CvSource = "parsed" | "manual";
export type OnboardingStep = "cv" | "profil" | "gorusme" | "egzersiz" | "tamam";

export interface Profile {
  user_id: string;
  cv_json: CvJson | null;
  goals: unknown | null;
  priorities: unknown | null;
  cv_source: CvSource | null;
  onboarding_step: OnboardingStep;
  locale: string;
  updated_at: string;
}

// The structured shape the CV parser produces and the user edits/confirms.
export interface CvJson {
  full_name: string;
  headline: string | null;
  summary: string | null;
  experience: {
    title: string;
    company: string;
    start: string | null; // "YYYY-MM"
    end: string | null; // null = current
    highlights: string[];
  }[];
  education: {
    school: string;
    degree: string | null;
    field: string | null;
    year: number | null;
  }[];
  skills_claimed: string[]; // as claimed on the CV — NOT scored yet
  languages: string[];
}

export type SessionKind =
  | "onboarding_interview"
  | "diagnostic"
  | "coaching"
  | "retro";
export type SessionStatus = "active" | "completed" | "abandoned";

export interface Session {
  id: string;
  user_id: string;
  kind: SessionKind;
  kernel_version: string;
  status: SessionStatus;
  metadata: Record<string, unknown>;
  started_at: string;
  completed_at: string | null;
}

// Rubric: 1 Aware, 2 Practitioner, 3 Independent, 4 Advanced, 5 Executive
export type RubricScore = 1 | 2 | 3 | 4 | 5;

export interface Skill {
  id: string;
  user_id: string;
  domain: string;
  category: string;
  name: string;
  score: RubricScore | null;
  provisional: boolean;
  evidence: string | null; // required by DB constraint whenever score is set
  counter_argument: string | null;
  self_rating: RubricScore | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  user_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export type DiffStatus = "pending" | "approved" | "rejected";

export interface StateDiff {
  id: string;
  user_id: string;
  session_id: string | null;
  target_table: string;
  target_id: string | null;
  diff: Record<string, unknown>;
  status: DiffStatus;
  resolved_at: string | null;
  created_at: string;
}

export interface Decision {
  id: string;
  user_id: string;
  session_id: string | null;
  title: string;
  context: unknown | null;
  forecast_text: string | null;
  probability: number | null; // 0..1
  reversibility: "one-way" | "two-way" | null;
  review_date: string | null;
  status: "active" | "matured" | "scored";
  outcome: string | null;
  calibration_note: string | null;
  lesson: string | null;
  created_at: string;
}

export interface Insight {
  id: string;
  user_id: string;
  session_id: string | null;
  kind: string;
  content: string;
  created_at: string;
}
