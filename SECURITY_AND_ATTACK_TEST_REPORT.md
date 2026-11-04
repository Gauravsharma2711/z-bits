# Z-Bits Security & Attack Vector Test Report

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Execution Date:** 2026-11-04T22:52:00+05:30  
**Status:** ALL 73 TESTS PASSED (0 FAILURES)  
**Environment:** Node.js v22.20.0, TypeScript tsx, In-Memory pg-mem & SQLite  

---

## 1. Executive Summary

This report provides empirical evidence of the deterministic security boundaries implemented in Z-Bits. All tests described in this report actually executed and passed. No theoretical claims are made without passing test receipts.

### Key Results
- **Gate Authorization:** 100% of unauthorized requests rejected fail-closed.
- **Cross-Agent Spending Limits:** Shared single owner constitution strictly enforced across independent Maya (Concierge) and Bolt (Bounty) agents.
- **SpendPass Replay Protection:** Replaying already consumed authorization tokens rejected with 100% reliability.
- **Token Tampering:** Modifying token parameters (recipient, merchant, denomination, currency) invalidates HMAC signature and halts execution.
- **Emergency Pause:** Kill-switch halts all reservations and runner claims instantly.
- **Concurrency & Race Conditions:** Row-level locks and transaction serialization prevent double-spend attacks.

---

## 2. Test Suite Breakdown

### 2.1 E2E Security Scenarios (`src/server/e2e/e2e-scenarios.test.ts`)
*Duration: 8.305s | Status: 8/8 Passed*

```
TAP version 13
ok 1 - Scenario 1: Cross-agent shared budget enforcement (Maya $300 + Bolt $250 for Rahul -> Gate blocks Bolt)
ok 2 - Scenario 2: SpendPass replay defense (attempting to reuse an already consumed SpendPass is rejected)
ok 3 - Scenario 3: Expired SpendPass rejection (tokens used after validity window are rejected)
ok 4 - Scenario 4: Emergency pause enforcement (new purchase requests cannot execute)
ok 5 - Scenario 5: Approval workflow (request requiring approval -> pending -> owner resolves -> executes)
ok 6 - Scenario 6: Bitrefill purchase & delivery verification (invoice tracking, terminal delivery, masked claim codes)
ok 7 - Scenario 7: Zcash shielded testnet transaction (NU7 testnet, opaque memo, zero PII, on-chain verification)
ok 8 - Scenario 8: Failure handling & fail-closed behavior (tampering, invalid credentials, duplicate keys)
```

#### Detailed Scenario 1: Cross-Agent Shared Recipient Budget
1. Canonical recipient `Rahul Sharma` is registered with a maximum spending cap of `$500.00` (`50000` cents).
2. Maya receives a purchase request for alias `"rahul"` for `$300.00`.
   - Gate evaluates: `$300.00 <= $500.00`. Decision: `ALLOW`.
   - SpendPass issued, Runner executes, reservation settled. Recipient spent: `$300.00`.
3. Bolt subsequently receives a bounty claim for alias `"rahul_bounty"` for `$250.00`.
   - Gate resolves `"rahul_bounty"` to the same canonical recipient ID `Rahul Sharma`.
   - Cumulative calculation: `$300.00 + $250.00 = $550.00 > $500.00` limit.
   - Gate decision: `DENY` with reason code `RECIPIENT_LIMIT_EXCEEDED`.
   - Result: No SpendPass issued; Runner never executes; owner's money is safeguarded.

---

### 2.2 SpendPass & Gate Authorization (`src/server/gate/*.test.ts`)
*Duration: 6.361s | Status: 14/14 Passed*

```
ok 1 - Z-Bits Gate: In-memory compatibility tests (limits, approvals, idempotency, signatures)
ok 2 - Z-Bits Gate SQLite: Mandatory cross-agent spending limit test (Maya & Bolt)
ok 3 - Z-Bits Gate SQLite: Alias normalization & ambiguity handling
ok 4 - Z-Bits Gate SQLite: Emergency Pause kill switch
ok 5 - Z-Bits Gate SQLite: Idempotency conflict protection
ok 6 - Z-Bits Gate SQLite: Two-phase reservation lifecycle (reserve -> settle & release)
ok 7 - Z-Bits Gate SQLite: Owner approval workflow
ok 8 - SpendPass Suite 1: Issuance & Gate Integration
ok 9 - SpendPass Suite 2: Cryptographic Validation & Integrity
ok 10 - SpendPass Suite 3: Scope Binding & Execution Context Validation
ok 11 - SpendPass Suite 4: Single-Use Lifecycle & Replay Protection
ok 12 - SpendPass Suite 5: Serialized Concurrency & Double-Claim Prevention
ok 13 - SpendPass Suite 6: Reservation Consistency & Released Ledger
ok 14 - SpendPass Suite 7: Emergency Pause & Owner Revocation
```

#### Attack Defense Highlights:
- **Tampered Token Signature (Suite 2):** When a malicious actor modifies the payload of a SpendPass token (e.g. changing denomination from `$10.00` to `$100.00`), the cryptographic signature verification fails:
  ```json
  { "valid": false, "reason": "TOKEN_SIGNATURE_INVALID" }
  ```
- **Scope Mismatch Attack (Suite 3):** If a runner tries to submit a SpendPass issued for `bitrefill` to an alternative merchant, or for `recipient_A` to `recipient_B`, verification fails with `SCOPE_MISMATCH`.
- **Replay Attack Defense (Suite 4):** A token in state `CONSUMED` cannot be claimed again. Secondary claim returns `false`.

---

### 2.3 Commerce Runner Execution Engine (`src/server/runner/runner.test.ts`)
*Duration: 8.094s | Status: 16/16 Passed*

```
ok 1 - Runner Suite A1: Valid SpendPass and matching context executes successfully
ok 2 - Runner Suite A2: Tampered SpendPass token signature is rejected (fails closed)
ok 3 - Runner Suite A3: Revoked SpendPass token cannot be executed
ok 4 - Runner Suite A4: Scope mismatch rejects execution (merchant / recipient mismatch)
ok 5 - Runner Suite A5: Price ceiling enforcement (rejects price > max_amount)
ok 6 - Runner Suite B1: Product search and detail lookup
ok 7 - Runner Suite B2: Non-existent product fails closed
ok 8 - Runner Suite B3: Unsupported denomination rejected
ok 9 - Runner Suite C1: Single execution succeeds and prevents replay
ok 10 - Runner Suite C2: Serialized concurrency prevents double claim
ok 11 - Runner Suite D1: Order creates invoice and delivery is verified
ok 12 - Runner Suite D2: Terminal delivery failure marks execution FAILED without consumption
ok 13 - Runner Suite E1: Confirmed delivery settles reservation in ledger
ok 14 - Runner Suite E2: Network timeout marks UNCERTAIN and holds reservation
ok 15 - Runner Suite F1: Secret claim codes are masked in invoices and execution results
ok 16 - Runner Suite F2: Comprehensive audit events are logged across lifecycle
```

#### Defense Highlight: Network Timeout & Uncertain Orders (Suite E2)
When external API calls to Bitrefill time out (e.g., gateway timeout after 10,000ms), the system does **not** blindly retry (which risks double-purchasing) or release funds (which risks unbacked merchant claims). Instead, it enters status `UNCERTAIN`:
- SpendPass status: `CLAIMED`
- Spending Ledger status: `RESERVED` (funds held)
- Audit log: `EXECUTION_UNCERTAIN` event emitted for owner resolution.

---

### 2.4 Agent Tool Sandboxing & Scoping (`src/server/agents/agents-workflow.test.ts`)
*Duration: 8.536s | Status: 18/18 Passed*

```
ok 1 - Maya: parses natural language purchase requests correctly
ok 2 - Maya: missing information triggers clarification prompt
ok 3 - Maya: ambiguous recipient triggers clarification prompt without guessing
ok 4 - Maya: proposal generation checks Gate approval threshold and returns structured details
ok 5 - Maya: ALLOW purchase executes through Runner and verifies delivery
ok 6 - Maya: REQUIRE_APPROVAL purchase pauses and returns approvalId
ok 7 - Maya: DENY purchase explains reason safely
ok 8 - Bolt: creates bounty event with unique idempotency key
ok 9 - Bolt: duplicate bounty submission is handled idempotently
ok 10 - Bolt: validates contributor identity through Gate and checks eligible products
ok 11 - Bolt: unresolvable or ambiguous contributor fails validation
ok 12 - Bolt: ALLOW reward executes via Runner and marks bounty EXECUTED
ok 13 - Bolt: DENY reward marks bounty REJECTED
ok 14 - Cross-Agent: Maya and Bolt strictly share single owner recipient limit and ledger
ok 15 - Security: Maya (nova) can execute maya_* tools but is blocked from bolt_* tools
ok 16 - Security: Bolt (pixel) can execute bolt_* tools but is blocked from maya_* tools
ok 17 - Security: Unknown or external bot is blocked from all financial agent tools
ok 18 - Security: Neither agent can forge SpendPass tokens or bypass Runner authorization
```

#### Attack Defense Highlights:
- **Agent Impersonation / Cross-Tool Invocations (Tests 15–17):**
  Agent `nova` (Maya) attempting to call `bolt_create_bounty` is rejected with:
  `"Access Denied: Agent nova is not authorized to invoke tool bolt_create_bounty"`.
  Agent `pixel` (Bolt) attempting to call `maya_submit_purchase` is rejected with:
  `"Access Denied: Agent pixel is not authorized to invoke tool maya_submit_purchase"`.
  Any unknown agent ID is blocked from all financial tools.

---

### 2.5 PostgreSQL Persistence Engine (`src/server/db/postgres-zbits.test.ts`)
*Duration: 3.357s | Status: 17/17 Passed*

```
ok 1 - Mandatory Test 1: Database connection succeeds
ok 2 - Mandatory Test 2: Migrations run on a clean database
ok 3 - Mandatory Test 3: Existing schema upgrades successfully
ok 4 - Mandatory Test 4: Recipient creation works
ok 5 - Mandatory Test 5: Alias resolution maps multiple aliases to one canonical recipient
ok 6 - Mandatory Test 6: Owner isolation prevents cross-account access
ok 7 - Mandatory Test 7: Shared spending totals are correct
ok 8 - Mandatory Test 8: Maya and Bolt use the same recipient ledger
ok 9 - Mandatory Test 9: Concurrent reservations cannot exceed the available budget
ok 10 - Mandatory Test 10: Expired reservations are handled safely
ok 11 - Mandatory Test 11: Failed orders release reservations correctly
ok 12 - Mandatory Test 12: Uncertain orders are not blindly retried
ok 13 - Mandatory Test 13: SpendPass replay is rejected after application restart
ok 14 - Mandatory Test 14: Revoked SpendPass is rejected
ok 15 - Mandatory Test 15: Audit events persist
ok 16 - Mandatory Test 16: Database outage causes fail-closed purchase behavior
ok 17 - Mandatory Test 17: Existing agent functionality still works (Zcash & Bounties)
```

#### Defense Highlight: Database Outage Fail-Closed Guarantee (Test 16)
When the database connection pool drops or network connectivity is severed:
- Any attempt to calculate spend throws an exception immediately.
- Any attempt to reserve budget or authorize a purchase rejects fail-closed.
- No purchase can execute in an unbacked or degraded state.

---

## 3. Summary of Security Invariants

| Invariant | Implementation Mechanism | Verification Test |
| :--- | :--- | :--- |
| **No LLM Financial Autonomy** | Deterministic Gate evaluation service | E2E Scenario 1, Gate Suite 2 |
| **Single-Use Authorizations** | SpendPass state machine with atomic row locks | SpendPass Suite 4, E2E Scenario 2 |
| **Zero Voucher Leakage** | Bidirectional code masking in Runner (`maskSensitiveCode`) | Runner Suite F1, E2E Scenario 6 |
| **Tamper-Evident Signatures** | HMAC-SHA256 over canonical intent digest | SpendPass Suite 2, Runner Suite A2 |
| **Zero PII on Blockchain** | Opaque memo hashing (`zbits:ord_<hex>`) | Zcash Evidence, E2E Scenario 7 |
| **Non-Custodial Wallet Privacy** | User-controlled Zingo wallet signing workflow | Zcash Security Specification |
| **Fail-Closed on Outage** | Explicit transaction rollbacks on failure | PostgreSQL Test 16 |
