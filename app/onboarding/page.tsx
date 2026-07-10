import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Onboarding is resumable: this page reads the persisted step and routes
// there, so a user who left mid-flow continues where they stopped.
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("onboarding_step")
    .eq("user_id", user.id)
    .single();

  const step = profile?.onboarding_step ?? "cv";
  if (step === "cv" || step === "profil") redirect("/onboarding/cv");

  // Steps beyond this point arrive with Milestone 4 (interview + exercises).
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <p className="text-sm text-neutral-500">Adım 3 / 4 · Görüşme</p>
      <h1 className="text-2xl font-semibold">Profilin kaydedildi ✓</h1>
      <p className="text-neutral-600">
        Sıradaki adım: yapay zekâ koçunla kısa bir tanışma görüşmesi ve iki mini
        egzersiz. Bu bölüm bir sonraki sürümde açılacak.
      </p>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="mt-4 self-start rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
        >
          Çıkış yap
        </button>
      </form>
    </main>
  );
}
