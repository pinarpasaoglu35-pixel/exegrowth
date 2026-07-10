import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import InterviewChat from "@/components/interview-chat";

export default async function InterviewPage() {
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
  if (step === "cv" || step === "profil") redirect("/onboarding");

  // Resume support: archived transcript re-renders the chat as it was.
  const { data: session } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("kind", "onboarding_interview")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let initialMessages: { role: string; content: string }[] = [];
  if (session) {
    const { data: messages } = await supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });
    initialMessages = messages ?? [];
  }

  return (
    <InterviewChat
      initialMessages={initialMessages}
      initialDone={session?.status === "completed"}
    />
  );
}
