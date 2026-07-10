// The 1-5 rubric. Single source for UI labels; the scoring kernel prompt
// (lib/ai/kernel/v1/scoring.ts) states the same definitions to the model.
import type { RubricScore } from "@/lib/db/types";

export const RUBRIC_LABELS: Record<RubricScore, { name: string; tr: string }> = {
  1: { name: "Aware", tr: "Kavramları biliyor; bağımsız uygulama kanıtı yok" },
  2: { name: "Practitioner", tr: "Destek/rehberlikle uygulamış; sınırlı kapsam" },
  3: {
    name: "Independent",
    tr: "Normal koşullarda tek başına güvenilir şekilde teslim eder",
  },
  4: {
    name: "Advanced",
    tr: "Zor ve yeni durumların üstesinden gelir; başkaları görüşüne başvurur",
  },
  5: {
    name: "Executive",
    tr: "Organizasyonların bu işi yapma şeklini şekillendirir",
  },
};
