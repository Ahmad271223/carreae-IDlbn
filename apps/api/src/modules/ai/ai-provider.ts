/**
 * Provider-independent LLM access (§27). The default implementation talks to
 * the Anthropic Messages API; unconfigured environments get null and every AI
 * endpoint fails closed with 503 — no fake generation, ever.
 */
export interface CompletionRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
}

export abstract class AIProvider {
  abstract complete(request: CompletionRequest): Promise<string>;
}

export const AI_PROVIDER = "AI_PROVIDER";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-5";

export class AnthropicProvider extends AIProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.AI_MODEL ?? DEFAULT_MODEL,
  ) {
    super();
  }

  async complete(request: CompletionRequest): Promise<string> {
    const response = await fetch(ANTHROPIC_API, {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: request.maxTokens ?? 1024,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`anthropic api ${response.status}`);
    }
    const body = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = body.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("anthropic api returned no text");
    return text;
  }
}

export function buildAIProvider(): AIProvider | null {
  const key = process.env.ANTHROPIC_API_KEY;
  return key ? new AnthropicProvider(key) : null;
}
