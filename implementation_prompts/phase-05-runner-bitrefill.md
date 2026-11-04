# Phase 05 Execution Prompt — Runner & Bitrefill Fulfillment

## 1. Mandatory Documentation Reading
Before starting, read:
1. `hackathon_rules.md` (Section 5: Agentic Commerce track & Section 6: Money constraints)
2. `submission_guidelines.md` (Section 4: Bitrefill checklist & demonstration sequence)
3. `prd.md` (FR-06, FR-07, Section 8.1: Maya journey)
4. `flow.md` (Phase 2: Runner and real Bitrefill fulfillment)

## 2. Objective
Implement real, server-side Bitrefill commerce execution in Runner: query products, verify live price against SpendPass, execute one real purchase using event credits or approved payment route, poll invoice until `delivered`, and securely capture the invoice ID.

## 3. Actual Technical Context
- Current `BitrefillAdapter` in `src/server/runner/commerce-runner.ts` returns dummy/stub data.
- Bitrefill developer demonstration sequence:
  1. `search-products`
  2. `get-product-details`
  3. `buy-products`
  4. `get-invoice-by-id`
  5. Poll until `delivered`.
- Security rule: Gift-card codes, claim links, and API credentials must NEVER be logged or displayed in agent conversation transcripts. Mask all codes in UI/logs.

## 4. User Responsibilities
- Provide Bitrefill API credentials (`BITREFILL_API_KEY`, `BITREFILL_API_SECRET`) and ensure event credits are assigned to the test account.
- Specify the designated test product (e.g. low-value digital voucher or phone recharge).

## 5. Agent Responsibilities
- Implement `BitrefillClient` in `src/server/runner/bitrefill-client.ts`.
- Fetch live product packages; verify that the package value and current price do not exceed SpendPass `max_price`.
- Execute the purchase call under SpendPass authorization.
- Poll the invoice status until it reaches `delivered` (or terminal failure/uncertain).
- Handle timeouts as `UNCERTAIN` without blind retries.
- Capture the genuine Bitrefill invoice ID and sanitize the fulfillment receipt.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Runner verifies SpendPass before making any external Bitrefill API call.
- [ ] At least one real agent-initiated Bitrefill purchase completes successfully.
- [ ] The real Bitrefill invoice ID is recorded.
- [ ] Runner verifies that order reaches `delivered` status before reporting success.
- [ ] Raw gift-card codes and API secrets are completely masked in logs and UI.

## 8. Regression Checks
- SpendPass verification remains strictly enforced before dispatch.
- Gate settlement updates after delivery confirmation.

## 9. Git Workflow
### Local-Only Git Mode
- Commit Bitrefill client and runner updates locally.
- Never commit Bitrefill API keys or gift-card claim secrets.
### Automatic GitHub Mode
- Verify that credentials are not in diff before pushing.

## 10. Handoff Instructions
Record the verified Bitrefill invoice ID and delivered state in `CURRENT_STATE.md`. Transition to Phase 06 (Maya & Bolt Cross-Agent Orchestration).

