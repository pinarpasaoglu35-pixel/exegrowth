import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { cvJsonSchema } from "@/lib/ai/schemas";

const bodySchema = z.object({
  cv: cvJsonSchema,
  source: z.enum(["parsed", "manual"]),
});

// Persists the user-confirmed profile. This is the ONLY place cv_json is
// written in the CV flow — nothing is stored before the user hits confirm.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Profil verisi geçersiz." },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      cv_json: parsed.data.cv,
      cv_source: parsed.data.source,
      onboarding_step: "gorusme",
    })
    .eq("user_id", user.id);

  if (error) {
    console.error("Profile update failed:", error);
    return NextResponse.json(
      { error: "Profil kaydedilemedi. Lütfen tekrar dene." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
