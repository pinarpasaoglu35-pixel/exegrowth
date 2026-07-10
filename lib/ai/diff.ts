// Diff extractor/stager: validated AI proposals become PENDING state_diffs
// rows. Nothing here writes to skills or profiles — that happens only when
// the user approves a diff (Milestone 5, /rapor).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoringOutput } from "./schemas";

export async function stageScoringDiffs(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  scoring: ScoringOutput
) {
  const skillDiffs = scoring.skills.map((skill) => ({
    user_id: userId,
    session_id: sessionId,
    target_table: "skills",
    diff: {
      domain: skill.domain,
      category: skill.category,
      name: skill.name,
      score: skill.score,
      evidence: skill.evidence,
      counter_argument: skill.counter_argument,
      justification_4plus: skill.justification_4plus,
      provisional: true,
    },
    status: "pending",
  }));

  const profileDiff = {
    user_id: userId,
    session_id: sessionId,
    target_table: "profiles",
    diff: {
      goals: scoring.goals_summary,
      priorities: scoring.priorities.slice(0, 3),
    },
    status: "pending",
  };

  const { error } = await supabase
    .from("state_diffs")
    .insert([...skillDiffs, profileDiff]);
  if (error) throw error;
}
