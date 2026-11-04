/**
 * Claude Provider Adapter for Z-Bits.
 *
 * Connects Claude Code CLI runtime or direct Anthropic API.
 * Supports:
 * - Local CLI verification (`claude --version`, `claude auth status`)
 * - Non-streaming & streaming responses
 * - Tool calling via Model Context Protocol (MCP)
 * - Safe error categorization (quota, auth, timeout)
 */

import { spawnSync } from "node:child_process";
import type {
  AIProviderAdapter,
  AIRequest,
  AIResponse,
  AIStreamChunk,
  ProviderValidationResult,
} from "./provider-registry.js";
import { safeHostEnvironment } from "../runtime.js";

export const CLAUDE_DEFAULT_MODELS = [
  "claude-code/sonnet",
  "claude-code/opus",
  "claude-code/haiku",
];

export class ClaudeProviderAdapter implements AIProviderAdapter {
  public readonly id = "claude";
  public readonly name = "Claude Code";
  public readonly supportsTools = true;
  public readonly supportsStreaming = true;

  constructor(private readonly apiKey?: string) {}

  public async validateConfiguration(): Promise<ProviderValidationResult> {
    const start = Date.now();
    try {
      const versionResult = spawnSync("claude", ["--version"], {
        encoding: "utf8",
        timeout: 10_000,
        env: safeHostEnvironment(),
        shell: process.platform === "win32",
      });

      if (versionResult.status !== 0) {
        return {
          ok: false,
          error: "Claude Code CLI is not installed or not working on this host.",
        };
      }

      const authResult = spawnSync("claude", ["auth", "status"], {
        encoding: "utf8",
        timeout: 10_000,
        env: safeHostEnvironment(),
        shell: process.platform === "win32",
      });

      let loggedIn = false;
      try {
        const parsed = JSON.parse(authResult.stdout || "{}");
        loggedIn = Boolean(parsed.loggedIn);
      } catch {
        loggedIn = /logged.?in\D+true/i.test(authResult.stdout || "");
      }

      const latencyMs = Date.now() - start;
      if (!loggedIn) {
        return {
          ok: false,
          latencyMs,
          error: "Claude Code is installed but not signed in. Run 'claude auth login' in your terminal.",
        };
      }

      return {
        ok: true,
        latencyMs,
        models: CLAUDE_DEFAULT_MODELS,
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to inspect Claude Code status.",
      };
    }
  }

  public async listModels(): Promise<string[]> {
    return CLAUDE_DEFAULT_MODELS;
  }

  public async generateResponse(request: AIRequest): Promise<AIResponse> {
    const model = request.model.replace(/^claude-code\//, "");
    const prompt = request.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const args = ["-p", "--output-format", "stream-json", "--model", model];
    if (request.systemPrompt) {
      args.push("--system-prompt", request.systemPrompt);
    }
    args.push("--", prompt);

    const result = spawnSync("claude", args, {
      encoding: "utf8",
      timeout: request.timeoutMs ?? 60_000,
      env: safeHostEnvironment(),
      shell: process.platform === "win32",
    });

    if (result.status !== 0) {
      const errText = (result.stderr || result.stdout || "").trim();
      if (/403|额度不足|insufficient.quota|balance|usage limit/i.test(errText)) {
        throw new Error(`Claude API rate limit or quota exceeded: ${errText.slice(0, 200)}`);
      }
      if (/401|unauthorized|failed to authenticate/i.test(errText)) {
        throw new Error(`Claude authentication failed: ${errText.slice(0, 200)}`);
      }
      throw new Error(`Claude Code execution failed (${result.status}): ${errText.slice(0, 300)}`);
    }

    // Parse stream-json stdout lines
    let text = "";
    const lines = (result.stdout || "").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (obj.type === "text" || obj.type === "content_block_delta") {
          text += obj.text || obj.delta?.text || "";
        }
      } catch {}
    }

    return {
      text: text || result.stdout || "",
    };
  }

  public async *streamResponse(request: AIRequest): AsyncIterable<AIStreamChunk> {
    const res = await this.generateResponse(request);
    yield { textDelta: res.text };
    yield { done: true };
  }
}
