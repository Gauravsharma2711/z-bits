# Z-Bits Runner Test Report

**Phase:** Phase 05 — Runner: Secure Bitrefill Purchase Execution  
**Test Suite:** `src/server/runner/runner.test.ts` + `gate-engine.test.ts` + `spendpass.test.ts`  
**Execution Timestamp:** 2026-11-04T10:36:39Z  
**Runtime:** Node.js v22.14.0 (Windows x64) with native SQLite  
**Result:** **30 PASSED / 0 FAILED (100% Pass Rate)**  

---

## 1. Test Execution Summary

| Test Suite | Total Tests | Passed | Failed | Duration | Status |
|---|---|---|---|---|---|
| `runner.test.ts` (Runner Execution & Bitrefill) | 16 | 16 | 0 | ~6.9s | **PASS** |
| `spendpass.test.ts` (SpendPass Token Security) | 7 | 7 | 0 | ~1.4s | **PASS** |
| `gate-engine.test.ts` (Gate Financial Engine) | 7 | 7 | 0 | ~1.2s | **PASS** |
| **Combined Total** | **30** | **30** | **0** | **~7.6s** | **PASS** |

---

## 2. Runner Test Suite Breakdown (`src/server/runner/runner.test.ts`)

### Section A: SpendPass Verification (Fail-Closed)
- `Runner Suite A1: Valid SpendPass and matching context executes successfully` — **PASS**
  - Confirmed valid token with matching recipient, merchant, product, and denomination executes successfully to `COMPLETED` state.
- `Runner Suite A2: Tampered SpendPass token signature is rejected (fails closed)` — **PASS**
  - Verified tampered JWT signature is rejected with reason `INVALID_SIGNATURE`; zero merchant communication occurs.
- `Runner Suite A3: Revoked SpendPass token cannot be executed` — **PASS**
  - Verified owner-revoked token fails execution with `TOKEN_REVOKED`.
- `Runner Suite A4: Scope mismatch rejects execution (merchant / recipient mismatch)` — **PASS**
  - Confirmed execution context pointing to unauthorized recipient is rejected with `RECIPIENT_MISMATCH`.
- `Runner Suite A5: Price ceiling enforcement (rejects price > max_amount)` — **PASS**
  - Confirmed attempt to execute package exceeding authorized `max_amount` fails with `PRICE_EXCEEDS_AUTHORIZATION`.

### Section B: Product Discovery & Price Verification
- `Runner Suite B1: Product search and detail lookup` — **PASS**
  - Verified catalog query for `"steam"` returns valid product, currency `"USD"`, and active package tiers.
- `Runner Suite B2: Non-existent product fails closed` — **PASS**
  - Confirmed querying an unknown product returns `null` and halts downstream processing.
- `Runner Suite B3: Unsupported denomination rejected` — **PASS**
  - Confirmed attempting to order an unavailable denomination fails with `DENOMINATION_INVALID`.

### Section C: Execution Lifecycle & Replay Protection
- `Runner Suite C1: Single execution succeeds and prevents replay` — **PASS**
  - Verified first execution transitions token to `CONSUMED`; immediate replay with identical token fails with `TOKEN_ALREADY_CONSUMED`.
- `Runner Suite C2: Serialized concurrency prevents double claim` — **PASS**
  - Concurrently executed two requests with identical token; exactly 1 succeeded and 1 failed with `SPENDPASS_ALREADY_CLAIMED`.

### Section D: Invoice & Delivery Polling (Paid != Delivered)
- `Runner Suite D1: Order creates invoice and delivery is verified` — **PASS**
  - Confirmed order creates invoice, polling progresses to `delivered`, and final invoice record contains timestamp and masked delivery ref.
- `Runner Suite D2: Terminal delivery failure marks execution FAILED without consumption` — **PASS**
  - Simulated merchant inventory rejection; execution marked `FAILED` and SpendPass preserved unconsumed.

### Section E: Gate Settlement & Ledger Consistency
- `Runner Suite E1: Confirmed delivery settles reservation in ledger` — **PASS**
  - Confirmed reservation in `spending_ledger` changes `RESERVED -> SETTLED` and daily spend increments.
- `Runner Suite E2: Network timeout marks UNCERTAIN and holds reservation` — **PASS**
  - Simulated `ETIMEDOUT` network timeout; verified execution status is `UNCERTAIN`, reason is `MERCHANT_OUTCOME_UNCERTAIN`, token remains `CLAIMED`, and ledger reservation remains `RESERVED`.

### Section F: Security, Masking & Audit Trail
- `Runner Suite F1: Secret claim codes are masked in invoices and execution results` — **PASS**
  - Verified gift card code contains `****` masking pattern in execution result and database record.
- `Runner Suite F2: Comprehensive audit events are logged across lifecycle` — **PASS**
  - Verified audit events `runner_purchase_initiated`, `runner_delivery_confirmed`, and `runner_settlement_completed` are logged.

---

## 3. TypeScript & Build Verification

- `npx tsc --noEmit`: Clean compilation with 0 errors across server, gate, runner, and database.
- `npx vite build`: Clean client build with 0 bundle errors.
