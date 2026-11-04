// Bounded live connection probe: does this provider actually serve models right now?
// Saved credentials alone must never read as "Ready" — only a real reply counts.
// The probe asks for one exact token, reports access (never secrets, keys, URLs,
// or raw provider text), and persists a receipt the UI can show beside "Saved".
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ModelOutput } from "./model-output.js";
import { safeHostEnvironment } from "./runtime.js";
import { standaloneArgs } from "./opencode-flags.js";
import { GeminiProviderAdapter } from "./providers/gemini-adapter.js";
import { BedrockProviderAdapter } from "./providers/bedrock-adapter.js";
import { OpenAICompatibleAdapter } from "./providers/openai-adapter.js";
import { OllamaProviderAdapter } from "./providers/ollama-adapter.js";

export const PROBE_TOKEN = "OPENBOT_OK";
export const PROBE_TIMEOUT_MS = 90_000;
export const PROBE_COOLDOWN_MS = 60_000;

export interface ProviderProbeResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  error: string | null;
  testedAt: string;
}

export type ProbeSpawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export function probeAllowed(lastTestedAt: string | null, now = Date.now()): boolean {
  if (!lastTestedAt) return true;
  return now - Date.parse(lastTestedAt) >= PROBE_COOLDOWN_MS;
}

function safeProbeError(message: string): string {
  if (/timed out|ETIMEDOUT/i.test(message)) return "The connection test timed out. The provider may be slow or unreachable; try again, or choose another model.";
  if (/ENOENT|not found|not installed/i.test(message)) return "The model runtime is not installed on this host, so the test could not run.";
  if (/rate.limit|quota|usage.limit|insufficient.credit|429|额度不足/i.test(message)) return "The provider reached a usage or rate limit. Wait for its allowance to reset, then test again.";
  if (/401|403|unauthorized|forbidden|rejected.*(sign|access|key)/i.test(message)) return "The provider rejected its sign-in or key. Reconnect it, then test again.";
  if (/500|502|503|504|unavailable|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed/i.test(message)) return "The provider is unreachable or temporarily unavailable. Check the connection, then test again.";
  return "The provider did not answer the connection test. Check the connection, then test again.";
}

export async function probeProviderModel(model: string, extraEnv: Record<string, string> = {}, spawnProcess: ProbeSpawn = spawn, timeoutMs = PROBE_TIMEOUT_MS): Promise<ProviderProbeResult> {
  const started = Date.now();

  // 1. Direct Google Gemini adapter test
  const geminiKey = extraEnv.GEMINI_API_KEY || (model.includes("gemini") ? extraEnv.OPENBOT_MODEL_API_KEY : undefined) || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    const gemini = new GeminiProviderAdapter(geminiKey);
    const val = await gemini.validateConfiguration({ apiKey: geminiKey, model });
    return {
      ok: val.ok,
      model,
      latencyMs: val.latencyMs ?? (Date.now() - started),
      error: val.error ?? null,
      testedAt: new Date().toISOString(),
    };
  }

  // 2. Direct Ollama adapter test
  if (model.startsWith("ollama/") || extraEnv.OPENBOT_MODEL_BASE_URL?.includes("11434")) {
    const ollama = new OllamaProviderAdapter({
      baseUrl: extraEnv.OPENBOT_MODEL_BASE_URL,
      defaultModel: model.replace(/^ollama\//, ""),
    });
    const val = await ollama.validateConfiguration();
    return {
      ok: val.ok,
      model,
      latencyMs: val.latencyMs ?? (Date.now() - started),
      error: val.error ?? null,
      testedAt: new Date().toISOString(),
    };
  }

  // 2. Direct AWS Bedrock adapter test
  const isBedrock = model.startsWith("bedrock/") || model.startsWith("us.anthropic.") || model.startsWith("amazon.nova") || Boolean(extraEnv.AWS_ACCESS_KEY_ID || extraEnv.AWS_REGION);
  if (isBedrock && (extraEnv.AWS_ACCESS_KEY_ID || extraEnv.AWS_REGION || process.env.AWS_REGION)) {
    const bedrock = new BedrockProviderAdapter({
      region: extraEnv.AWS_REGION,
      accessKeyId: extraEnv.AWS_ACCESS_KEY_ID,
      secretAccessKey: extraEnv.AWS_SECRET_ACCESS_KEY,
      sessionToken: extraEnv.AWS_SESSION_TOKEN,
      modelId: model.replace(/^bedrock\//, ""),
    });
    const val = await bedrock.validateConfiguration();
    return {
      ok: val.ok,
      model,
      latencyMs: val.latencyMs ?? (Date.now() - started),
      error: val.error ?? null,
      testedAt: new Date().toISOString(),
    };
  }

  // 3. Direct OpenAI-Compatible adapter test
  if (extraEnv.OPENBOT_MODEL_BASE_URL || extraEnv.OPENAI_BASE_URL) {
    const openai = new OpenAICompatibleAdapter({
      baseUrl: extraEnv.OPENBOT_MODEL_BASE_URL || extraEnv.OPENAI_BASE_URL,
      apiKey: extraEnv.OPENBOT_MODEL_API_KEY || extraEnv.OPENAI_API_KEY,
      defaultModel: model,
    });
    const val = await openai.validateConfiguration();
    return {
      ok: val.ok,
      model,
      latencyMs: val.latencyMs ?? (Date.now() - started),
      error: val.error ?? null,
      testedAt: new Date().toISOString(),
    };
  }

  // 4. Default: OpenCode process runner
  const workspace = mkdtempSync(path.join(tmpdir(), "openbot-provider-probe-"));
  const finish = (ok: boolean, error: string | null): ProviderProbeResult => {
    try { rmSync(workspace, { recursive: true, force: true }); } catch { /* ignore Windows lock cleanup race */ }
    return { ok, model, latencyMs: Date.now() - started, error, testedAt: new Date().toISOString() };
  };
  let child: ChildProcess;
  try {
    child = spawnProcess("opencode", ["run", "--format", "json", "--model", model, ...standaloneArgs(), `Reply with the exact text ${PROBE_TOKEN} on its own line. Do not call any tools.`],
      { cwd: workspace, stdio: ["ignore", "pipe", "pipe"], env: safeHostEnvironment({ ...extraEnv, OPENCODE_DISABLE_SHARE: "true" }), ...(spawnProcess === spawn && process.platform === "win32" ? { shell: true } : {}) });
  } catch {
    return finish(false, safeProbeError("runtime not installed"));
  }
  const output = new ModelOutput("opencode");
  let stderr = "";
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean, error: string | null) => { if (!settled) { settled = true; resolve(finish(ok, error)); } };
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* already exited */ } done(false, safeProbeError("timed out")); }, timeoutMs);
    timer.unref();
    child.stdout?.on("data", (chunk: unknown) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue;
        try { output.add(JSON.parse(line) as Record<string, unknown>); }
        catch { stderr = `${stderr}\n${line}`.slice(-4_000); }
      }
    });
    child.stderr?.on("data", (chunk: unknown) => { stderr = `${stderr}${String(chunk)}`.slice(-4_000); });
    child.on("error", () => { clearTimeout(timer); done(false, safeProbeError("runtime not installed")); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = output.finalText;
      if (code === 0 && text.includes(PROBE_TOKEN)) done(true, null);
      else done(false, safeProbeError(output.failure || stderr || `exit ${code}`));
    });
  });
}
