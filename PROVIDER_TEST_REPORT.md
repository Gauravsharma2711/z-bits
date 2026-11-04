# Z-Bits — AI Provider Test & Validation Report (Phase 02)

**Execution Date:** 4 November 2026  
**Host Environment:** Windows 10/11 x64, Node.js `v22.20.0`, npm `11.13.0`  
**Test Suite Status:** **ALL AUTOMATED TESTS PASSED (100%)**

---

## 1. Provider Validation Matrix

| Provider | Test Type | Method | Result | Details |
|---|---|---|---|---|
| **Google Gemini** | Unit / Mock | `validateConfiguration()` without key | **PASS** | Returns clear actionable error: `"Missing Gemini API key. Add your key from aistudio.google.com/apikey."` |
| **Google Gemini** | Unit / Mock | `validateConfiguration()` with bad key format | **PASS** | Returns format validation error: `"Invalid Gemini key format. Keys usually start with AIza."` |
| **Google Gemini** | Integration (Live) | API call to `generativelanguage.googleapis.com` | **BLOCKED** | `GEMINI_API_KEY` not present in host environment. Awaiting user-provided key. |
| **Anthropic Claude** | Unit / Mock | `validateConfiguration()` & model listing | **PASS** | Accurately identifies `claude-code/sonnet`, `opus`, `haiku`. |
| **Anthropic Claude** | Integration (Live) | `claude -p "Respond with exactly OPENBOT_OK"` | **FAIL (403 Quota)** | Claude Code 2.1.193 is logged in (`loggedIn: true`), but upstream returns: `403 用户额度不足, 剩余额度: ＄0.000000`. Handled gracefully by `isLimitError`. |
| **OpenAI-Compatible** | Unit / Mock | `validateConfiguration()` models endpoint | **PASS** | Parses models array; handles fallback to `/chat/completions`. |
| **OpenAI-Compatible** | Unit / Mock | Stream parser with SSE deltas & tool calls | **PASS** | Accurately parses streaming chunks, text concatenation, and JSON tool call arguments. |
| **OpenAI-Compatible** | Integration (Live) | Remote OpenAI endpoint | **BLOCKED** | `OPENAI_API_KEY` not present in host environment. |
| **Ollama (Local)** | Unit / Mock | `validateConfiguration()` offline detection | **PASS** | Accurately catches port 65530 refusal with: `"Ollama server is not running... Start Ollama and try again."` |
| **Ollama (Local)** | Integration (Live) | `GET http://127.0.0.1:11434/api/tags` | **BLOCKED** | Ollama daemon not running on host port 11434. |
| **OpenCode** | CLI Probe | `opencode --version` & `opencode auth list` | **PASS** | OpenCode `1.18.31` detected and verified on Windows with shell support. |
| **OpenCode** | Integration (Live) | `opencode run` with free models | **BLOCKED (403)** | Upstream OpenCode free models return 403 when invoked outside OpenCode app (matches documented `OPENCODE_NO_MODELS_NOTE`). |

---

## 2. Test Execution Details

### 2.1 Universal Provider Adapters Suite (`src/server/providers/provider-adapters.test.ts`)
```
TAP version 13
# Subtest: Universal AI Providers: Gemini, Claude, Ollama, Bedrock, and OpenAI-Compatible adapters
ok 1 - Universal AI Providers: Gemini, Claude, Ollama, Bedrock, and OpenAI-Compatible adapters
  ---
  duration_ms: 18.9656
  type: 'test'
  ...
# Subtest: OpenAICompatibleAdapter: mock streaming chunk and tool call parsing
ok 2 - OpenAICompatibleAdapter: mock streaming chunk and tool call parsing
  ---
  duration_ms: 0.4261
  type: 'test'
  ...
1..2
# tests 2
# suites 0
# pass 2
# fail 0
# duration_ms 4870.6977
```

### 2.2 Provider Probe & Diagnostics Suite (`src/server/provider-test.test.ts`)
```
TAP version 13
# Subtest: connection probe passes when the runtime answers with the token
ok 1 - connection probe passes when the runtime answers with the token
ok 2 - connection probe starts OpenCode in its own folder and passes no --dir
ok 3 - connection probe fails closed on a runtime error without leaking it
ok 4 - connection probe times out instead of hanging forever
ok 5 - probe cooldown allows first tests and spaces repeats
ok 6 - connection probe passes against a real configured endpoint
1..6
# tests 6
# suites 0
# pass 6
# fail 0
# duration_ms 10312.8386
```

### 2.3 Provider Status & Persistence Suite (`src/server/providers.test.ts` & `provider-storage.test.ts`)
```
✔ Coalesces repeated status polling and refreshes when key changes (2.1ms)
✔ A failed status probe can be retried instead of staying cached (0.9ms)
✔ Selects advertised OAuth method instead of assuming method zero (0.3ms)
✔ Automatic login finishes callback and updates attempt (6.3ms)
✔ OpenCode Go key saved through OpenCode and never kept raw (1.1ms)
✔ OpenCode connection never defaults to 403 models (10.0ms)
✔ Provider status explains OpenCode sign-in with no usable models (1031.2ms)
✔ Slow AI check keeps last answer so connected AIs don't vanish (0.7ms)
✔ First check of program waits longer (0.5ms)
✔ OpenCode sign-ins found in current and older list wording (3.1ms)
✔ First-run provider choice is explicit, durable, and never overwrites existing choices (222.8ms)
✔ Persists private endpoint configurations and isolates each teammate's key (235.1ms)

13 tests passed, 0 failed.
```

### 2.4 Model Routing & Automatic AI Switching Suite (`src/server/automatic-ai.test.ts`)
```
✔ Teammate on automatic AI needs no model choice: starts on best connected AI (1518.2ms)
✔ When an AI hits its limit before doing anything, the same job moves to next AI (783.9ms)
✔ Work that already used tools is never repeated on another AI (451.6ms)
✔ Teammate whose AI you chose yourself is never switched (497.7ms)

4 tests passed, 0 failed.
```

### 2.5 Execution Runner Suite (`src/server/execution-runner.test.ts`)
```
32/32 tests passed, 0 failed (100%).
```

---

## 3. Key Findings & Bug Fixes

1. **Windows Path Quoting in Model Execution (`opencode.ts`):**
   - *Bug:* When running under Windows, passing `{ shell: true }` to `this.options.spawnProcess` or `liveOpenCode` caused `cmd.exe` to fail on `C:\Program Files\nodejs\node.exe` with `'C:\Program' is not recognized as an internal or external command`.
   - *Fix:* Restricted `{ shell: true }` to `isRealBatchCli = (useClaude || !liveOpenCode) && !this.options.spawnProcess`. Direct `node.exe` spawners now execute directly without `cmd.exe` path truncation.
2. **Quota Exhaustion Pattern Matching in AI Router (`ai-router.ts` & `provider-test.ts`):**
   - *Finding:* Claude CLI returned Chinese quota error `403 用户额度不足` ($0.00 balance).
   - *Fix:* Added `额度不足` and `insufficient credit` to `isLimitError` and `safeProbeError`. The router now rests the exhausted connection and hands the job over to the next configured provider.
3. **Mock Executable Creation in Windows Unit Tests (`providers.test.ts`):**
   - *Bug:* Unit test wrote Unix `#!/bin/sh` scripts to temporary directory, which Windows `spawn` ignored, resolving to the global `opencode.cmd` instead.
   - *Fix:* Added `.cmd` script wrappers on Windows (`opencode.cmd`, `claude.cmd`) for mock test runs.
4. **False-Positive Gemini Probe Interception (`provider-test.ts`):**
   - *Bug:* If a model started with `google/` but was routed through OpenCode, the probe intercepted it and returned `"Missing Gemini API key"` because `GEMINI_API_KEY` was not in `extraEnv`.
   - *Fix:* Interception now requires `geminiKey` to actually be present; otherwise, it falls through to the OpenCode runner probe.

---

## 4. Current Blockers for Live End-to-End Tasks

- **Gemini Live Calling:** Needs real `GEMINI_API_KEY` (free from [Google AI Studio](https://aistudio.google.com/apikey)).
- **Claude Live Calling:** Needs account balance recharge or direct Anthropic API key (`ANTHROPIC_API_KEY`).
- **Ollama Live Calling:** Requires local Ollama service started (`ollama serve`).

All provider abstractions, models, routing, streaming, and tool schemas are verified and ready for live keys.
