/**
 * Local Ollama Provider Adapter for Z-Bits.
 *
 * Implements the AIProviderAdapter contract by wrapping an OpenAI-compatible
 * connection to a local Ollama instance (default: http://127.0.0.1:11434/v1).
 */

import { OpenAICompatibleAdapter } from "./openai-adapter.js";
import type {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  ProviderValidationResult,
} from "./provider-registry.js";

export interface OllamaConfig {
  baseUrl?: string;
  defaultModel?: string;
}

export class OllamaProviderAdapter implements AIProviderAdapter {
  public readonly id = "ollama";
  public readonly name = "Ollama (Local)";
  public readonly supportsTools = true;
  public readonly supportsStreaming = true;

  private readonly adapter: OpenAICompatibleAdapter;
  private readonly baseUrl: string;

  constructor(private readonly config: OllamaConfig = {}) {
    this.baseUrl = (config.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    this.adapter = new OpenAICompatibleAdapter({
      id: "ollama",
      name: "Ollama (Local)",
      baseUrl: `${this.baseUrl}/v1`,
      defaultModel: config.defaultModel || "llama3.1",
    });
  }

  public async validateConfiguration(): Promise<ProviderValidationResult> {
    const start = Date.now();
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3_000),
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return {
          ok: false,
          latencyMs,
          error: `Ollama returned HTTP error ${res.status}.`,
        };
      }

      const body = (await res.json().catch(() => ({}))) as { models?: Array<{ name?: string }> };
      const models = (body.models || []).map((m) => m.name).filter((n): n is string => Boolean(n));

      return {
        ok: true,
        latencyMs,
        models: models.length > 0 ? models : ["llama3.1", "qwen2.5-coder"],
      };
    } catch {
      return {
        ok: false,
        error: `Ollama server is not running on ${this.baseUrl}. Start Ollama and try again.`,
      };
    }
  }

  public async listModels(): Promise<string[]> {
    const val = await this.validateConfiguration();
    return val.models || ["llama3.1"];
  }

  public async generateResponse(request: AIRequest): Promise<AIResponse> {
    return this.adapter.generateResponse(request);
  }

  public async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    yield* this.adapter.streamResponse(request);
  }
}
