"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CvJson } from "@/lib/db/types";
import { EMPTY_CV, saveDraft } from "@/lib/cv-draft";

export default function CvUploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function goToProfile(cv: CvJson, source: "parsed" | "manual") {
    saveDraft(cv, source);
    router.push("/onboarding/profil");
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/cv/parse", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      goToProfile(data.cv as CvJson, "parsed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-sm text-neutral-500">Adım 1 / 4 · CV</p>
        <h1 className="mt-1 text-2xl font-semibold">CV&apos;ni yükle</h1>
        <p className="mt-2 text-neutral-600">
          PDF formatındaki CV&apos;ni yükle; yapay zekâ onu yapılandırılmış bir
          profile dönüştürsün. Sonraki adımda her alanı gözden geçirip
          düzeltebileceksin.
        </p>
        <p className="mt-2 text-sm text-neutral-500">
          Gizlilik: PDF dosyan hiçbir yerde saklanmaz — yalnızca anlık olarak
          işlenir ve atılır. Kaydedilen tek şey, senin onayladığın profil.
        </p>
      </div>

      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="rounded-lg border border-neutral-300 p-3 file:mr-3 file:rounded file:border-0 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-white"
        />
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "CV okunuyor… (bu 30–60 saniye sürebilir)" : "Yükle ve devam et"}
        </button>
      </form>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={() => goToProfile(EMPTY_CV, "manual")}
        className="text-sm text-neutral-500 underline hover:text-neutral-900"
      >
        CV&apos;m yok / bilgilerimi elle girmek istiyorum
      </button>
    </main>
  );
}
