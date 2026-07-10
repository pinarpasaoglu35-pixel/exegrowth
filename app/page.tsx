import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">EGOS</h1>
      <p className="text-lg text-neutral-600">
        ChatGPT sana cevap verir; EGOS seni takip eder.
        <br />
        Kanıta dayalı yetkinlik haritan ve kişisel gelişim planınla kariyerini
        sistemli büyüt.
      </p>
      {user ? (
        <Link
          href="/onboarding"
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700"
        >
          Devam et
        </Link>
      ) : (
        <Link
          href="/login"
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700"
        >
          Başla
        </Link>
      )}
    </main>
  );
}
