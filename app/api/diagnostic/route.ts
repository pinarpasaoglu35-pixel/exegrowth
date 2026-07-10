import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai/provider";
import {
  KERNEL_VERSION,
  DIAGNOSTIC_GENERATE_SYSTEM,
  DIAGNOSTIC_GENERATE_INSTRUCTION,
  SCORING_SYSTEM,
  SCORING_INSTRUCTION,
} from "@/lib/ai/kernel";
import {
  diagnosticExercisesSchema,
  DIAGNOSTIC_EXERCISES_JSON_SCHEMA,
  scoringOutputSchema,
  SCORING_JSON_SCHEMA,
} from "@/lib/ai/schemas";
import {
  compileProfileBlock,
  compileInterviewBlock,
  compileExercisesBlock,
} from "@/lib/ai/compiler";
import { stageScoringDiffs } from "@/lib/ai/diff";
import type { DiagnosticMetadata, InterviewMetadata } from "@/lib/db/types";

export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("submit_case"),
    response: z.string().trim().min(20).max(6000),
  }),
  z.object({
    action: z.literal("submit_prioritization"),
    order: z.array(z.number().int().min(0).max(4)).length(5),
    justification: z.string().trim().min(10).max(3000),
  }),
]);

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
  const body = parsed.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_json, goals, onboarding_step")
    .eq("user_id", user.id)
    .single();
  if (profile?.onboarding_step === "rapor" || profile?.onboarding_step === "tamam") {
    return NextResponse.json({ done: true });
  }
  if (profile?.onboarding_step !== "egzersiz") {
    return NextResponse.json(
      { error: "Önce görüşmeyi tamamlamalısın." },
      { status: 409 }
    );
  }

  // The completed interview supplies the evidence base.
  const { data: interviewSession } = await supabase
    .from("sessions")
    .select("id, metadata")
    .eq("user_id", user.id)
    .eq("kind", "onboarding_interview")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!interviewSession) {
    return NextResponse.json(
      { error: "Tamamlanmış görüşme bulunamadı." },
      { status: 409 }
    );
  }
  const interviewState = (interviewSession.metadata as InterviewMetadata)
    .interview_state;

  // Find or create the diagnostic session.
  let { data: session } = await supabase
    .from("sessions")
    .select("id, status, metadata")
    .eq("user_id", user.id)
    .eq("kind", "diagnostic")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    const emptyMetadata: DiagnosticMetadata = { exercises: null, responses: {} };
    const { data: created, error } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        kind: "diagnostic",
        kernel_version: KERNEL_VERSION,
        metadata: emptyMetadata,
      })
      .select("id, status, metadata")
      .single();
    if (error || !created) {
      console.error("Diagnostic session create failed:", error);
      return NextResponse.json({ error: "Egzersizler başlatılamadı." }, { status: 500 });
    }
    session = created;
  }

  const metadata = session.metadata as DiagnosticMetadata;
  const provider = getProvider();
  const profileBlock = compileProfileBlock(profile);
  const interviewBlock = compileInterviewBlock(interviewState);

  try {
    // ── start: generate exercises once, then always return current state ──
    if (body.action === "start") {
      if (!metadata.exercises) {
        const raw = await provider.complete({
          system: DIAGNOSTIC_GENERATE_SYSTEM,
          messages: [
            {
              role: "user",
              content: `${profileBlock}\n\n${interviewBlock}\n\n${DIAGNOSTIC_GENERATE_INSTRUCTION}`,
            },
          ],
          jsonSchema: DIAGNOSTIC_EXERCISES_JSON_SCHEMA,
          maxTokens: 2000,
        });
        metadata.exercises = diagnosticExercisesSchema.parse(JSON.parse(raw));
        await supabase
          .from("sessions")
          .update({ metadata })
          .eq("id", session.id);
      }
      return NextResponse.json({
        exercises: metadata.exercises,
        responses: metadata.responses,
        done: false,
      });
    }

    if (!metadata.exercises) {
      return NextResponse.json(
        { error: "Önce egzersizleri başlatmalısın." },
        { status: 409 }
      );
    }

    // ── submit exercise 1 ──
    if (body.action === "submit_case") {
      metadata.responses.case = body.response;
      await supabase.from("sessions").update({ metadata }).eq("id", session.id);
      return NextResponse.json({ ok: true });
    }

    // ── submit exercise 2, then run the scoring pass ──
    if (!metadata.responses.case) {
      return NextResponse.json(
        { error: "Önce ilk egzersizi tamamlamalısın." },
        { status: 409 }
      );
    }
    // Ranking must be a permutation of all 5 items.
    if (new Set(body.order).size !== 5) {
      return NextResponse.json(
        { error: "Sıralamada her madde tam bir kez yer almalı." },
        { status: 400 }
      );
    }

    metadata.responses.prioritization = {
      order: body.order,
      justification: body.justification,
    };
    await supabase.from("sessions").update({ metadata }).eq("id", session.id);

    const raw = await provider.complete({
      system: SCORING_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            profileBlock,
            interviewBlock,
            compileExercisesBlock(metadata.exercises, metadata.responses),
            SCORING_INSTRUCTION,
          ].join("\n\n"),
        },
      ],
      jsonSchema: SCORING_JSON_SCHEMA,
      // Scoring is the judgment-heavy step — allow a stronger model via env.
      model: process.env.AI_MODEL_SCORING,
      maxTokens: 8000,
    });
    const scoring = scoringOutputSchema.parse(JSON.parse(raw));

    // Proposals land as PENDING diffs — nothing is written to skills/profiles
    // until the user reviews them on /rapor.
    await stageScoringDiffs(supabase, user.id, session.id, scoring);

    await supabase
      .from("sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), metadata })
      .eq("id", session.id);
    await supabase
      .from("profiles")
      .update({ onboarding_step: "rapor" })
      .eq("user_id", user.id);

    return NextResponse.json({ done: true });
  } catch (err) {
    console.error("Diagnostic action failed:", err);
    return NextResponse.json(
      { error: "Bir şeyler ters gitti. Lütfen tekrar dene." },
      { status: 502 }
    );
  }
}
