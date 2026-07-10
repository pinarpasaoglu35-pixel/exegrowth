// Applies a user's decision on one pending state_diff. The human has the
// last word: approval is the ONLY path that writes to skills/profiles.
// Ordering matters — the diff is marked approved only AFTER the target
// writes succeed, so a mid-way failure leaves it safely pending.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileDiffPayload, SkillDiffPayload } from "./types";

export type ResolveAction = "approve" | "reject";

export async function applyResolution(
  supabase: SupabaseClient,
  userId: string,
  diffId: string,
  action: ResolveAction,
  note?: string
): Promise<{ id: string; ok: boolean; error?: string }> {
  const { data: diff } = await supabase
    .from("state_diffs")
    .select("id, target_table, session_id, diff, status")
    .eq("id", diffId)
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (!diff) {
    return { id: diffId, ok: false, error: "Öneri bulunamadı veya zaten yanıtlandı." };
  }

  try {
    if (action === "approve") {
      if (diff.target_table === "skills") {
        await approveSkillDiff(supabase, userId, diff.session_id, diff.diff);
      } else if (diff.target_table === "profiles") {
        await approveProfileDiff(supabase, userId, diff.diff);
      } else {
        return { id: diffId, ok: false, error: "Bilinmeyen öneri türü." };
      }
    }

    const { error } = await supabase
      .from("state_diffs")
      .update({
        status: action === "approve" ? "approved" : "rejected",
        user_note: note ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", diffId);
    if (error) throw error;

    return { id: diffId, ok: true };
  } catch (err) {
    console.error(`Diff ${diffId} resolution failed:`, err);
    return { id: diffId, ok: false, error: "Kaydedilemedi." };
  }
}

async function approveSkillDiff(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string | null,
  payload: unknown
) {
  const skill = payload as SkillDiffPayload;

  // A 4+ justification lives on in the evidence text on the skill row;
  // the original structured form stays auditable in the diff payload.
  const evidence = skill.justification_4plus
    ? `${skill.evidence}\n\n4+ gerekçesi: ${skill.justification_4plus}`
    : skill.evidence;

  // Baseline rows are new, but upsert keeps re-approval idempotent.
  const { data: existing } = await supabase
    .from("skills")
    .select("id, score")
    .eq("user_id", userId)
    .eq("domain", skill.domain)
    .eq("name", skill.name)
    .maybeSingle();

  const { data: row, error: upsertError } = await supabase
    .from("skills")
    .upsert(
      {
        user_id: userId,
        domain: skill.domain,
        category: skill.category,
        name: skill.name,
        score: skill.score,
        evidence,
        counter_argument: skill.counter_argument,
        provisional: true,
      },
      { onConflict: "user_id,domain,name" }
    )
    .select("id")
    .single();
  if (upsertError || !row) throw upsertError;

  const { error: historyError } = await supabase.from("skill_history").insert({
    skill_id: row.id,
    user_id: userId,
    old_score: existing?.score ?? null,
    new_score: skill.score,
    evidence,
    source_session: sessionId,
  });
  if (historyError) throw historyError;
}

async function approveProfileDiff(
  supabase: SupabaseClient,
  userId: string,
  payload: unknown
) {
  const profile = payload as ProfileDiffPayload;
  const { error } = await supabase
    .from("profiles")
    .update({ goals: profile.goals, priorities: profile.priorities })
    .eq("user_id", userId);
  if (error) throw error;
}
