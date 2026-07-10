import { z } from "zod";

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
