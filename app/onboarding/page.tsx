import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already guards this route; this is defense in depth.
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Hoş geldin 👋</h1>
      <p className="text-neutral-600">
        Giriş başarılı: <strong>{user.email}</strong>
      </p>
      <p className="text-neutral-600">
        Onboarding akışı (CV yükleme, görüşme ve tanı egzersizleri) bir sonraki
        adımda burada olacak.
      </p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
        >
          Çıkış yap
        </button>
      </form>
    </main>
  );
}
