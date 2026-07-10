import { z } from "zod";

// ════════════════════════════════════════════════════════════════════
// Interview turns
// ════════════════════════════════════════════════════════════════════

export const interviewOpenerSchema = z.object({
  question: z.string(),
  topic: z.string(),
});

export const INTERVIEW_OPENER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    question: { type: "string" },
    topic: { type: "string" },
  },
  required: ["question", "topic"],
  additionalProperties: false,
};

export const interviewTurnSchema = z.object({
  capture: z.object({
    topic: z.string(),
    answer_summary: z.string(),
    signals: z.array(z.string()),
  }),
  action: z.enum(["ask", "complete"]),
  question: z.string().nullable(),
  topic: z.string().nullable(),
  closing: z.string().nullable(),
});

export const INTERVIEW_TURN_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    capture: {
      type: "object",
      properties: {
        topic: { type: "string" },
        answer_summary: { type: "string" },
        signals: { type: "array", items: { type: "string" } },
      },
      required: ["topic", "answer_summary", "signals"],
      additionalProperties: false,
    },
    action: { type: "string", enum: ["ask", "complete"] },
    question: { type: ["string", "null"] },
    topic: { type: ["string", "null"] },
    closing: { type: ["string", "null"] },
  },
  required: ["capture", "action", "question", "topic", "closing"],
  additionalProperties: false,
};

// ════════════════════════════════════════════════════════════════════
// Diagnostic exercise generation
// ════════════════════════════════════════════════════════════════════

export const diagnosticExercisesSchema = z.object({
  case: z.object({
    title: z.string(),
    scenario: z.string(),
    guidance: z.string(),
  }),
  prioritization: z.object({
    title: z.string(),
    context: z.string(),
    items: z.array(z.string()).length(5),
    guidance: z.string(),
  }),
});

export const DIAGNOSTIC_EXERCISES_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    case: {
      type: "object",
      properties: {
        title: { type: "string" },
        scenario: { type: "string" },
        guidance: { type: "string" },
      },
      required: ["title", "scenario", "guidance"],
      additionalProperties: false,
    },
    prioritization: {
      type: "object",
      properties: {
        title: { type: "string" },
        context: { type: "string" },
        items: { type: "array", items: { type: "string" } },
        guidance: { type: "string" },
      },
      required: ["title", "context", "items", "guidance"],
      additionalProperties: false,
    },
  },
  required: ["case", "prioritization"],
  additionalProperties: false,
};

// ════════════════════════════════════════════════════════════════════
// Baseline scoring — the anti-sycophancy contract, enforced in code:
// evidence + counter-argument always; 4+ needs explicit justification.
// ════════════════════════════════════════════════════════════════════

export const scoredSkillSchema = z
  .object({
    domain: z.string().min(1),
    category: z.enum([
      "uzmanlık",
      "karar-verme",
      "iletişim",
      "liderlik",
      "öğrenme",
    ]),
    name: z.string().min(1),
    score: z.number().int().min(1).max(5),
    evidence: z.string().min(10),
    counter_argument: z.string().min(10),
    justification_4plus: z.string().nullable(),
  })
  .refine(
    (s) => s.score < 4 || (s.justification_4plus?.trim().length ?? 0) >= 10,
    { message: "Score of 4+ requires explicit justification" }
  );

export const scoringOutputSchema = z.object({
  skills: z.array(scoredSkillSchema).min(4).max(12),
  goals_summary: z.string().min(1),
  priorities: z
    .array(
      z.object({
        skill_name: z.string(),
        why: z.string().min(10),
        first_step: z.string().min(10),
      })
    )
    .min(1),
});

export type ScoringOutput = z.infer<typeof scoringOutputSchema>;

export const SCORING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          domain: { type: "string" },
          category: {
            type: "string",
            enum: ["uzmanlık", "karar-verme", "iletişim", "liderlik", "öğrenme"],
          },
          name: { type: "string" },
          score: { type: "integer", enum: [1, 2, 3, 4, 5] },
          evidence: { type: "string" },
          counter_argument: { type: "string" },
          justification_4plus: { type: ["string", "null"] },
        },
        required: [
          "domain",
          "category",
          "name",
          "score",
          "evidence",
          "counter_argument",
          "justification_4plus",
        ],
        additionalProperties: false,
      },
    },
    goals_summary: { type: "string" },
    priorities: {
      type: "array",
      items: {
        type: "object",
        properties: {
          skill_name: { type: "string" },
          why: { type: "string" },
          first_step: { type: "string" },
        },
        required: ["skill_name", "why", "first_step"],
        additionalProperties: false,
      },
    },
  },
  required: ["skills", "goals_summary", "priorities"],
  additionalProperties: false,
};

// Zod schema: validates AI output server-side before anything is trusted.
export const cvJsonSchema = z.object({
  full_name: z.string(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  experience: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      start: z.string().nullable(),
      end: z.string().nullable(),
      highlights: z.array(z.string()),
    })
  ),
  education: z.array(
    z.object({
      school: z.string(),
      degree: z.string().nullable(),
      field: z.string().nullable(),
      year: z.number().nullable(),
    })
  ),
  skills_claimed: z.array(z.string()),
  languages: z.array(z.string()),
});

// JSON Schema handed to the provider as a structured-output constraint, so
// the model is guaranteed to return parseable JSON in exactly this shape.
// Kept in sync with cvJsonSchema above (and lib/db/types.ts CvJson).
export const CV_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    full_name: { type: "string" },
    headline: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    experience: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          start: { type: ["string", "null"] },
          end: { type: ["string", "null"] },
          highlights: { type: "array", items: { type: "string" } },
        },
        required: ["title", "company", "start", "end", "highlights"],
        additionalProperties: false,
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" },
          degree: { type: ["string", "null"] },
          field: { type: ["string", "null"] },
          year: { type: ["number", "null"] },
        },
        required: ["school", "degree", "field", "year"],
        additionalProperties: false,
      },
    },
    skills_claimed: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
  },
  required: [
    "full_name",
    "headline",
    "summary",
    "experience",
    "education",
    "skills_claimed",
    "languages",
  ],
  additionalProperties: false,
};
