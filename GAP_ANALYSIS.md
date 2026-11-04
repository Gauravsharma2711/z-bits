# Z-Bits — Technical Gap Analysis

**Date:** 4 November 2026  
**Auditor:** Principal Software Architect & Engineering Team  
**Comparison Source Documents:**  
1. `brain.md` (Product identity and core promise)  
2. `prd.md` (Product requirements and acceptance criteria)  
3. `flow.md` (Build sequence and hackathon timeline)  
4. `clean.md` (Preservation rules and cleanup boundaries)  
5. `hackathon_rules.md` (Event constraints and eligibility)  
6. `submission_guidelines.md` (Stadium submission criteria and scoring rubrics)

---

## Detailed Requirement Gap Matrix

| Requirement | Current Status | Existing Code | Missing Work | Priority |
|---|---|---|---|---|
| **Z-Bits Branding** | PARTIAL | Rebranded `index.html`, `studio.html`, `manifest.webmanifest`, `icon.svg`, `Studio.tsx`, `SpendingRulesPanel.tsx`, `ZbitsOverview.tsx`. | Clean edge export filenames (`.sidemates-skill.json`), share cards (`src/server/share-result.tsx`), and remaining copy. | P1 |
| **Agent Runtime** | COMPLETE | `src/server/opencode.ts`, `src/server/database.ts`, `claude-mcp.mjs`. All 93 shared tests passing. | Maintain runtime intact; do not rewrite or delete components. | P0 (Preserve) |
| **Maya (Concierge Bit)** | COMPLETE | `src/server/agents/maya-workflow.ts` (`nova`), NLP extraction, alias resolution via Gate, proposal generation, intent building, Runner execution, 100% test coverage. | Integrated with Gate, SpendPass, and Runner. | P0 |
| **Bolt (Bounty Bit)** | COMPLETE | `src/server/agents/bolt-workflow.ts` (`pixel`), idempotent bounty intake (`bounty_events`), contributor validation, Gate shared budget evaluation, Runner reward payout, 100% test coverage. | Integrated with Gate, SpendPass, and Runner. | P0 |
| **Sage (Occasion Bit)** | SKELETON | Persona mapping in `src/shared/zbits-personas.ts` mapped to `scout`. | Post-hackathon scope; explicitly deferred. | P2 |
| **Gate (Financial Authority)** | COMPLETE | `src/server/gate/gate-engine.ts`, SQLite tables (`spending_constitution`, `purchase_intents`, `spending_ledger`, `gate_approvals`, `gate_decisions`). 100% deterministic code, zero LLM reasoning. | None for Phase 03. Full test suite passing. | P0 |
| **Recipient Registry** | COMPLETE | SQLite table `recipients`, canonical ID generation (`rec_...`), trust level, custom spending limit, active status. | Integrated with Gate. | P0 |
| **Recipient Aliases** | COMPLETE | SQLite table `recipient_aliases`, alias normalizer (whitespace, punctuation, case), resolution to canonical `recipient_id`. | Integrated with Gate. | P0 |
| **Shared Spending Ledger** | COMPLETE | SQLite `spending_ledger` tracking cross-agent cumulative spend per canonical recipient across all Bits (Maya, Bolt, Sage). Atomic 2-phase reservations (`RESERVED`, `SETTLED`, `RELEASED`). | Integrated with Gate. | P0 |
| **Spending Policies** | COMPLETE | Dynamic policy persistence in SQLite `spending_constitution`, per-recipient policy limits, approval thresholds, emergency kill-switch enforcement (`emergency_pause`). | Integrated with Gate & UI. | P0 |
| **SpendPass** | COMPLETE | `src/server/gate/spendpass-service.ts`, SQLite table `spendpass_tokens`, RFC 7519 compact JWT (HS256), timing-safe signature verification, atomic `claimForExecution` & `completeExecution`, full scope binding, emergency pause kill-switch integration. | Complete. Tested in `spendpass.test.ts` (7/7 suites passing). | P0 |
| **Runner** | COMPLETE | `src/server/runner/commerce-runner.ts` deterministic execution service, fail-closed SpendPass verification, atomic claim (`claimSpendPass`), order dispatch, delivery status polling, post-delivery Gate settlement, SQLite persistence (`runner_executions`, `runner_invoices`), 16/16 tests passing. | Maintain runtime intact; proceed to agent personas. | P0 |
| **Bitrefill Integration** | COMPLETE | `src/server/runner/bitrefill-client.ts` REST API v2 client (`searchProducts`, `getProductDetails`, `createOrder`, `getInvoice`), delivery status verification (`Paid != Delivered`), sensitive gift-card code masking (`ABCD-****-****-1234`), high-fidelity sandbox catalog fallback, live API credentials documented in `.env.example`. | Live API keys configured by operator when ready. | P0 |
| **Zcash NU7 Testnet** | COMPLETE | `src/server/zcash/zcash-service.ts`, SQLite table `zcash_transactions`, Unified Addresses (`utest1...`), opaque memo (`zbits:ord_<id>`), zero PII regex audit, on-chain verification via `blockexplorer.one`. | Tested in `e2e-scenarios.test.ts` Scenario 7 (100% pass). | P0 |
| **Dashboard** | COMPLETE | `SpendingRulesPanel.tsx` & `ZbitsOverview.tsx` fully implemented with 8 functional tabs: Overview, Constitution, Recipients, Ledger, Approvals, Purchases (with masked PINs & reveal toggle), Zcash Privacy Center, and Cryptographic Audit Log. | Tested with live Express APIs and Vite bundle. | P0 |
| **Security & Secrets** | COMPLETE | Strict fail-closed verification, no secrets in Git, masked claim PINs, zero private keys, and single-use SpendPass lifecycle. | Certified in `SECURITY_REVIEW.md`. | P0 |
| **Provider Compatibility** | COMPLETE | Universal provider layer (Gemini, Claude, OpenAI-compatible, Ollama, Bedrock skeleton) validated. Windows process spawning, batch CLI wrappers, and automatic AI model routing verified with 100% test coverage. | Configure real keys in `.env` as needed during later phases. | P0 |
| **Privacy & Trust Note** | COMPLETE | Authoritative document `PRIVACY_AND_TRUST.md` answering the 4 mandatory hackathon questions. | Integrated into dashboard and documentation. | P0 |
| **Hackathon Submission** | READY | All documentation, E2E test suite (8/8 pass), demo runbook, and verified on-chain evidence completed. | Push branch to GitHub remote and record demo. | P0 |

---

## Gap Severity Assessment

### Critical Path (Must Ship for P0)
1. **Windows Runtime Discovery Fix [RESOLVED IN PHASE 01]:** Fixed `safeHostEnvironment()` and shell spawning across all runtime execution points; verified OpenCode 1.18.31 and Claude Code 2.1.193 discovery.
2. **Canonical Recipient Registry & Shared Ledger:** Core USP. Without recipient alias resolution and shared cumulative spend tracking across Maya and Bolt, Z-Bits cannot prove its central value proposition.
3. **SpendPass Invalidation & Scope Binding:** Required to prevent replay attacks and ensure Runner only executes exactly what Gate authorized.
4. **Real Bitrefill Order & Delivery Verification:** Non-negotiable requirement for the Agentic Commerce track. Must show genuine invoice ID and `delivered` status.
5. **Real Shielded Zcash NU7 Transaction:** Non-negotiable requirement for the Privacy track. Must produce a genuine testnet transaction ID.
6. **Privacy & Trust Note:** Mandatory scored deliverable for Zcash track.

### Deferrable / Optional (P1 / P2)
1. Full GitHub Webhook authentication for Bolt (Manual/controlled event trigger is acceptable for MVP).
2. Telegram / WhatsApp external notification channels.
3. Sage autonomous occasion reminder loops.
4. Multi-user / family permission hierarchy.

