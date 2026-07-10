import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Milestone 4 placeholder — Milestone 5 turns this into the Baseline Report:
// pending diffs rendered as "score + evidence — confirm or push back".
export default async function ReportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("state_diffs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Raporun hazırlanıyor 🎉</h1>
      <p className="text-neutral-600">
        Onboarding tamamlandı. Değerlendirme sonucunda{" "}
        <strong>{count ?? 0} öneri</strong> oluşturuldu — her biri puan, kanıt
        ve karşı argümanıyla birlikte onayını bekliyor.
      </p>
      <p className="text-neutral-600">
        Baseline Raporu görüntüleme ve onaylama ekranı bir sonraki sürümde
        burada olacak.
      </p>
    </main>
  );
}
