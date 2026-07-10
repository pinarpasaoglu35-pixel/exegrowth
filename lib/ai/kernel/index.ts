// Kernel prompts are versioned files. KERNEL_VERSION is stamped on every
// sessions row so we always know which prompt produced which output.
export const KERNEL_VERSION = "v1";

export { CV_PARSE_SYSTEM, CV_PARSE_INSTRUCTION } from "./v1/cv-parse";
export {
  INTERVIEW_SYSTEM,
  INTERVIEW_OPENER_INSTRUCTION,
  INTERVIEW_TURN_INSTRUCTION,
} from "./v1/interview";
export {
  DIAGNOSTIC_GENERATE_SYSTEM,
  DIAGNOSTIC_GENERATE_INSTRUCTION,
} from "./v1/diagnostic";
export { SCORING_SYSTEM, SCORING_INSTRUCTION } from "./v1/scoring";
