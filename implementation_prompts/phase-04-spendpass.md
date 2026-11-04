# Phase 04 Execution Prompt — SpendPass Authorization

## 1. Mandatory Documentation Reading
Before starting, read:
1. `brain.md` (Section 5: Security model)
2. `prd.md` (FR-05, FR-06, Security requirements)
3. `flow.md` (Phase 1 & 5: Attack tests)
4. `CURRENT_STATE.md`

## 2. Objective
Implement the signed, scoped, short-lived, single-use **SpendPass** token system that authorizes Runner to execute exact purchases without exposing financial credentials or allowing replay attacks.

## 3. Actual Technical Context
- Current `SignedPurchaseAuthorization` in `gate-engine.ts` signs a simple string without durable nonce storage or explicit recipient binding verification in Runner.
- SpendPass must bind: `authorization_id`, `intent_id`, `intent_digest`, `recipient_id`, `merchant`, `product_id`, `denomination`, `max_price`, `nonce`, `policy_version`, `expires_at`, and HMAC-SHA256 signature.
- Must persist used nonces in SQLite table `spendpass_tokens` to guarantee single-use enforcement even across server restarts.

## 4. User Responsibilities
- Review the 15-minute expiration window and emergency kill-switch mechanism.

## 5. Agent Responsibilities
- Create `spendpass_tokens` table in SQLite (`id`, `intent_id`, `recipient_id`, `nonce`, `status`, `expires_at`, `created_at`).
- Implement cryptographic signing with server-side `GATE_SIGNING_SECRET` from `SecretVault`.
- Implement `verifySpendPass(pass)` in Runner verifying: signature integrity, exact recipient scope, product scope, expiration, and non-replayed nonce.
- Implement atomic token claim: claiming a SpendPass transitions status to `consumed` in a single database transaction.
- Implement emergency pause: instantly revokes all unconsumed SpendPass tokens globally.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Altered SpendPass payloads (tampered amount, modified recipient, swapped product) fail signature verification.
- [ ] Expired SpendPass tokens (> 15 minutes) are deterministically rejected.
- [ ] Replayed SpendPass tokens (consumed nonce) fail with `replay_detected`.
- [ ] Emergency pause instantly blocks execution of previously issued tokens.
- [ ] Unit tests verify all rejection pathways.

## 8. Regression Checks
- Gate evaluation remains deterministic.
- Existing database queries remain unaffected.

## 9. Git Workflow
### Local-Only Git Mode
- Commit SpendPass logic and test suite locally.
### Automatic GitHub Mode
- Push only after security test suite passes.

## 10. Handoff Instructions
Once Phase 04 passes, transition to Phase 05 (Runner & Bitrefill Fulfillment).

