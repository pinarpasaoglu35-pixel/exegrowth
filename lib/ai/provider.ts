// Provider adapter: the ONLY interface the rest of the app talks to for AI.
// The Anthropic implementation lives behind it; the model name comes from
// the AI_MODEL env var, so swapping providers/models never touches app code.

export type AiContentBlock =
  | { type: "text"; text: string }
  | { type: "pdf"; dataBase64: string };

export interface AiMessage {
  role: "user" | "assistant";
  content: string | AiContentBlock[];
}

export interface CompleteOptions {
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  // When set, the provider must return valid JSON conforming to this schema.
  jsonSchema?: Record<string, unknown>;
}

export interface AIProvider {
  /** Single-shot completion; returns the full response text. */
  complete(options: CompleteOptions): Promise<string>;
  /** Streaming completion; yields text chunks as they arrive. */
  stream(options: CompleteOptions): AsyncIterable<string>;
}

import { AnthropicProvider } from "./anthropic";

let provider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (!provider) provider = new AnthropicProvider();
  return provider;
}
