import test from "node:test";
import assert from "node:assert/strict";
import { GeminiProviderAdapter } from "./gemini-adapter.js";
import { BedrockProviderAdapter } from "./bedrock-adapter.js";
import { OpenAICompatibleAdapter } from "./openai-adapter.js";
import { AIProviderRegistry } from "./provider-registry.js";

test("Universal AI Providers: Gemini, Bedrock, and OpenAI-Compatible adapters", async () => {
  // 1. Google Gemini Adapter
  const gemini = new GeminiProviderAdapter("test-fake-gemini-key");
  assert.equal(gemini.id, "google");
  assert.equal(gemini.supportsTools, true);
  assert.equal(gemini.supportsStreaming, true);

  // 2. AWS Bedrock Adapter (Converse API and endpoint format)
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

  // 3. Generic OpenAI-Compatible Adapter
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

  // 4. AI Provider Registry
  const registry = new AIProviderRegistry();
  registry.register(gemini);
  registry.register(bedrockConverse);
  registry.register(genericOAI);

  assert.equal(registry.has("google"), true);
  assert.equal(registry.has("bedrock"), true);
  assert.equal(registry.has("together-ai"), true);
  assert.equal(registry.list().length, 3);
});
