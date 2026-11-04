# Z-Bits — Core Stability & Regression Report (Phase 01)

**Date:** 4 November 2026  
**Status:** COMPLETE  
**Auditor / Engineer:** Principal Software Architect & Senior Full-Stack Engineer  
**Workspace:** `C:\Gaurav's Den\crazy-shits\z-bits`  
**Host Platform:** Windows 10/11 (win32, x64), Node.js `v22.20.0`, npm `11.13.0`  
**Target Application:** Z-Bits (Forked from Sidemates `v0.42.0`)

---

## 1. Executive Summary

During Phase 01, we resolved the core platform stability blockers identified in Phase 00, focusing on Windows process spawning mechanics, path sanitization, environment variable propagation, database readiness, and provider test reliability. 

All core application services and verification test suites are now passing:
- **TypeScript Typecheck (`npm run check`):** Passed (0 errors).
- **Acceptance Typecheck (`npm run check:acceptance`):** Passed (0 errors).
- **Vite Production Client Build (`npm run build`):** Passed (1.91s bundle generation).
- **Shared Runtime & Schemas Test Suite:** 93/93 tests passing (100%).
- **Gate Engine & Provider Adapter Tests:** 2/2 suites passing (100%).
- **Provider Probe & Diagnostic Tests (`provider-test.test.ts`):** 6/6 tests passing (100%).
- **Server Readiness API (`GET /api/readiness`):** `ready: true`, OpenCode `1.18.31` verified on host, 2 AI connections connected, 3 starter teammates seeded and ready.

No architecture rewrites, global re-branding, or Phase 02+ features were introduced. Upstream Sidemates agent runtime code and internal agent IDs (`nova`, `pixel`, `scout`) have been preserved intact.

---

## 2. Issues Investigated & Root Causes

### Issue 1: Windows Process Spawning Failure (`ENOENT` / `EINVAL` on global CLIs)
- **Symptom:** Upstream `execute()` and `spawnSync` calls for `opencode` and `claude` failed on Windows with `ENOENT` or `EINVAL`, reporting that the model runtime was not installed even though OpenCode `1.18.31` and Claude Code `2.1.193` were globally installed.
- **Root Cause:**
  1. On Windows, npm global CLI binaries are wrapped in `.cmd` or `.bat` batch files (e.g. `opencode.cmd`). In Node.js >= 18.20.2 / 20.12.2 / 22.0.0, calling `child_process.spawn` or `spawnSync` directly on a `.cmd` or `.bat` file without `{ shell: true }` throws `EINVAL` or `ENOENT` due to security mitigations for CVE-2024-27980.
  2. The upstream environment sanitizer `safeHostEnvironment()` in `src/server/runtime.ts` was designed strictly for POSIX/macOS. It stripped critical Windows environment variables (`SystemRoot`, `COMSPEC`, `PATHEXT`, `APPDATA`, `LOCALAPPDATA`, `HOMEDRIVE`, `HOMEPATH`) and forced a fallback `PATH` to `"/usr/bin:/bin"`. Without `SystemRoot` and `COMSPEC`, Windows could not locate `cmd.exe` to run `.cmd` wrappers; without `PATHEXT`, extensionless commands could not resolve `.cmd` or `.exe`; without `APPDATA`, the global npm directory (`%APPDATA%\npm`) was omitted.
- **Resolution:**
  - Updated `safeHostEnvironment()` in `src/server/runtime.ts` to inspect `process.platform === "win32"`. Added Windows core environment variables to the whitelist (`SystemRoot`, `COMSPEC`, `PATHEXT`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `HOMEDRIVE`, `HOMEPATH`, `TEMP`, `TMP`). Preserved `source.Path` if `source.PATH` is absent. Added `path.join(env.APPDATA, "npm")` as a candidate path. Removed POSIX fallback on Windows.
  - Added `{ shell: process.platform === "win32" }` to child process executions in:
    - `src/server/providers.ts` (`execute`, `OpenCodeAuthBridge.ensure`, `connect`)
    - `src/server/runtime-compatibility.ts` (`spawnSync("opencode", ["--version"])`)
    - `src/server/opencode-flags.ts` (`spawnSync("opencode", ["run", "--help"])`)
    - `src/server/claude-health.ts` (`readClaudeHelp`)
    - `src/server/opencode.ts` (`defaultClaudeCheck`, `executeRun`)
    - `src/server/runtime-boundary.ts` (`spawnOpenCode`)

### Issue 2: Windows File-Lock Cleanup Race (`EBUSY` in Provider Probes)
- **Symptom:** During provider test executions (`src/server/provider-test.ts`), deleting temporary probe directories threw `EBUSY: resource busy or locked, rmdir ... openbot-provider-probe-...`.
- **Root Cause:** When child processes are killed or exited on Windows, underlying file locks or directory handles may remain briefly open. Calling `rmSync(workspace, { recursive: true, force: true })` immediately after process termination caused Windows file-lock contention.
- **Resolution:** Wrapped temporary directory removal in `try { rmSync(...) } catch {}` so cleanup failures do not terminate the server or abort diagnostic runs.

### Issue 3: Mock Test Process Incompatible with Shell Wrapping
- **Symptom:** In `src/server/provider-test.test.ts`, the first unit test failed with `SyntaxError: Unexpected token` in `cmd.exe`.
- **Root Cause:** Unit tests injected mock Node.js processes using `spawn(process.execPath, ["--input-type=module", "-e", script])`. When `shell: true` was applied unconditionally to all `spawnProcess` calls in `provider-test.ts`, `cmd.exe` received the inline script with unescaped double quotes and newlines, mangling the arguments.
- **Resolution:** Applied `shell: true` conditionally only when using the default system `spawn` for real CLI commands:
  ```typescript
  ...(spawnProcess === spawn && process.platform === "win32" ? { shell: true } : {})
  ```
  Injected mock test spawners bypass `cmd.exe` shell expansion and execute cleanly.

### Issue 4: Unix `sleep` Command in Provider Test Suite
- **Symptom:** Subtest 4 in `src/server/provider-test.test.ts` failed with `AssertionError: The model runtime is not installed on this host`.
- **Root Cause:** The test spawned `"sleep"` with `["60"]`, which does not exist natively on Windows command lines.
- **Resolution:** Replaced `spawn("sleep", ["60"], ...)` with a portable Node.js process:
  ```typescript
  spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], ...)
  ```

### Issue 5: Port Number Ambiguity & Startup Logging
- **Symptom:** `.env.example` set `OPENBOT_PORT=4310`, which collided with the Vite frontend development server on port 4310. Furthermore, the server console logged `Z-Bits is awake at http://127.0.0.1:4310` even though Express was listening on port 4311.
- **Root Cause:** Upstream code assumed production runs on `OPENBOT_PORT` while development runs Vite on `4310` proxying to Express on `4311`.
- **Resolution:**
  - Corrected `.env.example` to default `OPENBOT_PORT=4311`.
  - Updated startup log in `src/server/index.ts` line 5384 to clearly report both ports:
    ```typescript
    `Z-Bits is awake on http://${host}:${port} (Studio web UI at http://${host}:4310)`
    ```

### Issue 6: Unseeded Fresh SQLite Database
- **Symptom:** Server readiness API reported Step 3 unready (`"First teammate is not ready: No bots found."`).
- **Root Cause:** A fresh `.openbot/openbot.sqlite` file had schema tables initialized, but zero teammate bots were present.
- **Resolution:** Seeded the 3 canonical starter bots (`nova` -> Maya, `pixel` -> Bolt, `scout` -> Sage) with proper display identities and starter configurations into `bots` table. `/api/readiness` now returns `3 teammates ready.` and overall `ready: true`.

---

## 3. Summary of Modified Files

| File Path | Description of Changes |
|---|---|
| `src/server/runtime.ts` | Windows path and environment variable sanitization in `safeHostEnvironment()`. |
| `src/server/providers.ts` | Added `shell: process.platform === "win32"` to CLI execution, auth bridge, and connect calls. |
| `src/server/runtime-compatibility.ts` | Added `shell: process.platform === "win32"` to `opencode --version` check. |
| `src/server/opencode-flags.ts` | Added `shell: process.platform === "win32"` to `opencode run --help` check. |
| `src/server/claude-health.ts` | Added `shell: process.platform === "win32"` to `readClaudeHelp`. |
| `src/server/opencode.ts` | Added `shell: process.platform === "win32"` to `defaultClaudeCheck` and `executeRun`. |
| `src/server/runtime-boundary.ts` | Added `shell: process.platform === "win32"` to `spawnOpenCode`. |
| `src/server/provider-test.ts` | Added safe `try/catch` around workspace `rmSync`, conditional `shell: true` for real CLI spawns only. |
| `src/server/provider-test.test.ts` | Added `shell: process.platform === "win32"` to `runtimeAvailable`, replaced Unix `sleep` with portable Node timer. |
| `src/server/index.ts` | Clarified startup console log for Express API port (4311) vs Studio UI port (4310). |
| `.env.example` | Updated default `OPENBOT_PORT` from `4310` to `4311`. |
| `.openbot/openbot.sqlite` | Seeded 3 starter teammate bots (`nova`, `pixel`, `scout`). |

---

## 4. Verification & Readiness Evidence

### Diagnostic Readout (`GET http://127.0.0.1:4311/api/readiness`)
```json
{
  "ready": true,
  "summary": "Everything is ready for your team.",
  "steps": [
    {
      "id": "model-runtime",
      "label": "Model runtime",
      "detail": "OpenCode 1.18.31 is ready on this host.",
      "ready": true
    },
    {
      "id": "ai-connection",
      "label": "AI connection",
      "detail": "2 connected: ChatGPT, Claude.",
      "ready": true
    },
    {
      "id": "first-teammate",
      "label": "First teammate",
      "detail": "3 teammates ready.",
      "ready": true
    }
  ]
}
```

### Provider Probe (`GET http://127.0.0.1:4311/api/provider`)
- `cliAvailable`: `true`
- `version`: `"1.18.31"`
- `verifiedVersion`: `true`
- `runtime`: `"opencode"`

---

## 5. Architectural Integrity Confirmations

1. **Internal Agent Identifiers:** `nova`, `pixel`, `scout` remain completely untouched in database and server logic. Z-Bits persona names (Maya, Bolt, Sage) are resolved at the presentation layer (`src/shared/zbits-personas.ts`).
2. **Deterministic Financial Separation:** No LLM-driven budget decisions. Gate engine and provider adapters remain isolated.
3. **No Premature Feature Creep:** Gate persistence, SpendPass token generation, and Bitrefill fulfillment remain clean and deferred to their dedicated phases (Phases 03–05).
4. **Local-Only Integrity:** No remote Git pushes or credentials required.

