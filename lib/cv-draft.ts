import type { CvJson } from "@/lib/db/types";

// The parsed-but-unconfirmed CV lives only in sessionStorage (browser tab
// memory) between the upload step and the confirm step — never on the server.

const CV_DRAFT_KEY = "egos.cv_draft";
const CV_SOURCE_KEY = "egos.cv_source";

export const EMPTY_CV: CvJson = {
  full_name: "",
  headline: null,
  summary: null,
  experience: [],
  education: [],
  skills_claimed: [],
  languages: [],
};

export function saveDraft(cv: CvJson, source: "parsed" | "manual") {
  sessionStorage.setItem(CV_DRAFT_KEY, JSON.stringify(cv));
  sessionStorage.setItem(CV_SOURCE_KEY, source);
}

export function loadDraft(): { cv: CvJson; source: "parsed" | "manual" } | null {
  const raw = sessionStorage.getItem(CV_DRAFT_KEY);
  if (!raw) return null;
  try {
    const source =
      sessionStorage.getItem(CV_SOURCE_KEY) === "manual" ? "manual" : "parsed";
    return { cv: JSON.parse(raw) as CvJson, source };
  } catch {
    return null;
  }
}

export function clearDraft() {
  sessionStorage.removeItem(CV_DRAFT_KEY);
  sessionStorage.removeItem(CV_SOURCE_KEY);
}
