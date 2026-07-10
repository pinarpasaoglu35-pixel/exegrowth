import Anthropic from "@anthropic-ai/sdk";
import type {
  AIProvider,
  AiContentBlock,
  AiMessage,
  CompleteOptions,
} from "./provider";

const DEFAULT_MAX_TOKENS = 16000;

function toAnthropicContent(content: string | AiContentBlock[]) {
  if (typeof content === "string") return content;
  return content.map((block) =>
    block.type === "text"
      ? ({ type: "text", text: block.text } as const)
      : ({
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: block.dataBase64,
          },
        } as const)
  );
}

function toAnthropicMessages(messages: AiMessage[]) {
  return messages.map((m) => ({
    role: m.role,
    content: toAnthropicContent(m.content),
  }));
}

export class AnthropicProvider implements AIProvider {
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Sonnet is the default: extraction/chat tasks don't need Opus-level
  // reasoning. Override globally via AI_MODEL or per call via options.model.
  private model = process.env.AI_MODEL ?? "claude-sonnet-4-6";

  async complete(options: CompleteOptions): Promise<string> {
    const response = await this.client.messages.create({
      model: options.model ?? this.model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: options.system,
      messages: toAnthropicMessages(options.messages),
      ...(options.jsonSchema
        ? {
            output_config: {
              format: { type: "json_schema" as const, schema: options.jsonSchema },
            },
          }
        : {}),
    });

    return response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  async *stream(options: CompleteOptions): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: options.model ?? this.model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: options.system,
      messages: toAnthropicMessages(options.messages),
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}
