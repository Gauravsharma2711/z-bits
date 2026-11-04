# AGENT SECURITY & PERMISSION BOUNDARIES

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Component:** Agent Security, Capability Isolation & Shared Ledger Governance  
**Status:** Production Verified

---

## 1. Security Architecture Overview

Z-Bits enforces strict separation between AI agent intelligence and deterministic financial authority. Agents (Maya, Bolt) operate as **request initiators**, while Gate operates as the **sole financial policy authority** and Runner operates as the **sole merchant execution service**.

```
                   ┌───────────────────────────────────┐
                   │         AI AGENT LAYER            │
                   │  Maya (nova)  │   Bolt (pixel)    │
                   └───────┬───────────────────┬───────┘
                           │                   │
                  [ Intent Request ]   [ Intent Request ]
                           │                   │
                           ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│                    Z-BITS INTERNAL GATEWAY                   │
│  - Enforces agent tool whitelisting (nova vs pixel)          │
│  - Blocks forged actor contexts                              │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                   GATE AUTHORIZATION ENGINE                  │
│  - Evaluates Owner Constitution & Limits Deterministically   │
│  - Enforces Single Shared Ledger across ALL Agents           │
│  - Holds SpendPass HMAC Secret Keys (Zero LLM Access)        │
└──────────────────────────────┬───────────────────────────────┘
                               │
                        Signed SpendPass
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  RUNNER PURCHASE EXECUTION                   │
│  - Verifies cryptographic SpendPass signature & scopes       │
│  - Enforces atomic single-use claim (Replay Protection)      │
│  - Only component authorized to communicate with Bitrefill   │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Identity & Tool Permission Matrix

| Agent | Teammate ID | Allowed Tools | Forbidden Actions |
|---|---|---|---|
| **Maya** | `nova` | `maya_resolve_recipient`<br>`maya_search_products`<br>`maya_get_product_details`<br>`maya_create_proposal`<br>`maya_submit_purchase`<br>`maya_get_purchase_status` | Cannot call `bolt_*` tools.<br>Cannot self-approve intents.<br>Cannot access SpendPass keys.<br>Cannot call Bitrefill API. |
| **Bolt** | `pixel` | `bolt_create_bounty`<br>`bolt_validate_bounty`<br>`bolt_search_reward_products`<br>`bolt_process_reward`<br>`bolt_get_bounty_status` | Cannot call `maya_*` tools.<br>Cannot self-approve intents.<br>Cannot access SpendPass keys.<br>Cannot call Bitrefill API. |
| **External / Untrusted** | Any other ID | None | All financial operations blocked. |

---

## 3. Mandatory Cross-Agent Financial Invariants

### A. Shared Owner Constitution & Spending Caps
Both Maya and Bolt query and mutate the single, shared owner constitution in SQLite:
- `dailyBudgetCents`: Enforces cumulative daily spend across ALL agents.
- `monthlyBudgetCents`: Enforces cumulative monthly spend across ALL agents.
- `maxPerOrderCents`: Maximum value for any single purchase.
- `requireApprovalAboveCents`: Threshold requiring explicit human confirmation.

### B. Shared Recipient Ledger
Every recipient has a single canonical record (`rec_...`) in the database.
If recipient Rahul has a `$500.00` limit:
1. Maya spends `$300.00` on Rahul -> Recorded in `spending_ledger` (`RESERVED` -> `SETTLED`). Cumulative spend on Rahul is now `$300.00`.
2. Bolt later requests a `$250.00` bounty reward for Rahul (even using a different alias like "Rahul S.") -> Gate computes `$300.00 + $250.00 = $550.00 > $500.00`. Gate **DENIES** Bolt's reward (`RECIPIENT_LIMIT_EXCEEDED`).
3. Bolt requests `$100.00` for Rahul -> Total is `$400.00 <= $500.00`. Gate **ALLOWS** the purchase.
4. Maya attempts another `$150.00` purchase -> Total is `$550.00 > $500.00`. Gate **DENIES** Maya's purchase.

This proves that **neither agent can starve, bypass, or override the financial policies set by the owner**.

---

## 4. Cryptographic Isolation & Replay Defense

1. **HMAC-SHA256 Signing Key Isolation:** Key secrets reside exclusively inside Gate and are never transmitted to OpenCode or Claude MCP processes.
2. **Deterministic Digest Validation:** Every intent contains `intentDigest = SHA256(idempotencyKey + botId + merchant + recipient + amountCents + currency + itemDescription)`. Any tampering in transit causes immediate Gate rejection.
3. **Single-Use Replay Protection:** When Runner receives a SpendPass, it performs an atomic claim in SQLite (`UPDATE spendpass_tokens SET status='CLAIMED' WHERE id=? AND status='ISSUED'`). Replaying a token returns `SPENDPASS_ALREADY_CLAIMED`.
4. **Credential Masking:** Raw digital gift card codes and PINs are masked (`STEAM-CODE-****-2026`) in all database records, invoice logs, and agent response payloads.
