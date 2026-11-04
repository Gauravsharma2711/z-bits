# Z-Bits — Current State & Technical Audit Report

**Date of Audit:** 4 November 2026  
**Auditor Roles:** Principal Software Architect, Senior Full-Stack Engineer, AI Infrastructure Engineer, Security Engineer, Technical Project Manager  
**Project:** Z-Bits  
**Tagline:** Your agents. Your rules. Your money.  
**Upstream Base:** [PrisacariuRobert/sidemates](https://github.com/PrisacariuRobert/sidemates) (`v0.42.0`)  
**Audit & Stability Status:** Phase 00 (Audit) COMPLETE; Phase 01 (Core Stability & Windows Process Spawning Fixes) COMPLETE

---

## A. Repository Condition

- **Workspace Path:** `C:\Gaurav's Den\crazy-shits\z-bits`
- **Git Status:** Standalone directory; no active `.git` directory exists within this workspace (`fatal: not a git repository`).
- **Current Branch:** N/A (no local Git repository initialized).
- **Commit History:** N/A locally. Upstream source version identified as `v0.42.0` (commit baseline from upstream Sidemates repository on 4 Nov 2026).
- **Remotes:** None configured.
- **Modifications on Disk:**
  - Complete Sidemates application tree cloned and preserved.
  - Initial Z-Bits rebranding applied to core entrypoints (`index.html`, `studio.html`, `public/manifest.webmanifest`, `src/studio/Studio.tsx`, `src/studio/WorkspaceOverview.tsx`, `src/studio/ZbitsOverview.tsx`, `src/studio/SpendingRulesPanel.tsx`).
  - Z-Bits domain extensions scaffolded:
    - `src/shared/zbits-types.ts`
    - `src/shared/zbits-personas.ts`
    - `src/server/gate/gate-engine.ts` & `src/server/gate/gate-engine.test.ts`
    - `src/server/runner/commerce-runner.ts`
    - `src/server/providers/gemini-adapter.ts`
    - `src/server/providers/bedrock-adapter.ts`
    - `src/server/providers/openai-adapter.ts`
    - `src/server/providers/provider-registry.ts`
    - `src/server/providers/provider-adapters.test.ts`
- **GitHub CLI Status:** `gh` CLI is not installed or not in system PATH.
- **Local-Only Development Readiness:** 100% ready. All dependencies installed in `node_modules`. Node v22.20.0 and npm 11.13.0 operational.

---

## B. Technology Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Runtime | Node.js | `v22.20.0` | Server runtime with built-in `node:sqlite` (`DatabaseSync`) |
| Package Manager | npm | `11.13.0` | Dependency and script management |
| Frontend Framework | React | `19.2.8` | UI component library (Studio SPA) |
| Frontend Bundler | Vite | `8.2.2` | Fast HMR dev server & production client bundling |
| Language | TypeScript | `7.0.2` | Strict typed frontend, backend, and shared schemas |
| Backend Server | Express | `5.2.1` | REST and WebSocket API gateway |
| Database Engine | SQLite (Node Native) | Built-in (`node:sqlite`) | Local-first relational database (`.openbot/openbot.sqlite`) |
| Validation | Zod | `4.5.4` | Schema parsing and runtime API validation |
| AI SDKs | `@google/genai` | `^2.32.0` | Official Google Gemini Client SDK |
| AI SDKs | `@aws-sdk/client-bedrock-runtime` | `^3.1161.0` | Official AWS Bedrock Converse API SDK |
| Agent Bridge | Model Context Protocol | `sdk ^1.32.1`, `client 2.3.1` | MCP server & tool dispatch (`claude-mcp.mjs`) |
| Icons / UI | `lucide-react` | `^1.41.0` | Modern UI icon library |
| Markdown | `react-markdown` + `remark-gfm` | `10.1.0` / `4.0.1` | Rich chat rendering |
| External CLIs | OpenCode | `1.18.31` | External agent execution runtime |
| External CLIs | Claude Code | `2.1.193` | External agent execution runtime |

---

## C. Architecture

### Full-Stack Architecture Diagram

```mermaid
graph TD
    subgraph UI ["Z-Bits Studio (Frontend - React 19 / Vite 8)"]
        A[index.html / studio.html] --> B[Studio.tsx]
        B --> C[ZbitsOverview.tsx]
        B --> D[Chat & Threads]
        B --> E[SpendingRulesPanel.tsx]
        B --> F[AI Connections & Settings]
    end

    subgraph API ["Z-Bits Server Gateway (Express 5 - Port 4311)"]
        G["HTTP & WebSocket APIs (/api/*)"]
        H["readProviderStatus / ProviderConnectionManager"]
    end

    subgraph Personas ["Z-Bits Persona Mapping Layer"]
        I["Maya (Concierge) -> nova"]
        J["Bolt (Bounty) -> pixel"]
        K["Sage (Occasion) -> scout"]
    end

    subgraph Runtime ["Preserved Agent Runtime (Sidemates)"]
        L[OpenCodeRunner]
        M[claude-mcp.mjs / Tool Dispatch]
        N[SQLite Storage: .openbot/openbot.sqlite]
    end

    subgraph Providers ["Universal AI Provider Registry"]
        O[Google Gemini: @google/genai]
        P[AWS Bedrock: @aws-sdk]
        Q[OpenAI-Compatible Adapter]
        R[Claude Code / OpenCode CLI]
    end

    subgraph GateRunner ["Deterministic Financial Services"]
        S["Gate Financial Engine (gate-engine.ts)"]
        T["SpendPass Token (Signed / Scoped / Expiring)"]
        U["Runner Execution Service (commerce-runner.ts)"]
        V["Bitrefill Commerce Adapter (Phase 05)"]
        W["Zcash NU7 Shielded Adapter (Phase 07)"]
    end

    UI -->|HTTP / WS| API
    API --> Personas
    Personas --> Runtime
    Runtime --> Providers
    Runtime --> M
    Runtime --> N
    
    %% Intent flow
    UI -->|Create Purchase Intent| S
    S -->|Evaluate Policy & Shared Ledger| S
    S -->|Issue Signed SpendPass| T
    T -->|Verify Signature & Scope| U
    U --> V
    U --> W
```

### Component Breakdown
1. **Frontend (`src/studio/`):** React 19 single-page application. Serves the web studio interface, sidebar navigation, activity feed, chat streams, settings, and Z-Bits specific panels (`ZbitsOverview.tsx`, `SpendingRulesPanel.tsx`).
2. **Backend (`src/server/index.ts`):** Express 5 application on port `4311`. Provides authenticated REST routes for threads, bots, activities, approvals, AI provider configuration, and Gate/Runner endpoints.
3. **Database (`src/server/database.ts`):** Encapsulates `DatabaseSync` on `.openbot/openbot.sqlite`. Holds schema definitions and transactional queries for bots, messages, runs, activities, approvals, and memories.
4. **Agent Runtime (`src/server/opencode.ts`):** Manages the execution lifecycle via `OpenCodeRunner`. Polls queued runs, formats prompts, attaches MCP tools, and spawns the appropriate execution process (`opencode` or `claude`).
5. **Provider Layer (`src/server/providers/`):** Implements `AIProviderAdapter` for Google Gemini, AWS Bedrock, and OpenAI-compatible endpoints, alongside legacy OpenCode/Claude provider probes.
6. **Gate & Runner (`src/server/gate/`, `src/server/runner/`):** Deterministic financial policy evaluation engine and authorized commerce dispatch service.

---

## D. Rebranding Condition

### 1. User-Facing Surfaces Verified
- **Application Titles:** Rebranded to "Z-Bits — Your Agents. Your Rules. Your Money." in [index.html](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/index.html) and [studio.html](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/studio.html).
- **Icons & Favicons:** Rebranded in `public/icon.svg` and `public/manifest.webmanifest`.
- **Studio Shell & Header:** Rebranded to Z-Bits in [Studio.tsx](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/studio/Studio.tsx).
- **Dashboard & Overview:** Added `ZbitsOverview.tsx` and `SpendingRulesPanel.tsx` using Z-Bits visual design tokens (deep navy `#070a13`, electric blue `#2563eb`, violet `#7c3aed`).
- **Personas:** Display name mapping layer implemented in [zbits-personas.ts](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/shared/zbits-personas.ts) for Maya (`nova`), Bolt (`pixel`), and Sage (`scout`).

### 2. Classification of Remaining Legacy Strings
Across the repository, legacy strings were audited and classified into 6 categories:
1. **USER-FACING LEGACY BRANDING (Edge occurrences to polish):**
   - [src/CapabilityPanels.tsx#L5027](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/CapabilityPanels.tsx#L5027): `.sidemates.json` download extension label.
   - [src/components/ExtensionsPanel.tsx#L678](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/components/ExtensionsPanel.tsx#L678): Text referring to `.sidemates-skill.json`.
   - [src/server/share-result.tsx#L83](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/server/share-result.tsx#L83): Footer text "Made with Sidemates".
2. **INTERNAL IDENTIFIERS (Preserve strictly):**
   - `OPENBOT_*` environment variables (`OPENBOT_PORT`, `OPENBOT_DATA_DIR`, `OPENBOT_HOST`).
   - `.openbot/` local data directory and `openbot.sqlite` database file.
   - `mcp__openbot__*` MCP tool registration namespaces in [src/server/opencode.ts](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/server/opencode.ts).
   - Bundle identifiers such as `app.openbot.mobile`.
   - Internal bot IDs: `nova`, `pixel`, `scout`.
3. **UPSTREAM ATTRIBUTION (Preserve strictly):**
   - [UPSTREAM_NOTICES.md](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/UPSTREAM_NOTICES.md) and [README.md](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/README.md) documenting origin `https://github.com/PrisacariuRobert/sidemates`.
4. **LEGAL NOTICES (Preserve strictly):**
   - [LICENSE](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/LICENSE) (MIT License, Copyright 2026 Robert Prisacariu).
   - [THIRD_PARTY_NOTICES.md](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/THIRD_PARTY_NOTICES.md).
5. **HISTORICAL DOCUMENTATION (Retain for reference):**
   - [CHANGELOG.md](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/CHANGELOG.md) documenting upstream releases `v0.1.0` through `v0.42.0`.
6. **EXTERNAL DEPENDENCY OR CONFIGURATION (Preserve):**
   - `package.json` package name `"sidemates"`.
   - Desktop and deployment configurations referencing upstream structure.

---

## E. Existing Functionality (Verified)

1. **Compilation & Typechecking:**
   - `npm run check` (`tsc --noEmit`): **PASSED** (0 errors).
   - `npm run check:acceptance` (`tsc --noEmit -p tsconfig.acceptance.json`): **PASSED** (0 errors).
2. **Production Bundle Build:**
   - `npm run build` (`vite build`): **PASSED** in 2.46s. Chunks and CSS assets generated cleanly in `dist/`.
3. **Unit Test Suites:**
   - `src/server/gate/gate-engine.test.ts`: **PASSED** (Tests deterministic transaction caps, daily limits, approval thresholds, idempotency digest, signature generation & verification).
   - `src/server/providers/provider-adapters.test.ts`: **PASSED** (Tests Gemini, Bedrock, and OpenAI-compatible adapter interfaces).
   - `src/shared/**/*.test.ts`: **PASSED** (93/93 unit tests passed, including approval previews, calendar schedules, redaction, and persona mappings).
4. **Backend Server Startup:**
   - Express server starts cleanly on Node v22.20.0 and binds to `http://127.0.0.1:4311`.
   - Tested live endpoints returning HTTP 200:
     - `GET /api/readiness` -> HTTP 200
     - `GET /api/provider` -> HTTP 200
     - `GET /api/gate/policy` -> HTTP 200
     - `GET /api/gate/audit` -> HTTP 200
     - `GET /api/runner/integrations` -> HTTP 200

---

## F. Broken Functionality (Root Cause Analysis & Status)

### Defect 1: Windows Process Spawning Failure for CLI Probes [RESOLVED]
- **Exact File Path:** [src/server/providers.ts#L34](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/server/providers.ts#L34)
- **Relevant Function:** `execute(command: string, args: string[], ...)`
- **Actual Error (Prior to Fix):** `Error: spawn EINVAL` or `code: 1`
- **Resolution Applied in Phase 01:**
  1. Updated `safeHostEnvironment()` in `src/server/runtime.ts` to preserve Windows system variables (`SystemRoot`, `COMSPEC`, `PATHEXT`, `APPDATA`, `LOCALAPPDATA`, `USERPROFILE`, `TEMP`, `TMP`) and include `%APPDATA%\npm` in the lookup path.
  2. Added `{ shell: process.platform === "win32" }` to child process executions in `src/server/providers.ts`, `src/server/runtime-compatibility.ts`, `src/server/opencode-flags.ts`, `src/server/claude-health.ts`, `src/server/opencode.ts`, and `src/server/runtime-boundary.ts`.
  3. Added conditional shell support and safe file cleanup in `src/server/provider-test.ts`.
- **Verification:** Unit tests in `provider-test.test.ts` pass 6/6. `GET /api/readiness` reports `ready: true`, OpenCode `1.18.31` verified on host.

### Defect 2: Port Miscommunication in Console Log [RESOLVED]
- **Exact File Path:** [src/server/index.ts#L5384](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/src/server/index.ts#L5384)
- **Resolution Applied in Phase 01:** Updated console log message to clearly distinguish Express API port (`4311`) from Studio web UI port (`4310`): `Z-Bits is awake on http://${host}:${port} (Studio web UI at http://${host}:4310)`.
- **Verification:** Server logs output exact target URLs; `.env.example` defaults to `OPENBOT_PORT=4311`.

---

## G. Missing Functionality (Gaps vs Product Requirements)

1. **Gate Recipient Resolution & Aliases:**
   - Current `gate-engine.ts` only checks basic in-memory whitelist `["self", "authorized_contact", "gift_registry"]`.
   - Missing: Canonical `recipient_id` registry, normalized alias resolution (phone, email, nick), and recipient-specific spending caps.
2. **Shared Cross-Agent Spending Ledger:**
   - Current `gate-engine.ts` tracks spend in an ephemeral in-memory `Map`. A server restart resets daily and monthly usage to zero.
   - Missing: Persistent SQLite table for `spending_ledger` tracking cumulative spend by canonical recipient across Maya, Bolt, and Sage.
3. **Atomic Budget Reservation & Lifecycle:**
   - Missing 2-phase commit: `reserveBudget()` -> `settleBudget()` / `releaseBudget()`.
4. **SpendPass Token Structure:**
   - Current `SignedPurchaseAuthorization` lacks: cryptographic nonce, recipient ID binding, allowed merchant/denomination constraints, expiration revocation, and single-use invalidation ledger.
5. **Real Bitrefill Fulfillment (Runner):**
   - Current `BitrefillAdapter` in `commerce-runner.ts` returns dummy/stub data.
   - Missing: Real Bitrefill API client (`search-products`, `get-product-details`, `buy-products`, `get-invoice-by-id`) and status polling until `delivered`.
6. **Genuine Shielded Zcash NU7 Transaction Evidence:**
   - Current `ZcashAdapter` returns mock strings (`tx_mock_...`).
   - Missing: Integration with NU7 testnet tool/CLI generating verifiable on-chain shielded transactions with opaque order reference memos.
7. **Cross-Agent Demo Flow (Maya & Bolt):**
   - Missing integration connecting Maya chat intents and Bolt reward events into the shared Gate engine.

---

## H. AI Provider & API Connectivity Findings

1. **Installed Runtime Environment:**
   - `opencode`: Version `1.18.31` (Matches `VERIFIED_OPENCODE_VERSION` in `runtime-compatibility.ts`). Verified working via `GET /api/readiness` and `provider-test.test.ts`.
   - `claude`: Version `2.1.193` (Claude Code CLI installed).
2. **Provider Adapters Status:**
   - `GeminiProviderAdapter`: Unit tested, supports `@google/genai`. Ready for live credential testing in Phase 02.
   - `BedrockProviderAdapter`: Unit tested, supports Converse API via `@aws-sdk/client-bedrock-runtime`. Ready for live credential testing in Phase 02.
   - `OpenAICompatibleAdapter`: Unit tested, supports generic OpenAI-compatible base URLs.
3. **Provider Selection & Storage:**
   - Handled via `src/server/providers.ts` and `src/shared/provider-config.ts`.
   - Preserves upstream database tables `provider_instances`.

---

## I. Agent Runtime Preservation Recommendations

The following core components of the Sidemates runtime MUST remain intact:
1. **Internal Bot IDs:** `nova`, `pixel`, `scout`. Do NOT rename these in database columns or runtime code. All mapping to Maya, Bolt, and Sage must happen in the presentation layer (`zbits-personas.ts`).
2. **`OpenCodeRunner` (`src/server/opencode.ts`):** The entire run claim, step metering, workspace isolation, attachment handling, and tool execution system must be preserved.
3. **MCP Tool Bridge (`claude-mcp.mjs`):** Preserves all internal tool registrations (`workspace_read`, `workspace_write`, browser controls, memory search).
4. **SQLite Database Model (`src/server/database.ts`):** Preserves all existing tables and migration logic. New Z-Bits features must add tables (`recipients`, `spending_ledger`, `spendpass_tokens`), never alter existing columns destructively.

---

## J. Database & Security Audit

### 1. Database Architecture
- SQLite database stored at `.openbot/openbot.sqlite` via Node 22 native `node:sqlite`.
- WAL journal mode active (`openbot.sqlite-wal`).
- Existing schema contains 35+ tables managing bots, messages, runs, activities, approvals, and routines.
- 3 starter teammate bots seeded in Phase 01: `nova` (Maya), `pixel` (Bolt), `scout` (Sage).

### 2. Security Checks
- **Secrets in Source:** No API keys, private keys, or wallet credentials detected in tracked files.
- **Secret Vault:** Secret management implemented in `src/server/vault.ts` with AES-256-GCM encryption for stored provider secrets.
- **Gate Determinism:** Verified that `GateEngine` makes mathematical decisions without delegating to an LLM.
- **Fail-Closed Rule:** Verified that unconfigured integrations return `disabled` or `failed` rather than falling through to mock execution.

---

## K. Technical Risks (Ranked by Severity)

| Severity | Risk | Impact | Mitigation Plan / Status |
|---|---|---|---|
| **RESOLVED** | Windows CLI `spawn` failure | Prevents `opencode` discovery in `providers.ts`, marking runtime unavailable in UI. | **RESOLVED IN PHASE 01**: Fixed `safeHostEnvironment()` and added conditional `shell: true` on Windows. |
| **HIGH** | In-Memory Gate Ledger | Server restart clears budget and replay tracking, violating deterministic guarantees. | Migrate ledger, reservations, and SpendPass nonces to SQLite in Phase 03/04. |
| **MEDIUM** | Bitrefill API credentials & rate limits | Live purchase or invoice polling fails if API keys or event credits are missing. | Validate Bitrefill API keys with test catalog search before issuing real orders. |
| **MEDIUM** | Zcash NU7 Testnet tool compatibility | Outdated testnet SDKs may fail to synchronize or construct valid NU7 shielded proofs. | Use verified CLI/SDK from hackathon developer pack; verify testnet faucet balance. |
| **LOW** | Legacy string leaks in edge dialogs | User encounters "Sidemates" in export filenames or share cards. | Polish edge dialog text in Phase 08. |

---

## L. Recommended Next Phase

**Proceed to Phase 02 — AI Provider Validation:**
1. Test live provider connectivity with configured credentials (Google Gemini, AWS Bedrock, OpenAI-compatible).
2. Validate streaming response handling and error propagation under live network conditions.
3. Verify that provider credentials remain strictly encrypted in the server vault and never reach client code.
4. Keep Phase 03+ (Gate recipient registry & shared ledger) paused until provider validation is confirmed.

