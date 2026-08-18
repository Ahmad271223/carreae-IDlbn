import { Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Provider-independent LLM access (§27). The default implementation talks to
 * the Anthropic Messages API through the official SDK; unconfigured
 * environments get null and every AI endpoint fails closed with 503 — no fake
 * generation, ever.
 */
export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /**
   * JSON Schema for the reply. When set, the model is constrained to it —
   * the response parses, or the request fails. Replaces hand-rolled parsing
   * of prose-wrapped JSON.
   */
  schema?: Record<string, unknown>;
  /**
   * Model routing (§ cost model): only writing needs the strong model.
   * Structuring a posting is cheap work for the small one.
   */
  tier?: "small" | "large";
}

export abstract class AIProvider {
  abstract complete(request: CompletionRequest): Promise<string>;
}

export const AI_PROVIDER = "AI_PROVIDER";

/** One tier per job, so a letter costs cents rather than a euro. */
const MODELS = {
  small: process.env.AI_MODEL_SMALL ?? "claude-haiku-4-5",
  large: process.env.AI_MODEL_LARGE ?? "claude-opus-5",
} as const;

/**
 * Thinking counts against max_tokens on current models, so a tight budget
 * truncates the answer mid-sentence instead of erroring — generous by default.
 */
const DEFAULT_MAX_TOKENS = 16000;

export class AnthropicProvider extends AIProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  async complete(request: CompletionRequest): Promise<string> {
    const model = MODELS[request.tier ?? "large"];
    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: request.system,
      messages: [{ role: "user", content: request.prompt }],
      ...(request.schema
        ? {
            output_config: {
              format: { type: "json_schema" as const, schema: request.schema },
            },
          }
        : {}),
    });

    // Cost tracking: what a generation actually costs is only knowable if
    // every call reports its model and token counts from day one.
    this.logger.log(
      `ai.call model=${model} in=${response.usage.input_tokens} ` +
        `out=${response.usage.output_tokens} stop=${response.stop_reason}`,
    );

    // Safety classifiers can decline a request; that arrives as a normal
    // response, so it must be checked before reading content.
    if (response.stop_reason === "refusal") {
      throw new Error("anthropic api refused the request");
    }
    const text = response.content.find((block) => block.type === "text")?.text;
    if (!text) throw new Error("anthropic api returned no text");
    return text;
  }
}

export function buildAIProvider(): AIProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicProvider(key) : null;
}
