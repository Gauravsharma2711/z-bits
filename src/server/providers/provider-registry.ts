/**
 * Z-Bits Universal AI Provider Registry & Adapter Contracts.
 *
 * Provides a unified abstraction layer across diverse AI providers:
 * - Google Gemini (native @google/genai)
 * - AWS Bedrock (native @aws-sdk/client-bedrock-runtime and OpenAI-compatible endpoint)
 * - Generic OpenAI-Compatible endpoints
 * While preserving legacy runtime paths (OpenCode Go, Claude Code, Apple Intelligence).
 */

export interface AIMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIRequest {
  model: string;
  systemPrompt?: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: AIToolDefinition[];
}

export interface AIResponse {
  text: string;
  toolCalls?: AIToolCall[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  raw?: unknown;
}

export interface AIStreamChunk {
  textDelta?: string;
  toolCallDelta?: Partial<AIToolCall>;
  done?: boolean;
}

export interface ProviderValidationResult {
  ok: boolean;
  error?: string;
  latencyMs?: number;
  models?: string[];
}

export interface AIProviderAdapter {
  id: string;
  name: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  validateConfiguration(config?: unknown): Promise<ProviderValidationResult>;
  listModels?(): Promise<string[]>;
  generateResponse(request: AIRequest): Promise<AIResponse>;
  streamResponse?(request: AIRequest): AsyncIterable<AIStreamChunk>;
}

export class AIProviderRegistry {
  private static instance: AIProviderRegistry;
  private readonly adapters = new Map<string, AIProviderAdapter>();

  public constructor() {}

  public static get(): AIProviderRegistry {
    if (!AIProviderRegistry.instance) {
      AIProviderRegistry.instance = new AIProviderRegistry();
    }
    return AIProviderRegistry.instance;
  }

  public register(adapter: AIProviderAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public has(id: string): boolean {
    return this.adapters.has(id);
  }

  public getAdapter(id: string): AIProviderAdapter | undefined {
    return this.adapters.get(id);
  }

  public list(): AIProviderAdapter[] {
    return this.listAdapters();
  }

  public listAdapters(): AIProviderAdapter[] {
    return [...this.adapters.values()];
  }
}
