"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DiagnosticExercises } from "@/lib/db/types";

type Phase = "loading" | "case" | "prioritization" | "scoring" | "error";

export default function ExercisesPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [exercises, setExercises] = useState<DiagnosticExercises | null>(null);
  const [caseResponse, setCaseResponse] = useState("");
  const [ranking, setRanking] = useState<number[]>([]);
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      if (data.done) {
        router.push("/rapor");
        return;
      }
      setExercises(data.exercises);
      // Resume at the right exercise.
      setPhase(data.responses?.case ? "prioritization" : "case");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      setPhase("error");
    }
  }

  async function submitCase(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit_case", response: caseResponse }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      setPhase("prioritization");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrioritization(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setPhase("scoring");
    try {
      const res = await fetch("/api/diagnostic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit_prioritization",
          order: ranking,
          justification,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      router.push("/rapor");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      setPhase("prioritization");
      setBusy(false);
    }
  }

  function toggleRank(index: number) {
    setRanking((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  }

  if (phase === "loading") {
    return (
      <Centered>
        <p className="text-neutral-500">Egzersizlerin hazırlanıyor…</p>
      </Centered>
    );
  }

  if (phase === "error") {
    return (
      <Centered>
        <p className="text-red-600">{error}</p>
        <button
          onClick={() => {
            setPhase("loading");
            setError(null);
            void start();
          }}
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white"
        >
          Tekrar dene
        </button>
      </Centered>
    );
  }

  if (phase === "scoring") {
    return (
      <Centered>
        <h1 className="text-2xl font-semibold">Değerlendiriliyor…</h1>
        <p className="max-w-md text-center text-neutral-600">
          Cevapların kanıta dayalı olarak puanlanıyor — her puanın yanında
          gerekçesi ve karşı argümanı olacak. Bu yaklaşık bir dakika sürebilir,
          sayfayı kapatma.
        </p>
      </Centered>
    );
  }

  if (!exercises) return null;

  if (phase === "case") {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6 py-12">
        <p className="text-sm text-neutral-500">Adım 4 / 4 · Egzersiz 1 / 2</p>
        <h1 className="text-2xl font-semibold">{exercises.case.title}</h1>
        <p className="whitespace-pre-line rounded-lg border border-neutral-200 bg-white p-4 text-neutral-800">
          {exercises.case.scenario}
        </p>
        <p className="text-sm text-neutral-500">{exercises.case.guidance}</p>
        <form onSubmit={submitCase} className="flex flex-col gap-4">
          <textarea
            rows={8}
            value={caseResponse}
            onChange={(e) => setCaseResponse(e.target.value)}
            placeholder="Cevabını buraya yaz…"
            className="rounded-lg border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || caseResponse.trim().length < 20}
            className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {busy ? "Kaydediliyor…" : "Gönder ve 2. egzersize geç"}
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </main>
    );
  }

  // prioritization
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-5 px-6 py-12">
      <p className="text-sm text-neutral-500">Adım 4 / 4 · Egzersiz 2 / 2</p>
      <h1 className="text-2xl font-semibold">{exercises.prioritization.title}</h1>
      <p className="whitespace-pre-line rounded-lg border border-neutral-200 bg-white p-4 text-neutral-800">
        {exercises.prioritization.context}
      </p>
      <p className="text-sm text-neutral-500">
        {exercises.prioritization.guidance} Maddelere öncelik sırasına göre
        tıkla (1 = en öncelikli). Yanlış tıkladıysan tekrar tıklayarak çıkar.
      </p>

      <div className="flex flex-col gap-2">
        {exercises.prioritization.items.map((item, i) => {
          const rank = ranking.indexOf(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggleRank(i)}
              className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left ${
                rank >= 0
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white hover:border-neutral-500"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  rank >= 0 ? "bg-white text-neutral-900" : "bg-neutral-100"
                }`}
              >
                {rank >= 0 ? rank + 1 : "·"}
              </span>
              {item}
            </button>
          );
        })}
      </div>

      <form onSubmit={submitPrioritization} className="flex flex-col gap-4">
        <label className="text-sm font-medium text-neutral-700">
          1. sıraya koyduğun maddeyi neden seçtin? (2-3 cümle)
        </label>
        <textarea
          rows={3}
          value={justification}
          onChange={(e) => setJustification(e.target.value)}
          className="rounded-lg border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || ranking.length !== 5 || justification.trim().length < 10}
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          Gönder ve değerlendirmeyi başlat
        </button>
        {ranking.length !== 5 && (
          <p className="text-sm text-neutral-500">
            Devam etmek için 5 maddenin tümünü sırala ({ranking.length}/5).
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6">
      {children}
    </main>
  );
}
