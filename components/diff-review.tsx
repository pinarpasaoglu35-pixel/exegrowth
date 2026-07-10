"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ProfileDiffPayload,
  RubricScore,
  SkillDiffPayload,
} from "@/lib/db/types";
import { RUBRIC_LABELS } from "@/lib/rubric";

interface SkillDiffItem {
  id: string;
  diff: SkillDiffPayload;
}
interface ProfileDiffItem {
  id: string;
  diff: ProfileDiffPayload;
}

type Decision = { action: "approve" | "reject"; note: string };

export function ScoreDots({ score }: { score: RubricScore }) {
  return (
    <span className="flex items-center gap-1" aria-label={`Puan ${score}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full ${
            i <= score ? "bg-neutral-900" : "bg-neutral-200"
          }`}
        />
      ))}
    </span>
  );
}

export default function DiffReview({
  skillDiffs,
  profileDiff,
}: {
  skillDiffs: SkillDiffItem[];
  profileDiff: ProfileDiffItem | null;
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const total = skillDiffs.length + (profileDiff ? 1 : 0);
  const decided = Object.keys(decisions).length;

  function decide(id: string, action: "approve" | "reject") {
    setDecisions((prev) => {
      // Clicking the same action again un-decides (toggle).
      if (prev[id]?.action === action) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { action, note: prev[id]?.note ?? "" } };
    });
  }

  function setNote(id: string, note: string) {
    setDecisions((prev) =>
      prev[id] ? { ...prev, [id]: { ...prev[id], note } } : prev
    );
  }

  function approveRest() {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const d of skillDiffs) {
        if (!next[d.id]) next[d.id] = { action: "approve", note: "" };
      }
      if (profileDiff && !next[profileDiff.id]) {
        next[profileDiff.id] = { action: "approve", note: "" };
      }
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const resolutions = Object.entries(decisions).map(([id, d]) => ({
        id,
        action: d.action,
        note: d.note.trim() || undefined,
      }));
      const res = await fetch("/api/diffs/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolutions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      // Server page re-renders: remaining pending diffs or the final report.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      setBusy(false);
    }
  }

  const grouped = skillDiffs.reduce<Record<string, SkillDiffItem[]>>(
    (acc, d) => {
      (acc[d.diff.domain] ??= []).push(d);
      return acc;
    },
    {}
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12 pb-32">
      <div>
        <h1 className="text-2xl font-semibold">Baseline değerlendirmen hazır</h1>
        <p className="mt-2 text-neutral-600">
          İşte puanların ve arkasındaki kanıt. Katılıyorsan onayla, katılmıyorsan
          itiraz et — son söz senin. Onaylamadığın hiçbir şey kaydedilmez;
          itirazın not olarak saklanır ve bir sonraki değerlendirmede dikkate
          alınır (şu an yeniden puanlama yapılmaz).
        </p>
      </div>

      {Object.entries(grouped).map(([domain, diffs]) => (
        <section key={domain} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{domain}</h2>
          {diffs.map(({ id, diff }) => {
            const decision = decisions[id];
            const rubric = RUBRIC_LABELS[diff.score];
            return (
              <div
                key={id}
                className={`rounded-xl border bg-white p-5 ${
                  decision?.action === "approve"
                    ? "border-green-400"
                    : decision?.action === "reject"
                      ? "border-red-400"
                      : "border-neutral-200"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{diff.name}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                      {diff.category}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                      geçici
                    </span>
                  </div>
                  <ScoreDots score={diff.score} />
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  {diff.score} — {rubric.name}: {rubric.tr}
                </p>

                <div className="mt-4 flex flex-col gap-3 text-sm">
                  <div>
                    <p className="font-medium text-neutral-800">Kanıt</p>
                    <p className="text-neutral-600">{diff.evidence}</p>
                  </div>
                  <div>
                    <p className="font-medium text-neutral-800">Karşı argüman</p>
                    <p className="text-neutral-600">{diff.counter_argument}</p>
                  </div>
                  {diff.justification_4plus && (
                    <div>
                      <p className="font-medium text-neutral-800">4+ gerekçesi</p>
                      <p className="text-neutral-600">{diff.justification_4plus}</p>
                    </div>
                  )}
                </div>

                <DecisionButtons
                  decision={decision}
                  onDecide={(a) => decide(id, a)}
                  onNote={(n) => setNote(id, n)}
                />
              </div>
            );
          })}
        </section>
      ))}

      {profileDiff && (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Hedefler ve öncelikler</h2>
          <div
            className={`rounded-xl border bg-white p-5 ${
              decisions[profileDiff.id]?.action === "approve"
                ? "border-green-400"
                : decisions[profileDiff.id]?.action === "reject"
                  ? "border-red-400"
                  : "border-neutral-200"
            }`}
          >
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="font-medium text-neutral-800">Hedef özetin</p>
                <p className="text-neutral-600">{profileDiff.diff.goals}</p>
              </div>
              <div>
                <p className="font-medium text-neutral-800">
                  İlk 3 gelişim önceliği
                </p>
                <ol className="mt-1 flex flex-col gap-2">
                  {profileDiff.diff.priorities.map((p, i) => (
                    <li key={i} className="rounded-lg bg-neutral-50 p-3">
                      <p className="font-medium">
                        {i + 1}. {p.skill_name}
                      </p>
                      <p className="text-neutral-600">{p.why}</p>
                      <p className="mt-1 text-neutral-600">
                        <span className="font-medium">İlk adım:</span>{" "}
                        {p.first_step}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <DecisionButtons
              decision={decisions[profileDiff.id]}
              onDecide={(a) => decide(profileDiff.id, a)}
              onNote={(n) => setNote(profileDiff.id, n)}
            />
          </div>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-neutral-200 bg-white/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4">
          <p className="text-sm text-neutral-600">
            {total} öneriden {decided}&apos;i yanıtlandı
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={approveRest}
              disabled={busy || decided === total}
              className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50"
            >
              Kalanların tümünü onayla
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || decided === 0}
              className="rounded-lg bg-neutral-900 px-5 py-2 text-sm text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              {busy ? "Kaydediliyor…" : "Kararları kaydet"}
            </button>
          </div>
        </div>
        {error && (
          <p className="mx-auto mt-2 max-w-2xl text-sm text-red-600">{error}</p>
        )}
      </div>
    </main>
  );
}

function DecisionButtons({
  decision,
  onDecide,
  onNote,
}: {
  decision: Decision | undefined;
  onDecide: (action: "approve" | "reject") => void;
  onNote: (note: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onDecide("approve")}
          className={`rounded-lg px-4 py-2 text-sm ${
            decision?.action === "approve"
              ? "bg-green-600 text-white"
              : "border border-neutral-300 hover:bg-neutral-100"
          }`}
        >
          Onayla
        </button>
        <button
          type="button"
          onClick={() => onDecide("reject")}
          className={`rounded-lg px-4 py-2 text-sm ${
            decision?.action === "reject"
              ? "bg-red-600 text-white"
              : "border border-neutral-300 hover:bg-neutral-100"
          }`}
        >
          İtiraz et
        </button>
      </div>
      {decision?.action === "reject" && (
        <input
          type="text"
          value={decision.note}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Neden katılmıyorsun? (isteğe bağlı)"
          className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-900 focus:outline-none"
        />
      )}
    </div>
  );
}
