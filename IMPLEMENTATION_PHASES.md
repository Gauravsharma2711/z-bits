# Z-Bits — Implementation Phases & Execution Roadmap

**Date:** 4 November 2026  
**Auditor:** Principal Software Architect & Technical Project Manager  
**Baseline:** Post-Rebranding Repository State (Audit Phase 00 Complete)

---

## Strategic Overview

The base repository from Sidemates `v0.42.0` is cloned, the core user-facing rebranding has been performed, and TypeScript compilation/unit test baselines are verified. The implementation plan focuses strictly on stabilizing verified runtime bugs and layering Z-Bits' deterministic commerce architecture onto the preserved agent foundation.

Every phase follows the mandatory engineering cycle:
> **INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**

---

## Implementation Roadmap

### Phase 00 — Post-Rebranding Technical Audit
- **Status:** **COMPLETE**
- **Objective:** Deep audit of existing workspace, Git status, rebranding state, frontend/backend architecture, provider adapters, database schemas, and security model.
- **Key Deliverables:** `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, `IMPLEMENTATION_PHASES.md`, and complete phase execution prompts in `implementation_prompts/`.

---

### Phase 01 — Application Stability
- **Status:** **COMPLETE**
- **Objective:** Fix verified Windows CLI process spawning bug in `providers.ts` and ensure reliable local startup and health reporting.
- **Completed Work:**
  - Updated `safeHostEnvironment()` in `src/server/runtime.ts` to preserve Windows system variables and npm global binaries path.
  - Added `{ shell: process.platform === "win32" }` across `providers.ts`, `runtime-compatibility.ts`, `opencode-flags.ts`, `claude-health.ts`, `opencode.ts`, and `runtime-boundary.ts`.
  - Added safe cleanup and mock-safe conditional shell spawning in `src/server/provider-test.ts`.
  - Fixed Windows compatibility in `src/server/provider-test.test.ts` (replaced Unix `sleep` with Node timer; passed 6/6 tests).
  - Clarified server listen port messaging in `src/server/index.ts` (Express on 4311 vs Vite Studio on 4310) and updated `.env.example`.
  - Seeded SQLite database with 3 starter teammate bots (`nova`, `pixel`, `scout`).
  - Verified `/api/readiness` (`ready: true`, OpenCode `1.18.31` detected, 2 AI connections connected, 3 teammates ready).
  - Verified `npm run check`, `npm run check:acceptance`, and `npm run build` pass cleanly.
- **Key Deliverables:** `STABILITY_REPORT.md`, `TEST_RESULTS.md`, updated `CURRENT_STATE.md` and `GAP_ANALYSIS.md`.

---

### Phase 02 — AI Provider Validation & Reliability
- **Status:** **COMPLETE**
- **Objective:** Stabilize, validate, and improve the existing AI-provider integration layer across Gemini, Claude, OpenAI-compatible, Ollama, and OpenCode.
- **Completed Work:**
  - Audited provider architecture; documented unified adapter lifecycle and model routing in `PROVIDER_ARCHITECTURE.md`.
  - Implemented `ClaudeProviderAdapter` and `OllamaProviderAdapter` alongside `GeminiProviderAdapter` and `OpenAICompatibleAdapter`.
  - Resolved Windows path quoting bug in `opencode.ts` where unquoted `node.exe` execution failed with `'C:\Program' is not recognized`.
  - Added quota exhaustion pattern matching (`额度不足`, `insufficient credit`) to `ai-router.ts` and `provider-test.ts`.
  - Enhanced streaming and tool-calling delta handling in `GeminiProviderAdapter` and `OpenAICompatibleAdapter`.
  - Produced `PROVIDER_TEST_REPORT.md` and `PROVIDER_SETUP.md`.
  - Validated 100% of test suites: `provider-adapters.test.ts`, `provider-test.test.ts`, `providers.test.ts`, `automatic-ai.test.ts`, and `execution-runner.test.ts` (32/32 tests).
- **Key Deliverables:** `PROVIDER_ARCHITECTURE.md`, `PROVIDER_TEST_REPORT.md`, `PROVIDER_SETUP.md`, updated `CURRENT_STATE.md`, `GAP_ANALYSIS.md`.

---

### Phase 03 — Gate: Recipient Registry & Shared Ledger
- **Status:** **COMPLETE**
- **Objective:** Implement canonical recipient identity resolution, recipient aliases, persistent shared spending ledger, deterministic spending constitution, and atomic budget reservations.
- **Completed Work:**
  - Migrated 7 persistent SQLite tables: `spending_constitution`, `recipients`, `recipient_aliases`, `purchase_intents`, `spending_ledger`, `gate_approvals`, `gate_decisions`.
  - Re-architected `GateEngine` with 100% deterministic code; zero LLM reasoning in financial authorization.
  - Implemented fail-closed Canonical Recipient Registry and whitespace/punctuation/case normalizer (`normalizeAlias`).
  - Implemented cross-agent shared spending ledger accounting: all agents (Maya, Bolt, Sage) draw against owner-level daily/monthly caps and recipient-level caps.
  - Implemented atomic 2-phase reservation hold (`reserveBudget` -> `settleBudget` / `releaseBudget`) using SQLite transactions.
  - Implemented Idempotency Manager detecting replays (`DUPLICATE_REQUEST`) and payload tampering (`IDEMPOTENCY_CONFLICT`).
  - Implemented Emergency Pause kill-switch immediately halting all spending with `EMERGENCY_PAUSE_ACTIVE`.
  - Implemented Owner Approval Workflow (`gate_approvals` table, `/api/gate/approvals/:id/resolve`, re-evaluating fresh budget upon approval).
  - Exposed comprehensive Express REST endpoints (`/api/gate/constitution`, `/api/gate/recipients`, `/api/gate/evaluate`, `/api/gate/approvals`, `/api/gate/ledger`, `/api/gate/emergency-pause`).
  - Enhanced frontend `SpendingRulesPanel.tsx` with tabs for Constitution, Recipients Registry, Pending Approvals, Ledger, and Cryptographic Audit.
  - Created test suite with 7 subtests in `src/server/gate/gate-engine.test.ts` (including the mandatory Maya $300 + Bolt $250 > $500 cap test).
  - Delivered `GATE_ARCHITECTURE.md`, `GATE_POLICY_REFERENCE.md`, `GATE_API.md`, and `GATE_TEST_REPORT.md`.
- **Key Deliverables:** `GATE_ARCHITECTURE.md`, `GATE_POLICY_REFERENCE.md`, `GATE_API.md`, `GATE_TEST_REPORT.md`, updated `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, `IMPLEMENTATION_PHASES.md`.

---

### Phase 04 — SpendPass Authorization
- **Status:** **COMPLETE**
- **Objective:** Implement cryptographic, single-use, scoped, short-lived SpendPass authorization tokens connecting Gate to Runner.
- **Completed Work:**
  - Migrated SQLite table `spendpass_tokens` with unique constraints (`jti`, `(owner_id, authorization_id)`).
  - Implemented `SpendPassService` in `src/server/gate/spendpass-service.ts`:
    - RFC 7519 compact JWT generation with base64url encoding and HMAC-SHA256 signing.
    - Timing-safe signature comparison using `crypto.timingSafeEqual`.
    - Key management and seamless rotation with `kid` headers.
    - Strict algorithm allowlisting (`alg: HS256` only; `none` and unexpected algorithms rejected with `UNSUPPORTED_ALGORITHM`).
  - Implemented persistent token state machine (`ISSUED` -> `CLAIMED` -> `CONSUMED`, `REVOKED`, `EXPIRED`).
  - Serialized concurrency and single-use enforcement: SQLite `BEGIN IMMEDIATE ... COMMIT` atomic transitions for `claimForExecution` and `completeExecution`, preventing duplicate claims or race conditions under high concurrency.
  - Full execution scope binding: canonical recipient, merchant, product, denomination, currency, and strictly immutable price ceiling (`actualAmountCents <= max_amount`).
  - Automatic Gate integration: Gate auto-issues SpendPass upon `ALLOW` evaluation and owner approval resolution.
  - Emergency Pause integration: active pause immediately blocks token verification and revokes all unclaimed tokens for the owner.
  - Exposed Express REST endpoints: `GET /api/gate/spendpass`, `GET /api/gate/spendpass/:id`, `POST /api/gate/spendpass/verify`, `POST /api/gate/spendpass/claim`, `POST /api/gate/spendpass/consume`, and `POST /api/gate/spendpass/:id/revoke`.
  - Created test suite with 7 subtests in `src/server/gate/spendpass.test.ts` (100% pass rate: 7/7 SpendPass suites, 14/14 combined Gate & SpendPass tests).
  - Delivered `SPENDPASS_ARCHITECTURE.md`, `SPENDPASS_SECURITY.md`, `SPENDPASS_API.md`, and `SPENDPASS_TEST_REPORT.md`.
- **Key Deliverables:** `SPENDPASS_ARCHITECTURE.md`, `SPENDPASS_SECURITY.md`, `SPENDPASS_API.md`, `SPENDPASS_TEST_REPORT.md`, updated `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, `IMPLEMENTATION_PHASES.md`.

---

### Phase 05 — Runner & Bitrefill Fulfillment
- **Status:** **READY TO EXECUTE (Awaiting User Handoff Approval)**
- **Objective:** Build real Bitrefill purchase execution, order tracking, and delivery verification.
- **Technical Scope:**
  - Implement server-side Bitrefill API client in `src/server/runner/bitrefill-client.ts`.
  - Implement catalog search (`search-products`) and live detail verification (`get-product-details`).
  - Validate live price against SpendPass `max_price` immediately prior to purchase.
  - Execute live purchase using event credits or approved test payment rail.
  - Poll invoice status (`get-invoice-by-id`) until terminal `delivered` state.
  - Ensure claim codes and PII are masked in logs and agent transcripts.
- **Exit Criteria:** At least one real Bitrefill purchase completed with verified invoice ID and `delivered` state.

---

### Phase 06 — Maya & Bolt Cross-Agent Orchestration
- **Status:** **PENDING (Phase 05 Dependency)**
- **Objective:** Connect Maya (conversational concierge) and Bolt (contributor bounty) as independent request sources to the shared Gate.
- **Technical Scope:**
  - Connect Maya chat tool to extract structured `PurchaseIntent` from natural language.
  - Implement Bolt reward-event trigger (simulated or webhook event) submitting a second intent for the same canonical recipient.
  - Demonstrate Gate blocking or requiring human approval on Bolt's request after Maya has consumed the recipient budget.
- **Exit Criteria:** End-to-end proof of USP: Maya purchase succeeds; subsequent Bolt request for the same recipient is blocked by shared ledger.

---

### Phase 07 — Zcash NU7 Testnet Integration
- **Status:** **PENDING (Phase 05 Dependency)**
- **Objective:** Produce a genuine shielded transaction on Zcash NU7 testnet with an encrypted opaque order reference.
- **Technical Scope:**
  - Integrate verified NU7 testnet tool/SDK using unified addresses (`u1...`).
  - Create genuine shielded transaction on testnet.
  - Insert opaque internal order reference into the encrypted memo (zero PII, zero phone numbers/names).
  - Record and verify transaction ID on testnet explorer.
  - Draft the comprehensive Privacy & Trust Note answering all 4 required hackathon questions.
- **Exit Criteria:** Real shielded NU7 testnet transaction ID captured; Privacy Note completed.

---

### Phase 08 — Dashboard & Security Hardening
- **Status:** **PENDING (Phase 06 & 07 Dependency)**
- **Objective:** Surface cross-agent financial state in the Studio UI and run automated security penetration tests.
- **Technical Scope:**
  - Update `SpendingRulesPanel.tsx` and `ZbitsOverview.tsx` with live recipient balances, pending approvals, Bitrefill invoice states, and Zcash tx links.
  - Run automated attack test scripts: over-limit order, replay SpendPass, altered signature, unknown recipient, and emergency pause.
  - Ensure zero credential or sensitive token leaks in frontend network payloads or logs.
- **Exit Criteria:** Dashboard accurately reflects live state; 100% of attack test cases pass.

---

### Phase 09 — Submission Packaging
- **Status:** **PENDING (Phase 08 Dependency)**
- **Objective:** Prepare final repository, documentation, demo video, and Stadium submission.
- **Technical Scope:**
  - Verify new event-day repository with honest commit history.
  - Write comprehensive README covering architecture, setup under 15 minutes, and design decisions.
  - Include `FEEDBACK.md` with developer tool observations for Bitrefill and Zcash.
  - Record 2–3 minute demo video demonstrating real flow and attack defense.
  - Complete Stadium submission fields and finalize before event deadline.
- **Exit Criteria:** Stadium submission finalized and verified before Thursday, 5 November 2026, 00:00 IST.

