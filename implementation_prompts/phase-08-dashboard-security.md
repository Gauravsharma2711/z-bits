# Phase 08 Execution Prompt — Dashboard & Security Hardening

## 1. Mandatory Documentation Reading
Before starting, read:
1. `prd.md` (Section 13: Security requirements)
2. `flow.md` (Phase 5: Dashboard, attacks and regression)
3. `submission_guidelines.md` (Section 5: Z-Bits evidence checklist)
4. `CURRENT_STATE.md`

## 2. Objective
Surface the complete cross-agent financial state in the Studio UI (`SpendingRulesPanel.tsx`, `ZbitsOverview.tsx`) and execute automated security attack tests proving deterministic defense against over-spending, tampering, replay, and unauthorized recipients.

## 3. Actual Technical Context
- Front-end panels `SpendingRulesPanel.tsx` and `ZbitsOverview.tsx` need live data from `/api/gate/policy`, `/api/gate/audit`, and `/api/runner/integrations`.
- Security tests must execute real automated attack vectors:
  - Vector 1: Attempt to modify authorized amount in a signed SpendPass.
  - Vector 2: Attempt to replay an already-consumed SpendPass token.
  - Vector 3: Attempt to submit a purchase intent for an untrusted/unapproved recipient.
  - Vector 4: Attempt to submit an order exceeding single-transaction, daily, or recipient cap.
  - Vector 5: Attempt to execute a purchase while the emergency pause kill-switch is engaged.

## 4. User Responsibilities
- Review the Studio UI dashboard and verify that values, audit logs, and status badges display cleanly.

## 5. Agent Responsibilities
- Connect `SpendingRulesPanel.tsx` and `ZbitsOverview.tsx` to live backend Gate/Runner endpoints.
- Display sanitized SpendPass metadata (authorization ID, expiry, digest) without leaking HMAC secrets.
- Display real Bitrefill invoice ID and delivered status.
- Display real Zcash NU7 testnet transaction ID.
- Create automated security test script `scripts/test-gate-attacks.ts` covering all 5 attack vectors.
- Ensure all 5 attack vectors fail closed with appropriate security audit events recorded.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Studio UI accurately displays Bits, recipient ledger balances, Gate decisions, and pending approvals.
- [ ] Bitrefill invoice ID and Zcash tx ID are visible in the dashboard.
- [ ] All 5 attack vectors in `scripts/test-gate-attacks.ts` pass and are deterministically blocked.
- [ ] Zero credential leaks or unmasked codes in frontend network inspection or server logs.

## 8. Regression Checks
- `npm run check` and `npm run build` pass without warnings or errors.
- All previous unit and integration tests continue to pass.

## 9. Git Workflow
### Local-Only Git Mode
- Commit dashboard polish and attack test scripts locally.
### Automatic GitHub Mode
- Push only after all attack tests pass.

## 10. Handoff Instructions
Record attack test results in `CURRENT_STATE.md`. Transition to Phase 09 (Submission Packaging).

