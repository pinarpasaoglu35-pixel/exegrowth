// State compiler: turns structured DB state into labeled prompt blocks.
// This — not raw chat transcripts — is what the AI sees. Transcripts are
// archived in `messages` for audit/UI only.

import type {
  DiagnosticExercises,
  DiagnosticResponses,
  InterviewState,
  PendingQuestion,
  Profile,
} from "@/lib/db/types";

export function compileProfileBlock(profile: Pick<Profile, "cv_json" | "goals">) {
  return [
    "<user_profile>",
    JSON.stringify(
      { cv: profile.cv_json, stated_goals: profile.goals ?? null },
      null,
      2
    ),
    "</user_profile>",
  ].join("\n");
}

export function compileInterviewBlock(state: InterviewState) {
  return [
    "<interview_state>",
    JSON.stringify(
      {
        answered_count: state.questions_asked.length,
        questions_asked: state.questions_asked,
      },
      null,
      2
    ),
    "</interview_state>",
  ].join("\n");
}

export function compileTurnBlock(pending: PendingQuestion, answer: string) {
  return [
    "<pending_question>",
    JSON.stringify(pending, null, 2),
    "</pending_question>",
    "<user_answer>",
    answer,
    "</user_answer>",
  ].join("\n");
}

export function compileExercisesBlock(
  exercises: DiagnosticExercises,
  responses: DiagnosticResponses
) {
  const prioritization = responses.prioritization
    ? {
        ranked_items: responses.prioritization.order.map(
          (idx, rank) =>
            `#${rank + 1}: ${exercises.prioritization.items[idx] ?? "?"}`
        ),
        justification: responses.prioritization.justification,
      }
    : null;

  return [
    "<diagnostic_exercises>",
    JSON.stringify(
      {
        case: { exercise: exercises.case, user_response: responses.case ?? null },
        prioritization: {
          exercise: exercises.prioritization,
          user_response: prioritization,
        },
      },
      null,
      2
    ),
    "</diagnostic_exercises>",
  ].join("\n");
}
