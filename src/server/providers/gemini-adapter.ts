/**
 * Google Gemini Provider Adapter for Z-Bits.
 *
 * Implements the Universal AI Provider contract using the modern @google/genai SDK.
 * Supports:
 * - API Key authentication
 * - Server-side execution without exposing secrets to client
 * - Tool calling (function declarations)
 * - Streaming & structured responses
 * - Connection validation & latency measurement
 */

import { GoogleGenAI } from "@google/genai";
import type {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIToolCall,
  ProviderValidationResult,
} from "./provider-registry.js";

export const GEMINI_DEFAULT_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
];

export interface GeminiConfig {
  apiKey?: string;
  model?: string;
}

export class GeminiProviderAdapter implements AIProviderAdapter {
  public readonly id = "google";
  public readonly name = "Google Gemini";
  public readonly supportsTools = true;
  public readonly supportsStreaming = true;

  constructor(private readonly defaultApiKey?: string) {}

  private getClient(apiKey?: string): GoogleGenAI {
    const key = (apiKey || this.defaultApiKey || process.env.GEMINI_API_KEY || "").trim();
    if (!key) {
      throw new Error("Missing Google Gemini API key. Provide a key in AI Provider settings or GEMINI_API_KEY env.");
    }
    return new GoogleGenAI({ apiKey: key });
  }

  public async validateConfiguration(config?: GeminiConfig): Promise<ProviderValidationResult> {
    const start = Date.now();
    const apiKey = config?.apiKey || this.defaultApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey || !apiKey.trim()) {
      return { ok: false, error: "Missing Gemini API key. Add your key from aistudio.google.com/apikey." };
    }
    const cleanKey = apiKey.trim();
    if (!/^[\w-]{30,80}$/.test(cleanKey)) {
      return { ok: false, error: "Invalid Gemini key format. Keys usually start with AIza." };
    }

    try {
      // Validate by querying models list or test prompt via standard endpoint
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=5", {
        headers: { "x-goog-api-key": cleanKey, accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      const latencyMs = Date.now() - start;
      if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return { ok: false, latencyMs, error: "Google rejected that key. Ensure the Gemini API is enabled in Google AI Studio." };
        }
        if (response.status === 429) {
          return { ok: false, latencyMs, error: "Gemini rate limit or quota exceeded. Please check your AI Studio quota." };
        }
        return { ok: false, latencyMs, error: `Google API error (${response.status}).` };
      }

      const body = (await response.json().catch(() => ({}))) as { models?: Array<{ name?: string }> };
      const remoteModels = (body.models || [])
        .map((m) => m.name?.replace(/^models\//, ""))
        .filter((m): m is string => Boolean(m && !/(?:embedding|vision|imagen|veo|aqa)/i.test(m)));

      const models = remoteModels.length > 0 ? remoteModels : GEMINI_DEFAULT_MODELS;
      return { ok: true, latencyMs, models };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Connection to Google Gemini failed." };
    }
  }

  public async listModels(): Promise<string[]> {
    return GEMINI_DEFAULT_MODELS;
  }

  public async generateResponse(request: AIRequest): Promise<AIResponse> {
    const ai = this.getClient();
    const model = request.model.replace(/^google\//, "");

    // Format contents
    const contents: any[] = [];
    for (const msg of request.messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    const config: any = {};
    if (request.systemPrompt) {
      config.systemInstruction = { parts: [{ text: request.systemPrompt }] };
    }
    if (typeof request.temperature === "number") {
      config.temperature = request.temperature;
    }
    if (typeof request.maxTokens === "number") {
      config.maxOutputTokens = request.maxTokens;
    }

    // Function/tool calling
    if (request.tools && request.tools.length > 0) {
      config.tools = [
        {
          functionDeclarations: request.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          })),
        },
      ];
    }

    const result = await (ai.models as any).generateContent({
      model,
      contents,
      config,
    });

    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    let text = "";
    const toolCalls: AIToolCall[] = [];

    for (const part of parts) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: part.functionCall.name,
          arguments: part.functionCall.args || {},
        });
      }
    }

    const usageMeta = result.usageMetadata;
    const usage = usageMeta
      ? {
          inputTokens: usageMeta.promptTokenCount || 0,
          outputTokens: usageMeta.candidatesTokenCount || 0,
          totalTokens: usageMeta.totalTokenCount || 0,
        }
      : undefined;

    return {
      text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage,
      finishReason: candidate?.finishReason,
      raw: result,
    };
  }

  public async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const ai = this.getClient();
    const model = request.model.replace(/^google\//, "");

    const contents: any[] = [];
    for (const msg of request.messages) {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    const config: any = {};
    if (request.systemPrompt) {
      config.systemInstruction = { parts: [{ text: request.systemPrompt }] };
    }

    const responseStream = await (ai.models as any).generateContentStream({
      model,
      contents,
      config,
    });

    for await (const chunk of responseStream) {
      const text = chunk.text || "";
      if (text) {
        yield { textDelta: text };
      }
    }
    yield { done: true };
  }
}

