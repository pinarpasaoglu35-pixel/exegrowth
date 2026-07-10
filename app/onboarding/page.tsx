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
  if (step === "gorusme") redirect("/onboarding/gorusme");
  if (step === "egzersiz") redirect("/onboarding/egzersiz");
  redirect("/rapor");
}
