/**
 * Generic OpenAI-Compatible Provider Adapter for Z-Bits.
 *
 * Connects any OpenAI-compliant API endpoint:
 * - OpenRouter, Together AI, Groq, Mistral, Perplexity, DeepSeek
 * - Local servers: Ollama, vLLM, LM Studio, LocalAI
 *
 * Supports:
 * - Configurable Base URL & API Key
 * - Custom request headers
 * - Function/tool calling
 * - Streaming through SSE
 * - Token usage accounting
 */

import type {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIToolCall,
  ProviderValidationResult,
} from "./provider-registry.js";

export interface OpenAICompatibleConfig {
  id?: string;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleAdapter implements AIProviderAdapter {
  public readonly id: string;
  public readonly name: string;
  public readonly supportsTools = true;
  public readonly supportsStreaming = true;

  constructor(private readonly config: OpenAICompatibleConfig = {}) {
    this.id = config.id || "openai-compatible";
    this.name = config.name || "OpenAI-Compatible";
  }

  private getBaseUrl(override?: OpenAICompatibleConfig): string {
    const raw = override?.baseUrl || this.config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    return raw.replace(/\/+$/, "");
  }

  private getApiKey(override?: OpenAICompatibleConfig): string {
    return (override?.apiKey || this.config.apiKey || process.env.OPENAI_API_KEY || "").trim();
  }

  public async validateConfiguration(config?: OpenAICompatibleConfig): Promise<ProviderValidationResult> {
    const start = Date.now();
    const effective = { ...this.config, ...config };
    const baseUrl = this.getBaseUrl(effective);
    const apiKey = this.getApiKey(effective);

    const headers: Record<string, string> = {
      accept: "application/json",
      ...(effective.extraHeaders || {}),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    try {
      // First attempt: GET /models
      const modelsRes = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      });

      const latencyMs = Date.now() - start;
      if (modelsRes.ok) {
        const body = (await modelsRes.json().catch(() => ({}))) as { data?: Array<{ id: string }> };
        const modelList = Array.isArray(body.data) ? body.data.map((m) => m.id).filter(Boolean) : [];
        return { ok: true, latencyMs, models: modelList.slice(0, 30) };
      }

      // Fallback: If /models returns 404 or method not allowed, try minimal /chat/completions
      const testModel = effective.defaultModel || "gpt-3.5-turbo";
      const chatRes = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          model: testModel,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 2,
        }),
        signal: AbortSignal.timeout(12_000),
      });

      const latencyChat = Date.now() - start;
      if (chatRes.ok) {
        return { ok: true, latencyMs: latencyChat, models: [testModel] };
      }

      if (chatRes.status === 401 || chatRes.status === 403) {
        return { ok: false, latencyMs: latencyChat, error: "Authentication failed. Check your API key." };
      }
      return { ok: false, latencyMs: latencyChat, error: `Endpoint returned error (${chatRes.status}).` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Failed to reach endpoint." };
    }
  }

  public async generateResponse(request: AIRequest): Promise<AIResponse> {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      ...(this.config.extraHeaders || {}),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    if (request.systemPrompt) {
      messages.unshift({ role: "system", content: request.systemPrompt });
    }

    const payload: any = {
      model: request.model.replace(/^(custom|openai-compatible)\//, ""),
      messages,
    };
    if (typeof request.temperature === "number") payload.temperature = request.temperature;
    if (typeof request.maxTokens === "number") payload.max_tokens = request.maxTokens;

    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((t) => ({
        type: "function",
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`OpenAI API error (${response.status}): ${errText.slice(0, 300)}`);
    }

    const data = (await response.json()) as any;
    const choice = data.choices?.[0];
    const message = choice?.message;

    const toolCalls: AIToolCall[] = [];
    if (Array.isArray(message?.tool_calls)) {
      for (const tc of message.tool_calls) {
        let args = {};
        try {
          args = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {};
        } catch {
          args = { raw: tc.function?.arguments };
        }
        toolCalls.push({
          id: tc.id || `call_${Date.now()}`,
          name: tc.function?.name || "",
          arguments: args,
        });
      }
    }

    const usage = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens || 0,
          outputTokens: data.usage.completion_tokens || 0,
          totalTokens: data.usage.total_tokens || 0,
        }
      : undefined;

    return {
      text: message?.content || "",
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage,
      finishReason: choice?.finish_reason,
      raw: data,
    };
  }

  public async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const baseUrl = this.getBaseUrl();
    const apiKey = this.getApiKey();

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "text/event-stream",
      ...(this.config.extraHeaders || {}),
    };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const messages = request.messages.map((m) => ({ role: m.role, content: m.content }));
    if (request.systemPrompt) {
      messages.unshift({ role: "system", content: request.systemPrompt });
    }

    const payload = {
      model: request.model.replace(/^(custom|openai-compatible)\//, ""),
      messages,
      stream: true,
    };

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI stream error (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === "[DONE]") {
          yield { done: true };
          return;
        }
        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            yield { textDelta: delta };
          }
        } catch {
          // ignore partial parse error
        }
      }
    }
    yield { done: true };
  }
}

