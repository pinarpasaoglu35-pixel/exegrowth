import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { applyResolution } from "@/lib/db/apply-diff";

const bodySchema = z.object({
  resolutions: z
    .array(
      z.object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        note: z.string().trim().max(1000).optional(),
      })
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }

  const results = [];
  for (const r of parsed.data.resolutions) {
    results.push(
      await applyResolution(supabase, user.id, r.id, r.action, r.note)
    );
  }

  // When nothing is left pending, onboarding is truly done.
  const { count } = await supabase
    .from("state_diffs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending");
  if ((count ?? 0) === 0) {
    await supabase
      .from("profiles")
      .update({ onboarding_step: "tamam" })
      .eq("user_id", user.id);
  }

  return NextResponse.json({ results, remaining: count ?? 0 });
}
