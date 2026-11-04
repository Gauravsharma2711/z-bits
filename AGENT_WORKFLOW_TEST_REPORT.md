# AGENT WORKFLOW TEST REPORT (PHASE 06)

**Project:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Execution Date:** 2026-11-04  
**Test Suite:** `src/server/agents/agents-workflow.test.ts`  
**All Project Suites Tested:** `gate-engine.test.ts`, `spendpass.test.ts`, `runner.test.ts`, `agents-workflow.test.ts`  
**Overall Status:** PASS (48/48 Total Project Tests Passing)

---

## 1. Executive Summary

Phase 06 implementation verifies end-to-end integration of Maya (Concierge Bit - `nova`) and Bolt (Bounty Bit - `pixel`) with Gate (Deterministic Financial Engine), SpendPass (HMAC Authorization Tokens), and Runner (Secure Bitrefill Commerce Execution).

All 18 Phase 06 test cases passed with zero failures. Most importantly, the mandatory cross-agent shared spending limit test proved that Maya and Bolt strictly share one owner-level financial constitution and recipient ledger.

---

## 2. Test Execution Breakdown (Phase 06 Suite)

### Section A: Maya Concierge Workflow (7 Tests)
| Test Case | Description | Result | Duration |
|---|---|:---:|:---:|
| `Maya: parses natural language purchase requests correctly` | Verifies NLP extraction of recipient, denomination, currency, brand, and occasion. | PASS | 204.9 ms |
| `Maya: missing information triggers clarification prompt` | Verifies detection of missing required fields and clarification prompt generation. | PASS | 172.4 ms |
| `Maya: ambiguous recipient triggers clarification prompt without guessing` | Verifies that unverified or colliding aliases refuse to guess and ask for clarification. | PASS | 166.8 ms |
| `Maya: proposal generation checks Gate approval threshold and returns structured details` | Verifies catalog matching and approval flagging when exceeding `requireApprovalAboveCents`. | PASS | 150.9 ms |
| `Maya: ALLOW purchase executes through Runner and verifies delivery` | Verifies end-to-end pipeline: intent -> Gate ALLOW -> SpendPass -> Runner order -> verified delivery. | PASS | 365.5 ms |
| `Maya: REQUIRE_APPROVAL purchase pauses and returns approvalId` | Verifies paused workflow with persistent `approvalId` when exceeding approval ceiling. | PASS | 152.8 ms |
| `Maya: DENY purchase explains reason safely` | Verifies deterministic rejection and safe reason code exposure when exceeding order limit. | PASS | 160.3 ms |

### Section B: Bolt Bounty Workflow (6 Tests)
| Test Case | Description | Result | Duration |
|---|---|:---:|:---:|
| `Bolt: creates bounty event with unique idempotency key` | Verifies recording of contributor bounty with `PENDING` state and idempotency tracking. | PASS | 210.2 ms |
| `Bolt: duplicate bounty submission is handled idempotently` | Verifies exact replay returns existing event; mismatched replay throws idempotency conflict. | PASS | 176.3 ms |
| `Bolt: validates contributor identity through Gate and checks eligible products` | Verifies contributor resolution through Gate registry and retrieval of eligible reward packages. | PASS | 153.3 ms |
| `Bolt: unresolvable or ambiguous contributor fails validation` | Verifies fail-closed behavior when contributor identity is unknown or colliding. | PASS | 145.5 ms |
| `Bolt: ALLOW reward executes via Runner and marks bounty EXECUTED` | Verifies disbursement execution and automatic update of bounty event to `EXECUTED`. | PASS | 383.3 ms |
| `Bolt: DENY reward marks bounty REJECTED` | Verifies that denied rewards automatically transition bounty status to `REJECTED`. | PASS | 143.6 ms |

### Section C: Cross-Agent Shared Financial Behavior (Mandatory Core Z-Bits Test)
| Test Case | Description | Result | Duration |
|---|---|:---:|:---:|
| `Cross-Agent: Maya and Bolt strictly share single owner recipient limit and ledger` | Registers recipient Rahul with $500 cap. Maya spends $300 across 3 requests. Bolt attempts $250 -> **DENIED** (`RECIPIENT_LIMIT_EXCEEDED`). Bolt attempts $100 -> **ALLOWED** (total $400). Maya attempts $100 -> **ALLOWED** (total $500). Maya attempts $10 -> **DENIED** (`RECIPIENT_LIMIT_EXCEEDED`). | PASS | 1239.7 ms |

### Section D: Security & Tool Permission Boundary Tests (4 Tests)
| Test Case | Description | Result | Duration |
|---|---|:---:|:---:|
| `Security: Maya (nova) can execute maya_* tools but is blocked from bolt_* tools` | Enforces tool permission boundary: `nova` blocked from calling `bolt_create_bounty`. | PASS | 124.8 ms |
| `Security: Bolt (pixel) can execute bolt_* tools but is blocked from maya_* tools` | Enforces tool permission boundary: `pixel` blocked from calling `maya_submit_purchase`. | PASS | 136.2 ms |
| `Security: Unknown or external bot is blocked from all financial agent tools` | Blocks unauthorized / external bots from invoking any internal agent tools. | PASS | 136.9 ms |
| `Security: Neither agent can forge SpendPass tokens or bypass Runner authorization` | Confirms that Runner rejects forged or unsigned tokens without valid cryptographic proof. | PASS | 150.0 ms |

---

## 3. Cumulative Project Test Suite Status

```
TAP version 13
# tests 48
# suites 0
# pass 48
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 9802.1
```
- **Gate Engine Tests:** 8/8 PASS
- **SpendPass Service Tests:** 7/7 PASS
- **Commerce Runner Tests:** 15/15 PASS
- **Agents Workflow Tests:** 18/18 PASS
- **Total Passing Tests:** 48 / 48 (100% Pass Rate)

