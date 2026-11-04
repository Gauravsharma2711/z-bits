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
| **Maya (Concierge Bit)** | PARTIAL | Persona mapping in `src/shared/zbits-personas.ts` mapped to `nova`. Prompts and display profiles defined. | Intent extraction pipeline converting natural language requests into typed `PurchaseIntent` payloads for Gate. | P0 |
| **Bolt (Bounty Bit)** | PARTIAL | Persona mapping in `src/shared/zbits-personas.ts` mapped to `pixel`. | Controlled reward-event trigger generating a second `PurchaseIntent` against the same recipient. | P0 |
| **Sage (Occasion Bit)** | SKELETON | Persona mapping in `src/shared/zbits-personas.ts` mapped to `scout`. | Post-hackathon scope; explicitly deferred. | P2 |
| **Gate (Financial Authority)** | COMPLETE | `src/server/gate/gate-engine.ts`, SQLite tables (`spending_constitution`, `purchase_intents`, `spending_ledger`, `gate_approvals`, `gate_decisions`). 100% deterministic code, zero LLM reasoning. | None for Phase 03. Full test suite passing. | P0 |
| **Recipient Registry** | COMPLETE | SQLite table `recipients`, canonical ID generation (`rec_...`), trust level, custom spending limit, active status. | Integrated with Gate. | P0 |
| **Recipient Aliases** | COMPLETE | SQLite table `recipient_aliases`, alias normalizer (whitespace, punctuation, case), resolution to canonical `recipient_id`. | Integrated with Gate. | P0 |
| **Shared Spending Ledger** | COMPLETE | SQLite `spending_ledger` tracking cross-agent cumulative spend per canonical recipient across all Bits (Maya, Bolt, Sage). Atomic 2-phase reservations (`RESERVED`, `SETTLED`, `RELEASED`). | Integrated with Gate. | P0 |
| **Spending Policies** | COMPLETE | Dynamic policy persistence in SQLite `spending_constitution`, per-recipient policy limits, approval thresholds, emergency kill-switch enforcement (`emergency_pause`). | Integrated with Gate & UI. | P0 |
| **SpendPass** | PARTIAL | `SignedPurchaseAuthorization` interface with HMAC-SHA256 signature in `gate-engine.ts`. | Single-use cryptographic nonce, expiration validation, canonical recipient binding, and replay invalidation table. | P0 |
| **Runner** | PARTIAL | `src/server/runner/commerce-runner.ts` with signature verification and adapter routing. | Live adapter execution, scope enforcement against SpendPass, invoice polling, and status tracking. | P0 |
| **Bitrefill Integration** | SKELETON | `BitrefillAdapter` in `commerce-runner.ts` returning stub receipts. | Real Bitrefill API integration (`search-products`, `get-product-details`, `buy-products`, `get-invoice-by-id`) and status polling until `delivered`. | P0 |
| **Zcash NU7 Testnet** | SKELETON | `ZcashAdapter` in `commerce-runner.ts` returning mock transaction ID. | Genuine shielded NU7 testnet transaction creation using unified address, opaque order reference in encrypted memo, verifiable tx ID. | P0 |
| **Dashboard** | PARTIAL | `SpendingRulesPanel.tsx` and `ZbitsOverview.tsx` scaffolded. | Live visualization of cross-agent cumulative recipient spend, pending approvals, real Bitrefill delivery state, and Zcash tx ID. | P0 |
| **Security & Secrets** | PARTIAL | `src/server/vault.ts` with AES-256-GCM. No secrets in Git. Gate is deterministic. | Mask sensitive codes/PII in logs, enforce fail-closed when Gate/ledger is offline, reject replayed/tampered SpendPass tokens. | P0 |
| **Provider Compatibility** | COMPLETE | Universal provider layer (Gemini, Claude, OpenAI-compatible, Ollama, Bedrock skeleton) validated. Windows process spawning, batch CLI wrappers, and automatic AI model routing verified with 100% test coverage. | Configure real keys in `.env` as needed during later phases. | P0 |
| **Privacy & Trust Note** | MISSING | Guidelines and rules documented in `brain.md` and `prd.md`. | Standalone document answering the 4 mandatory Zcash questions: What stays private? What is revealed? What is trusted? What to fix next? | P0 |
| **Hackathon Submission** | MISSING | Outlined in `flow.md` and `submission_guidelines.md`. | Fresh event-day repository, public URL, README with architecture, real Bitrefill invoice ID, real Zcash NU7 tx ID, 3-minute video. | P0 |

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

