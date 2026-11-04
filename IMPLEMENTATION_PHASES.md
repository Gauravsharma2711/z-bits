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

### Phase 02 — AI Provider Validation
- **Status:** **READY TO EXECUTE (Awaiting User Handoff Approval)**
- **Objective:** Validate live provider connectivity for Google Gemini, AWS Bedrock, and OpenAI-compatible endpoints using real credentials.
- **Technical Scope:**
  - Verify `GeminiProviderAdapter` with real API key (`gemini-2.5-flash`, `gemini-1.5-flash`).
  - Verify `BedrockProviderAdapter` with AWS credentials/region.
  - Verify OpenAI-compatible adapter against target base URLs.
  - Ensure provider secrets remain strictly in `SecretVault` / server environment and are never leaked to client bundles or chat logs.
- **Exit Criteria:** At least one live provider successfully answers `/api/provider/:id/test` with real latency and model listings.

---

### Phase 03 — Gate: Recipient Registry & Shared Ledger
- **Status:** **PENDING (Phase 02 Dependency)**
- **Objective:** Implement canonical recipient identity resolution, recipient aliases, and persistent shared spending ledger.
- **Technical Scope:**
  - Create SQLite tables: `recipients`, `recipient_aliases`, `spending_ledger`, and `budget_reservations`.
  - Implement recipient alias normalizer (phone, email, handle, nicknames) mapping to canonical `recipient_id`.
  - Implement atomic budget reservation: 2-phase hold and release mechanism to prevent race conditions across concurrent requests.
  - Enforce owner-level limits (per-order, daily, monthly) and per-recipient cumulative spending limits.
  - Unit test alias resolution, cross-agent cumulative spending, and over-limit rejections.
- **Exit Criteria:** Maya and Bolt intents for different aliases of the same recipient hit the same canonical budget and block over-limit spending.

---

### Phase 04 — SpendPass Authorization
- **Status:** **PENDING (Phase 03 Dependency)**
- **Objective:** Implement cryptographic, single-use, scoped, short-lived SpendPass authorization tokens.
- **Technical Scope:**
  - Create SQLite table `spendpass_tokens` tracking token status (`issued`, `claimed`, `expired`, `revoked`).
  - Bind SpendPass to exact parameters: `recipient_id`, `merchant`, `product_id`, `denomination`, `max_price`, `nonce`, `policy_version`, `expires_at`.
  - Implement HMAC-SHA256 signature generation and independent verification.
  - Enforce single-use nonce invalidation so tokens cannot be replayed.
  - Implement emergency global kill-switch revoking all active SpendPass tokens.
- **Exit Criteria:** SpendPass tampering, replay, and expiration attacks are deterministically rejected by unit tests.

---

### Phase 05 — Runner & Bitrefill Fulfillment
- **Status:** **PENDING (Phase 04 Dependency)**
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

