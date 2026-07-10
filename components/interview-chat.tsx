"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface ChatMessage {
  role: string;
  content: string;
}

export default function InterviewChat({
  initialMessages,
  initialDone,
}: {
  initialMessages: ChatMessage[];
  initialDone: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [done, setDone] = useState(initialDone);
  const [questionNumber, setQuestionNumber] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  // First visit: fetch the opening question.
  useEffect(() => {
    if (startedRef.current || done || initialMessages.length > 0) return;
    startedRef.current = true;
    void callInterview(undefined, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function callInterview(answer: string | undefined, appendAnswer: boolean) {
    setThinking(true);
    setError(null);
    if (appendAnswer && answer) {
      setMessages((prev) => [...prev, { role: "user", content: answer }]);
    }
    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answer ? { answer } : {}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Bilinmeyen hata");

      if (data.done) {
        setMessages((prev) => [...prev, { role: "assistant", content: data.closing }]);
        setDone(true);
      } else {
        setMessages((prev) => {
          // Avoid duplicating a resumed pending question already in history.
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content === data.question) return prev;
          return [...prev, { role: "assistant", content: data.question }];
        });
        setQuestionNumber(data.number);
      }
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir şeyler ters gitti.");
      // Keep the user's answer in the input so nothing is lost.
      if (appendAnswer && answer) {
        setMessages((prev) => prev.slice(0, -1));
        setInput(answer);
      }
    } finally {
      setThinking(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const answer = input.trim();
    if (!answer || thinking || done) return;
    void callInterview(answer, true);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col px-6 py-8">
      <div className="mb-4">
        <p className="text-sm text-neutral-500">
          Adım 3 / 4 · Görüşme
          {questionNumber !== null && !done && (
            <span> · Soru {questionNumber} (6–10 arası sürer)</span>
          )}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Tanışma görüşmesi</h1>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-4">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-3 text-white"
                : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm border border-neutral-200 bg-white px-4 py-3"
            }
          >
            {m.content}
          </div>
        ))}
        {thinking && (
          <div className="mr-auto rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-neutral-400">
            Düşünüyor…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {done ? (
        <button
          onClick={() => router.push("/onboarding/egzersiz")}
          className="rounded-lg bg-neutral-900 px-6 py-3 text-white hover:bg-neutral-700"
        >
          Egzersizlere geç →
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Cevabını yaz… (Enter ile gönder)"
            disabled={thinking}
            className="flex-1 resize-none rounded-lg border border-neutral-300 px-4 py-3 focus:border-neutral-900 focus:outline-none disabled:bg-neutral-100"
          />
          <button
            type="submit"
            disabled={thinking || !input.trim()}
            className="rounded-lg bg-neutral-900 px-5 text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            Gönder
          </button>
        </form>
      )}
    </main>
  );
}
