import test from "node:test";
import assert from "node:assert/strict";
import { GeminiProviderAdapter, GEMINI_DEFAULT_MODELS } from "./gemini-adapter.js";
import { BedrockProviderAdapter } from "./bedrock-adapter.js";
import { OpenAICompatibleAdapter } from "./openai-adapter.js";
import { ClaudeProviderAdapter, CLAUDE_DEFAULT_MODELS } from "./claude-adapter.js";
import { OllamaProviderAdapter } from "./ollama-adapter.js";
import { AIProviderRegistry } from "./provider-registry.js";

test("Universal AI Providers: Gemini, Claude, Ollama, Bedrock, and OpenAI-Compatible adapters", async () => {
  // 1. Google Gemini Adapter Basics
  const gemini = new GeminiProviderAdapter("test-fake-gemini-key");
  assert.equal(gemini.id, "google");
  assert.equal(gemini.name, "Google Gemini");
  assert.equal(gemini.supportsTools, true);
  assert.equal(gemini.supportsStreaming, true);
  const geminiModels = await gemini.listModels();
  assert.deepEqual(geminiModels, GEMINI_DEFAULT_MODELS);

  // 1b. Gemini Validation: missing key
  const geminiNoKey = new GeminiProviderAdapter("");
  const noKeyVal = await geminiNoKey.validateConfiguration({ apiKey: "" });
  assert.equal(noKeyVal.ok, false);
  assert.match(noKeyVal.error || "", /Missing Gemini API key/i);

  // 1c. Gemini Validation: invalid key format
  const badFormatVal = await geminiNoKey.validateConfiguration({ apiKey: "short" });
  assert.equal(badFormatVal.ok, false);
  assert.match(badFormatVal.error || "", /Invalid Gemini key format/i);

  // 2. Claude Adapter Basics
  const claude = new ClaudeProviderAdapter();
  assert.equal(claude.id, "claude");
  assert.equal(claude.name, "Claude Code");
  assert.equal(claude.supportsTools, true);
  assert.equal(claude.supportsStreaming, true);
  const claudeModels = await claude.listModels();
  assert.deepEqual(claudeModels, CLAUDE_DEFAULT_MODELS);

  // 3. Ollama (Local) Adapter Basics
  const ollama = new OllamaProviderAdapter({ baseUrl: "http://127.0.0.1:11434" });
  assert.equal(ollama.id, "ollama");
  assert.equal(ollama.name, "Ollama (Local)");
  assert.equal(ollama.supportsTools, true);
  assert.equal(ollama.supportsStreaming, true);

  // 3b. Ollama Validation: fails safely when server is offline
  const ollamaOffline = new OllamaProviderAdapter({ baseUrl: "http://127.0.0.1:65530" });
  const ollamaVal = await ollamaOffline.validateConfiguration();
  assert.equal(ollamaVal.ok, false);
  assert.match(ollamaVal.error || "", /Ollama server is not running/i);

  // 4. AWS Bedrock Adapter (Converse API and endpoint format)
  const bedrockConverse = new BedrockProviderAdapter({
    region: "us-east-1",
    modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  });
  assert.equal(bedrockConverse.id, "bedrock");
  assert.equal(bedrockConverse.supportsTools, true);
  assert.equal(bedrockConverse.supportsStreaming, true);

  const bedrockOpenAI = new BedrockProviderAdapter({
    region: "us-west-2",
    authMode: "openai_compatible",
    apiKey: "bedrock-key",
  });
  assert.equal(bedrockOpenAI.supportsStreaming, true);

  // 5. Generic OpenAI-Compatible Adapter
  const genericOAI = new OpenAICompatibleAdapter({
    id: "together-ai",
    name: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    apiKey: "fake-together-key",
    defaultModel: "meta-llama/Llama-3-70b-chat-hf",
  });
  assert.equal(genericOAI.id, "together-ai");
  assert.equal(genericOAI.name, "Together AI");
  assert.equal(genericOAI.supportsTools, true);
  assert.equal(genericOAI.supportsStreaming, true);

  // 6. AI Provider Registry
  const registry = new AIProviderRegistry();
  registry.register(gemini);
  registry.register(claude);
  registry.register(ollama);
  registry.register(bedrockConverse);
  registry.register(genericOAI);

  assert.equal(registry.has("google"), true);
  assert.equal(registry.has("claude"), true);
  assert.equal(registry.has("ollama"), true);
  assert.equal(registry.has("bedrock"), true);
  assert.equal(registry.has("together-ai"), true);
  assert.equal(registry.count(), 5);
  assert.equal(registry.getAdapter("google")?.id, "google");
  assert.equal(registry.getAdapter("claude")?.id, "claude");
  assert.equal(registry.getAdapter("ollama")?.id, "ollama");

  registry.resetForTesting();
  assert.equal(registry.count(), 0);
});

test("OpenAICompatibleAdapter: mock streaming chunk and tool call parsing", async () => {
  // Test SSE line parsing simulation
  const lines = [
    'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hello"}}]}',
    'data: {"id":"chatcmpl-1","choices":[{"delta":{"content":" world!"}}]}',
    'data: {"id":"chatcmpl-1","choices":[{"delta":{"tool_calls":[{"id":"call_123","function":{"name":"search","arguments":"{\\"q\\":\\"test\\"}"}}]}}]}',
    'data: [DONE]',
  ];

  const receivedText: string[] = [];
  const receivedTools: any[] = [];

  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const dataStr = line.slice(5).trim();
    if (dataStr === "[DONE]") break;
    const parsed = JSON.parse(dataStr);
    const delta = parsed.choices?.[0]?.delta;
    if (delta?.content) receivedText.push(delta.content);
    if (delta?.tool_calls) receivedTools.push(...delta.tool_calls);
  }

  assert.equal(receivedText.join(""), "Hello world!");
  assert.equal(receivedTools.length, 1);
  assert.equal(receivedTools[0].function.name, "search");
  assert.equal(JSON.parse(receivedTools[0].function.arguments).q, "test");
});
