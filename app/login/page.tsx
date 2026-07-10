"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "idle" | "sending" | "sent" | "error";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="mb-2 text-2xl font-semibold">EGOS&apos;a giriş</h1>
      <p className="mb-8 text-neutral-600">
        E-posta adresini yaz; sana tek tıkla giriş bağlantısı gönderelim.
        Şifreye gerek yok.
      </p>

      {status === "sent" ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
          Giriş bağlantısı <strong>{email}</strong> adresine gönderildi.
          Gelen kutunu (ve spam klasörünü) kontrol et.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label htmlFor="email" className="text-sm font-medium">
            E-posta adresi
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ornek@eposta.com"
            className="rounded-lg border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {status === "sending" ? "Gönderiliyor…" : "Giriş bağlantısı gönder"}
          </button>
          {status === "error" && (
            <p className="text-sm text-red-600">
              Bir şeyler ters gitti. Lütfen tekrar dene.
            </p>
          )}
        </form>
      )}
    </main>
  );
}
