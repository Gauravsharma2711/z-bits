/**
 * AWS Bedrock Provider Adapter for Z-Bits.
 *
 * Implements the Universal AI Provider contract for AWS Bedrock:
 * Path A: Native Bedrock Converse API (@aws-sdk/client-bedrock-runtime)
 *         - AWS SDK default credential chain (IAM roles, env, ~/.aws/credentials)
 *         - Native tool use & streaming via Converse / ConverseStream
 * Path B: Bedrock OpenAI-compatible endpoint
 *         - Configurable base URL: https://bedrock-runtime.{region}.amazonaws.com/openai/v1
 *         - Bedrock API key auth
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  type Message as BedrockMessage,
  type ContentBlock,
  type Tool as BedrockTool,
  type InferenceConfiguration,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIToolCall,
  ProviderValidationResult,
} from "./provider-registry.js";

export const BEDROCK_DEFAULT_MODELS = [
  "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  "us.anthropic.claude-3-5-haiku-20241022-v1:0",
  "amazon.nova-pro-v1:0",
  "amazon.nova-lite-v1:0",
  "amazon.nova-micro-v1:0",
  "meta.llama3-3-70b-instruct-v1:0",
  "mistral.mistral-large-2407-v1:0",
];

export interface BedrockConfig {
  region?: string;
  modelId?: string;
  authMode?: "iam_role" | "aws_sdk_chain" | "api_key" | "openai_compatible";
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  apiKey?: string;
  baseUrl?: string;
}

export class BedrockProviderAdapter implements AIProviderAdapter {
  public readonly id = "bedrock";
  public readonly name = "AWS Bedrock";
  public readonly supportsTools = true;
  public readonly supportsStreaming = true;

  constructor(private readonly config: BedrockConfig = {}) {}

  private getClient(overrideConfig?: BedrockConfig): BedrockRuntimeClient {
    const effective = { ...this.config, ...overrideConfig };
    const region = effective.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

    const clientConfig: any = { region };

    if (effective.accessKeyId && effective.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: effective.accessKeyId.trim(),
        secretAccessKey: effective.secretAccessKey.trim(),
        sessionToken: effective.sessionToken?.trim(),
      };
    }

    return new BedrockRuntimeClient(clientConfig);
  }

  public async validateConfiguration(config?: BedrockConfig): Promise<ProviderValidationResult> {
    const start = Date.now();
    const effective = { ...this.config, ...config };
    const region = effective.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";

    // Path B: Bedrock OpenAI-compatible endpoint validation
    if (effective.authMode === "openai_compatible" || effective.baseUrl) {
      const baseUrl = (effective.baseUrl || `https://bedrock-runtime.${region}.amazonaws.com/openai/v1`).replace(/\/+$/, "");
      const apiKey = effective.apiKey || process.env.BEDROCK_API_KEY;
      if (!apiKey) {
        return { ok: false, error: "Missing Bedrock API key for OpenAI-compatible endpoint." };
      }
      try {
        const response = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${apiKey}`, accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const latencyMs = Date.now() - start;
        if (!response.ok) {
          return { ok: false, latencyMs, error: `Bedrock OpenAI endpoint rejected authentication (${response.status}).` };
        }
        return { ok: true, latencyMs, models: BEDROCK_DEFAULT_MODELS };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Bedrock OpenAI endpoint unreachable." };
      }
    }

    // Path A: Native Converse API validation
    try {
      const client = this.getClient(effective);
      const testModel = effective.modelId || BEDROCK_DEFAULT_MODELS[2]; // amazon.nova-pro-v1:0 or similar

      const command = new ConverseCommand({
        modelId: testModel,
        messages: [{ role: "user", content: [{ text: "ping" }] }],
        inferenceConfig: { maxTokens: 4, temperature: 0.1 },
      });

      await client.send(command);
      const latencyMs = Date.now() - start;
      return { ok: true, latencyMs, models: BEDROCK_DEFAULT_MODELS };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const errorMsg = err?.message || String(err);
      if (/AccessDenied|UnrecognizedClientException|Unauthorized/i.test(errorMsg)) {
        return {
          ok: false,
          latencyMs,
          error: "AWS Bedrock Access Denied. Check IAM permissions or model access approval in the AWS Bedrock Console.",
        };
      }
      if (/ResourceNotFoundException/i.test(errorMsg)) {
        return {
          ok: false,
          latencyMs,
          error: `Bedrock model or inference profile not found in region ${region}. Verify model ID and enabled regions.`,
        };
      }
      return {
        ok: false,
        latencyMs,
        error: `AWS Bedrock connection failed: ${errorMsg.slice(0, 200)}`,
      };
    }
  }

  public async listModels(): Promise<string[]> {
    return BEDROCK_DEFAULT_MODELS;
  }

  public async generateResponse(request: AIRequest): Promise<AIResponse> {
    const client = this.getClient();
    const modelId = request.model.replace(/^bedrock\//, "");

    // Format messages for Bedrock Converse API
    const messages: BedrockMessage[] = [];
    for (const msg of request.messages) {
      if (msg.role === "system") continue; // Bedrock handles system prompt separately
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: [{ text: msg.content }],
      });
    }

    // Fallback if no user messages
    if (messages.length === 0) {
      messages.push({ role: "user", content: [{ text: "Hello" }] });
    }

    const inferenceConfig: InferenceConfiguration = {};
    if (typeof request.temperature === "number") inferenceConfig.temperature = request.temperature;
    if (typeof request.maxTokens === "number") inferenceConfig.maxTokens = request.maxTokens;

    // Tools
    let toolConfig: any = undefined;
    if (request.tools && request.tools.length > 0) {
      const tools: BedrockTool[] = request.tools.map((t) => ({
        toolSpec: {
          name: t.name,
          description: t.description,
          inputSchema: {
            json: t.parameters as any,
          },
        },
      }));
      toolConfig = { tools };
    }

    const command = new ConverseCommand({
      modelId,
      messages,
      system: request.systemPrompt ? [{ text: request.systemPrompt }] : undefined,
      inferenceConfig: Object.keys(inferenceConfig).length ? inferenceConfig : undefined,
      toolConfig,
    });

    const response = await client.send(command);
    const outputMessage = response.output?.message;
    let text = "";
    const toolCalls: AIToolCall[] = [];

    if (outputMessage?.content) {
      for (const block of outputMessage.content) {
        if (block.text) {
          text += block.text;
        }
        if (block.toolUse) {
          toolCalls.push({
            id: block.toolUse.toolUseId || `tool_${Date.now()}`,
            name: block.toolUse.name || "",
            arguments: (block.toolUse.input as Record<string, unknown>) || {},
          });
        }
      }
    }

    const usage = response.usage
      ? {
          inputTokens: response.usage.inputTokens || 0,
          outputTokens: response.usage.outputTokens || 0,
          totalTokens: response.usage.totalTokens || 0,
        }
      : undefined;

    return {
      text,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage,
      finishReason: response.stopReason,
      raw: response,
    };
  }

  public async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const client = this.getClient();
    const modelId = request.model.replace(/^bedrock\//, "");

    const messages: BedrockMessage[] = [];
    for (const msg of request.messages) {
      if (msg.role === "system") continue;
      messages.push({
        role: msg.role === "assistant" ? "assistant" : "user",
        content: [{ text: msg.content }],
      });
    }

    const command = new ConverseStreamCommand({
      modelId,
      messages: messages.length ? messages : [{ role: "user", content: [{ text: "Hello" }] }],
      system: request.systemPrompt ? [{ text: request.systemPrompt }] : undefined,
    });

    const response = await client.send(command);
    if (response.stream) {
      for await (const chunk of response.stream) {
        if (chunk.contentBlockDelta?.delta?.text) {
          yield { textDelta: chunk.contentBlockDelta.delta.text };
        }
      }
    }
    yield { done: true };
  }
}

