"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CvJson } from "@/lib/db/types";
import { EMPTY_CV, loadDraft, clearDraft } from "@/lib/cv-draft";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 focus:border-neutral-900 focus:outline-none";
const labelCls = "text-sm font-medium text-neutral-700";

export default function ProfileConfirmPage() {
  const router = useRouter();
  const [cv, setCv] = useState<CvJson | null>(null);
  const [source, setSource] = useState<"parsed" | "manual">("manual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Draft comes from sessionStorage (set by the upload step); if the user
  // landed here directly, start with an empty manual-entry form.
  useEffect(() => {
    const draft = loadDraft();
    if (draft) {
      setCv(draft.cv);
      setSource(draft.source);
    } else {
      setCv(EMPTY_CV);
      setSource("manual");
    }
  }, []);

  if (!cv) return null;

  function update(patch: Partial<CvJson>) {
    setCv((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!cv?.full_name.trim()) {
      setError("İsim alanı boş olamaz.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cv, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");
      clearDraft();
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <div>
        <p className="text-sm text-neutral-500">Adım 2 / 4 · Profil</p>
        <h1 className="mt-1 text-2xl font-semibold">
          {source === "parsed" ? "Profilini kontrol et" : "Profilini oluştur"}
        </h1>
        <p className="mt-2 text-neutral-600">
          {source === "parsed"
            ? "CV'nden çıkardıklarımız aşağıda. Yanlış veya eksik olanları düzelt, sonra onayla — yalnızca onayladığın hâli kaydedilir."
            : "Bilgilerini gir. Her şeyi doldurmak zorunda değilsin; önemli olan deneyim ve yetkinlik iddiaların."}
        </p>
      </div>

      <form onSubmit={handleConfirm} className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Ad Soyad *</label>
          <input
            className={inputCls}
            value={cv.full_name}
            onChange={(e) => update({ full_name: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Ünvan / başlık</label>
          <input
            className={inputCls}
            value={cv.headline ?? ""}
            placeholder="ör. Kıdemli Ürün Yöneticisi"
            onChange={(e) => update({ headline: e.target.value || null })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Özet</label>
          <textarea
            className={inputCls}
            rows={3}
            value={cv.summary ?? ""}
            onChange={(e) => update({ summary: e.target.value || null })}
          />
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-base font-semibold">Deneyim</legend>
          {cv.experience.map((exp, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={inputCls}
                  placeholder="Pozisyon"
                  value={exp.title}
                  onChange={(e) => {
                    const experience = [...cv.experience];
                    experience[i] = { ...exp, title: e.target.value };
                    update({ experience });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Şirket"
                  value={exp.company}
                  onChange={(e) => {
                    const experience = [...cv.experience];
                    experience[i] = { ...exp, company: e.target.value };
                    update({ experience });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Başlangıç (2021-03)"
                  value={exp.start ?? ""}
                  onChange={(e) => {
                    const experience = [...cv.experience];
                    experience[i] = { ...exp, start: e.target.value || null };
                    update({ experience });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Bitiş (boş = devam ediyor)"
                  value={exp.end ?? ""}
                  onChange={(e) => {
                    const experience = [...cv.experience];
                    experience[i] = { ...exp, end: e.target.value || null };
                    update({ experience });
                  }}
                />
              </div>
              <textarea
                className={`${inputCls} mt-3`}
                rows={2}
                placeholder="Öne çıkanlar (her satıra bir madde)"
                value={exp.highlights.join("\n")}
                onChange={(e) => {
                  const experience = [...cv.experience];
                  experience[i] = {
                    ...exp,
                    highlights: e.target.value
                      .split("\n")
                      .filter((l) => l.trim() !== ""),
                  };
                  update({ experience });
                }}
              />
              <button
                type="button"
                className="mt-2 text-sm text-red-600 underline"
                onClick={() =>
                  update({
                    experience: cv.experience.filter((_, j) => j !== i),
                  })
                }
              >
                Bu deneyimi sil
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start text-sm underline"
            onClick={() =>
              update({
                experience: [
                  ...cv.experience,
                  { title: "", company: "", start: null, end: null, highlights: [] },
                ],
              })
            }
          >
            + Deneyim ekle
          </button>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="text-base font-semibold">Eğitim</legend>
          {cv.education.map((edu, i) => (
            <div key={i} className="rounded-lg border border-neutral-200 p-4">
              <div className="grid grid-cols-2 gap-3">
                <input
                  className={inputCls}
                  placeholder="Okul"
                  value={edu.school}
                  onChange={(e) => {
                    const education = [...cv.education];
                    education[i] = { ...edu, school: e.target.value };
                    update({ education });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Derece (Lisans, YL…)"
                  value={edu.degree ?? ""}
                  onChange={(e) => {
                    const education = [...cv.education];
                    education[i] = { ...edu, degree: e.target.value || null };
                    update({ education });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Bölüm"
                  value={edu.field ?? ""}
                  onChange={(e) => {
                    const education = [...cv.education];
                    education[i] = { ...edu, field: e.target.value || null };
                    update({ education });
                  }}
                />
                <input
                  className={inputCls}
                  placeholder="Mezuniyet yılı"
                  inputMode="numeric"
                  value={edu.year ?? ""}
                  onChange={(e) => {
                    const education = [...cv.education];
                    const n = parseInt(e.target.value, 10);
                    education[i] = { ...edu, year: Number.isNaN(n) ? null : n };
                    update({ education });
                  }}
                />
              </div>
              <button
                type="button"
                className="mt-2 text-sm text-red-600 underline"
                onClick={() =>
                  update({ education: cv.education.filter((_, j) => j !== i) })
                }
              >
                Bu eğitimi sil
              </button>
            </div>
          ))}
          <button
            type="button"
            className="self-start text-sm underline"
            onClick={() =>
              update({
                education: [
                  ...cv.education,
                  { school: "", degree: null, field: null, year: null },
                ],
              })
            }
          >
            + Eğitim ekle
          </button>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>
            Yetkinlik iddiaların (virgülle ayır) — bunlar henüz puanlanmadı,
            görüşmede kanıta dayalı değerlendirilecek
          </label>
          <input
            className={inputCls}
            value={cv.skills_claimed.join(", ")}
            placeholder="ör. Ürün stratejisi, SQL, Ekip liderliği"
            onChange={(e) =>
              update({
                skills_claimed: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Diller (virgülle ayır)</label>
          <input
            className={inputCls}
            value={cv.languages.join(", ")}
            placeholder="ör. Türkçe, İngilizce"
            onChange={(e) =>
              update({
                languages: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
        >
          {busy ? "Kaydediliyor…" : "Onayla ve devam et"}
        </button>
      </form>
    </main>
  );
}
