# Z-Bits Adaptation & Architecture Plan

## Executive Summary
This document outlines the systematic transformation of the open-source **Sidemates** platform into **Z-Bits** — a free, open-source, multi-agent personal AI platform with the tagline:
> *"Your agents. Your rules. Your money."*

The transformation preserves the entire existing agent runtime, multi-agent communication, conversation memory, MCP tool ecosystem, and scheduling infrastructure while providing:
1. Complete user-facing rebranding to **Z-Bits** across all surfaces.
2. A fintech-meets-AI visual design token system (deep navy surfaces, violet/electric-blue accents).
3. A Universal AI Provider Architecture featuring first-class support for **Google Gemini** (via `@google/genai`), **AWS Bedrock** (via native Converse API `@aws-sdk/client-bedrock-runtime` and OpenAI-compatible Bedrock endpoints), and **Generic OpenAI-compatible endpoints**, while preserving all working routes (Claude Code, OpenCode Go, Ollama, GitHub Copilot, etc.).
4. A clean presentation and display-name alias mapping layer connecting Z-Bits personas (**Maya — Concierge Bit**, **Bolt — Bounty Bit**, **Sage — Occasion Bit**) to internal agent implementations without breaking underlying component IDs.
5. Deterministic extension boundaries for **Gate** (financial guard & policy engine) and **Runner** (execution & commerce system), maintaining strict separation between probabilistic LLM decision-making and deterministic financial controls.

---

## 1. Existing Architecture Analysis

### Full-Stack Structure
- **Frontend**: Vite 8 + React 19 + TypeScript SPA loaded via `index.html` and `studio.html`. Styling uses modular CSS with design variables (`studio.css`, `settings-ui.css`, `capability-panels.css`, `activity.css`, etc.).
- **Backend**: Express 5 server (`src/server/index.ts`) running on Node.js 22+ with SQLite database (`src/server/database.ts`).
- **Database**: SQLite with typed tables for `bots`, `threads`, `messages`, `runs`, `activities`, `approvals`, `routines`, `extensions`, and `usage`.
- **Agent Execution**:
  - `OpenCodeRunner` (`src/server/opencode.ts`) manages task claims via `claimNextQueuedRun`.
  - Dispatches to external runtimes (`opencode`, `claude`, or local `apple_fm`).
  - Tools are served through Model Context Protocol (MCP) bridges (`claude-mcp.mjs`).
  - Workspaces are isolated per-bot in temporary/persistent local folders (`src/server/workspace.ts`).
  - Execution policies meter tokens, steps, and host actions (`src/server/execution-policy.ts`).
- **Provider Architecture**:
  - Centralized schema in `src/shared/provider-config.ts`.
  - Discovery and health checks in `src/server/providers.ts` and `src/server/provider-test.ts`.
  - AI routing in `src/server/ai-router.ts`.

---

## 2. Components to Preserve (Do Not Rewrite)

1. **Underlying Agent Components**:
   - Internal bot IDs (`nova`, `pixel`, `scout`, etc.) and their storage representations.
   - Internal agent classes, database models, and migration paths.
2. **Orchestration & Coordination Engine**:
   - Multi-agent communication and consultation loops (`listAgentInbox`, `pauseRunForConsultation`, `resumeCoordinatorIfReady`).
   - Leader/follower sequencing (`followUpOrder`, `afterRunId`).
3. **Execution Runtime**:
   - `OpenCodeRunner`, step metering, task stage tracking (`planning`, `working`, `verifying`).
   - Workspace isolation, scratchpad directories, and file attachments.
4. **Memory & Retrieval**:
   - Vector embeddings (`src/server/embeddings.ts`), personal indexer, and semantic memory search.
5. **Tool & MCP Infrastructure**:
   - All MCP tool registrations (`connected_tools`, `workspace_read`, `workspace_write`, browser automation, code tools, etc.).
6. **Approvals & Routines**:
   - Approval mechanisms, host action receipts, scheduled calendars, and auto-review rules.
7. **License & Upstream Attribution**:
   - Upstream MIT license, copyright notices, and third-party notices.

---

## 3. Files Requiring Changes

### A. Branding & Visual System
- `index.html`, `studio.html`: Page titles, descriptions, viewport, apple-touch-icon, favicons, meta tags.
- `public/manifest.webmanifest`: App name, short name, theme colors, icons.
- `public/icon.svg`: Replaced with modern Z-Bits brand insignia.
- `src/studio/studio.css`, `src/studio/settings-ui.css`, `src/studio/capability-panels.css`:
  - Design tokens for deep navy/slate backgrounds (`#070a13`, `#0d1322`, `#131b2e`), electric blue (`#2563eb`, `#38bdf8`), and vibrant violet (`#7c3aed`, `#8b5cf6`).
- `src/studio/Studio.tsx`: Header, title bar, empty states, loading indicators, welcome dialogs, footer, and navigation.
- `src/studio/capability-navigation.ts`: Navigation item labels and descriptions.
- `src/studio/Settings.tsx`: Settings presentation, workspace labels, and branding cards.
- `src/studio/WorkspaceOverview.tsx`: Welcome cards and overview dashboard.

### B. Universal AI Provider Architecture
- `src/shared/provider-config.ts`:
  - Extend provider enums to support `"gemini" | "bedrock" | "openai-compatible"`.
  - Add Bedrock configuration schemas (regions, inference profile IDs, authentication modes: native AWS credentials vs OpenAI-compatible Bedrock runtime endpoint).
  - Add Google Gemini configuration schema.
- `src/shared/types.ts`:
  - Provider catalog types, connection status types, and credentials storage types.
- `src/server/providers/`:
  - `provider-registry.ts`: Provider contract and registry.
  - `gemini-adapter.ts`: Google Gemini integration with `@google/genai`.
  - `bedrock-adapter.ts`: AWS Bedrock integration with `@aws-sdk/client-bedrock-runtime` and OpenAI-compatible endpoint.
  - `openai-adapter.ts`: Configurable OpenAI-compatible provider.
- `src/server/providers.ts`:
  - Integrate new providers into status discovery and catalog building.
- `src/server/provider-test.ts`:
  - Live probe testing support for Gemini, Bedrock, and OpenAI-compatible providers without external runtime dependencies.
- `src/studio/Settings.tsx` & `src/components/ModelPicker.tsx`:
  - Polished AI Provider UI: add/test/save provider, enter keys, select model, test latency.

### C. Z-Bits Domain & Extension Layer
- `src/shared/zbits-types.ts`: Type definitions for Gate, Runner, Purchase Intents, Audit Events, and Persona Profiles.
- `src/shared/zbits-personas.ts`: Extensible display-name alias and persona mapping (Maya, Bolt, Sage).
- `src/server/gate/`: Gate financial policy engine interface and deterministic limits.
- `src/server/runner/`: Runner execution interface with disabled/mocked adapters for Bitrefill and Zcash.
- `src/studio/SpendingRulesPanel.tsx`: Dedicated Spending & Rules UI presenting Gate limits, daily budgets, and approval policies.
- `src/studio/ZbitsOverview.tsx`: Overview dashboard featuring active Bits, system health, provider status, and pending approvals.

---

## 4. Provider Implementation Approach

### 1. Google Gemini
- Use official modern package: `@google/genai`.
- Support API Key configuration through secure vault/server-side storage (`OPENBOT_PROVIDER_SECRET` / database vault).
- Test connection endpoint (`/api/provider/test`) validates key with Google AI Studio and reports latency and active model access.
- Supported models: `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`.

### 2. AWS Bedrock
- Two authentication/integration pathways:
  - **Native Converse API**: `@aws-sdk/client-bedrock-runtime` using standard AWS credential provider chain (environment variables `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, IAM roles, AWS profiles) and region configuration.
  - **OpenAI-Compatible Endpoint**: `https://bedrock-runtime.{region}.amazonaws.com/openai/v1` for models and runtimes expecting standard OpenAI payload formats.
- Clear error handling for AWS IAM permissions (`AccessDeniedException`, `ResourceNotFoundException`, model authorization prerequisites).

### 3. Generic OpenAI-Compatible Providers
- User specifies: Base URL (e.g. `https://api.together.xyz/v1`, `https://openrouter.ai/api/v1`, local `http://localhost:11434/v1`), API key, model ID, and optional custom headers.
- Tested and validated against `/chat/completions` or `/models` endpoints.

---

## 5. Z-Bits Persona Mapping Architecture

```text
+--------------------------------------------------------------+
|                     Z-Bits UI Layer                          |
|                                                              |
|   Maya (Concierge Bit)    Bolt (Bounty Bit)   Sage (Occasion)|
|   [Display Profile]       [Display Profile]   [Display Prof] |
+--------------------------------------------------------------+
                                |
                                v
               Display-Name & Persona Mapping Layer
                                |
+--------------------------------------------------------------+
|               Underlying Agent Runtime (Unchanged)           |
|                                                              |
|   nova (Researcher)       pixel (Maker)       scout (Organ)  |
|   ID: "nova"              ID: "pixel"         ID: "scout"    |
+--------------------------------------------------------------+
```

---

## 6. Gate and Runner Architecture

```text
                  +--------------------------+
                  |    Z-Bits Application    |
                  +--------------------------+
                               |
                               v
                  +--------------------------+
                  |     Bit Agent Intent     |
                  |     (Purchase Request)   |
                  +--------------------------+
                               |
                               v
                  +--------------------------+
                  |       Z-Bits Gate        |
                  | Deterministic Guard/Rules|
                  | - Per-transaction cap    |
                  | - Daily/monthly budgets  |
                  | - Recipient whitelist    |
                  | - Duplicate prevention   |
                  | - Cryptographic signature|
                  +--------------------------+
                               |
                 [ Signed Purchase Auth ]
                               |
                               v
                  +--------------------------+
                  |      Z-Bits Runner       |
                  | Secure Execution Service |
                  +--------------------------+
                     /                    \
                    v                      v
             [Bitrefill Adapter]   [Zcash Adapter]
             (Clearly Disabled)    (Clearly Disabled)
```

---

## 7. Cross-Platform Limitations & Environment Findings

- **Windows OS Considerations**:
  - Symlink tests (`claude-mcp.test.ts`) require Windows Developer Mode or administrator privileges. Non-elevated symlink creation triggers `EPERM`.
  - Shell script fixtures (`#!/bin/sh`) in certain legacy tests do not run natively under Windows `cmd.exe` without bash emulation.
  - Apple Intelligence (`apple_fm`) and Mac App Automation are macOS-specific and are gracefully detected and marked as "Unavailable on this platform" on Windows.
- **Node.js Environment**:
  - Node.js version in workspace: `v22.20.0`.
  - Typecheck (`npm run check`): 100% clean baseline.
  - Production build (`npm run build`): 100% clean baseline.

---

## 8. Validation Plan

1. **Phase 1: Baseline Verification** - Completed (`npm ci`, `npm run check`, `npm run build`, backend start probe).
2. **Phase 2: Rebranding** - Replace branding across HTML, CSS, React components, and navigation. Verify zero visual regressions.
3. **Phase 3: AI Provider Implementation** - Implement `@google/genai`, `@aws-sdk/client-bedrock-runtime`, OpenAI-compatible provider adapters, provider registry, settings UI, and connection probe testing.
4. **Phase 4: Z-Bits Domain Infrastructure** - Implement Gate, Runner, Personas, Spending & Rules UI, and Overview dashboard.
5. **Phase 5: Full Verification** - Run typechecks, unit tests, mock provider tests, build tests, and verify running application.

