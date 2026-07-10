import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProvider } from "@/lib/ai/provider";
import {
  KERNEL_VERSION,
  INTERVIEW_SYSTEM,
  INTERVIEW_OPENER_INSTRUCTION,
  INTERVIEW_TURN_INSTRUCTION,
} from "@/lib/ai/kernel";
import {
  interviewOpenerSchema,
  interviewTurnSchema,
  INTERVIEW_OPENER_JSON_SCHEMA,
  INTERVIEW_TURN_JSON_SCHEMA,
} from "@/lib/ai/schemas";
import {
  compileProfileBlock,
  compileInterviewBlock,
  compileTurnBlock,
} from "@/lib/ai/compiler";
import type { InterviewMetadata } from "@/lib/db/types";

export const maxDuration = 60;

const MIN_QUESTIONS = 6;
const MAX_QUESTIONS = 10;

const bodySchema = z.object({
  answer: z.string().trim().min(1).max(4000).optional(),
});

const EMPTY_METADATA: InterviewMetadata = {
  interview_state: { questions_asked: [] },
  pending_question: null,
  closing: null,
};

// One interview turn. No answer → start/resume (returns the pending or first
// question). With answer → capture it and get the next question / closing.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Oturum bulunamadı." }, { status: 401 });
  }

  const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
  }
  const answer = parsedBody.data.answer;

  const { data: profile } = await supabase
    .from("profiles")
    .select("cv_json, goals, onboarding_step")
    .eq("user_id", user.id)
    .single();
  if (!profile?.cv_json) {
    return NextResponse.json(
      { error: "Önce profilini tamamlamalısın." },
      { status: 409 }
    );
  }

  // Find or create the interview session (kernel version stamped).
  let { data: session } = await supabase
    .from("sessions")
    .select("id, status, metadata")
    .eq("user_id", user.id)
    .eq("kind", "onboarding_interview")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    const { data: created, error } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        kind: "onboarding_interview",
        kernel_version: KERNEL_VERSION,
        metadata: EMPTY_METADATA,
      })
      .select("id, status, metadata")
      .single();
    if (error || !created) {
      console.error("Session create failed:", error);
      return NextResponse.json({ error: "Görüşme başlatılamadı." }, { status: 500 });
    }
    session = created;
  }

  const metadata = (session.metadata ?? EMPTY_METADATA) as InterviewMetadata;

  if (session.status === "completed") {
    return NextResponse.json({ done: true, closing: metadata.closing ?? "" });
  }

  const provider = getProvider();
  const profileBlock = compileProfileBlock(profile);

  try {
    // ── Start/resume: no answer supplied ──
    if (!answer) {
      if (metadata.pending_question) {
        return NextResponse.json({
          done: false,
          question: metadata.pending_question.question,
          number: metadata.pending_question.number,
        });
      }

      const raw = await provider.complete({
        system: INTERVIEW_SYSTEM,
        messages: [
          {
            role: "user",
            content: `${profileBlock}\n\n${INTERVIEW_OPENER_INSTRUCTION}`,
          },
        ],
        jsonSchema: INTERVIEW_OPENER_JSON_SCHEMA,
        maxTokens: 1000,
      });
      const opener = interviewOpenerSchema.parse(JSON.parse(raw));

      const newMetadata: InterviewMetadata = {
        ...metadata,
        pending_question: { question: opener.question, topic: opener.topic, number: 1 },
      };
      await supabase
        .from("sessions")
        .update({ metadata: newMetadata })
        .eq("id", session.id);
      await supabase.from("messages").insert({
        session_id: session.id,
        user_id: user.id,
        role: "assistant",
        content: opener.question,
      });

      return NextResponse.json({ done: false, question: opener.question, number: 1 });
    }

    // ── Turn: an answer was supplied ──
    if (!metadata.pending_question) {
      return NextResponse.json(
        { error: "Yanıtlanacak aktif bir soru yok." },
        { status: 409 }
      );
    }

    const answeredCount = metadata.interview_state.questions_asked.length;
    const raw = await provider.complete({
      system: INTERVIEW_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            profileBlock,
            compileInterviewBlock(metadata.interview_state),
            compileTurnBlock(metadata.pending_question, answer),
            INTERVIEW_TURN_INSTRUCTION,
          ].join("\n\n"),
        },
      ],
      jsonSchema: INTERVIEW_TURN_JSON_SCHEMA,
      maxTokens: 1500,
    });
    const turn = interviewTurnSchema.parse(JSON.parse(raw));

    const questionsAsked = [
      ...metadata.interview_state.questions_asked,
      {
        topic: turn.capture.topic,
        question: metadata.pending_question.question,
        answer_summary: turn.capture.answer_summary,
        signals: turn.capture.signals,
      },
    ];

    // Hard cap: force completion at MAX_QUESTIONS even if the model asks on.
    const mustComplete = questionsAsked.length >= MAX_QUESTIONS;
    const completes =
      (turn.action === "complete" && questionsAsked.length >= MIN_QUESTIONS) ||
      mustComplete;

    // Archive the user's answer (transcript = audit/UI, not AI memory).
    await supabase.from("messages").insert({
      session_id: session.id,
      user_id: user.id,
      role: "user",
      content: answer,
    });

    if (completes) {
      const closing =
        turn.closing ??
        "Teşekkürler — görüşme tamam. Şimdi iki kısa egzersizle devam ediyoruz.";
      const newMetadata: InterviewMetadata = {
        interview_state: { questions_asked: questionsAsked },
        pending_question: null,
        closing,
      };
      await supabase
        .from("sessions")
        .update({
          metadata: newMetadata,
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", session.id);
      await supabase.from("messages").insert({
        session_id: session.id,
        user_id: user.id,
        role: "assistant",
        content: closing,
      });
      await supabase
        .from("profiles")
        .update({ onboarding_step: "egzersiz" })
        .eq("user_id", user.id);

      return NextResponse.json({ done: true, closing });
    }

    const nextQuestion =
      turn.question ?? "Bunu biraz daha açar mısın? Somut bir örnek ver.";
    const newMetadata: InterviewMetadata = {
      interview_state: { questions_asked: questionsAsked },
      pending_question: {
        question: nextQuestion,
        topic: turn.topic ?? turn.capture.topic,
        number: questionsAsked.length + 1,
      },
      closing: null,
    };
    await supabase
      .from("sessions")
      .update({ metadata: newMetadata })
      .eq("id", session.id);
    await supabase.from("messages").insert({
      session_id: session.id,
      user_id: user.id,
      role: "assistant",
      content: nextQuestion,
    });

    return NextResponse.json({
      done: false,
      question: nextQuestion,
      number: questionsAsked.length + 1,
    });
  } catch (err) {
    console.error("Interview turn failed:", err);
    return NextResponse.json(
      { error: "Bir şeyler ters gitti. Lütfen tekrar dene." },
      { status: 502 }
    );
  }
}
