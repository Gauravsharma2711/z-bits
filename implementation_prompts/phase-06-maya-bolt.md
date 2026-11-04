# Phase 06 Execution Prompt — Maya & Bolt Cross-Agent Orchestration

## 1. Mandatory Documentation Reading
Before starting, read:
1. `brain.md` (Section 3: The Bits & Section 10: Best proof of USP)
2. `prd.md` (Sections 6, 8.1, 8.2: Maya & Bolt user journeys)
3. `flow.md` (Phase 3: Maya and second Bit)
4. `submission_guidelines.md` (Section 7: 3-minute demo structure)

## 2. Objective
Connect Maya (conversational concierge Bit) and Bolt (contributor bounty Bit) as two independent request sources to the shared Gate financial constitution, demonstrating end-to-end relationship-aware cross-agent spending enforcement.

## 3. Actual Technical Context
- Maya is mapped to `nova` in `src/shared/zbits-personas.ts`.
- Bolt is mapped to `pixel` in `src/shared/zbits-personas.ts`.
- Both must produce structured `PurchaseIntent` objects containing the same recipient identity or an alias of that recipient.
- Target Demo Flow:
  1. Maya accepts a natural-language request to send a gift/top-up to Rahul.
  2. Gate authorizes, reserves budget, issues SpendPass, and Runner completes the purchase.
  3. Shared ledger records the spent amount against Rahul's canonical ID.
  4. Bolt triggers a reward request for Rahul (using a phone or GitHub handle alias).
  5. Gate resolves the alias to Rahul's canonical ID, evaluates cumulative spend across both Bits, and deterministically blocks or escalates the request because Rahul's shared budget is exhausted.

## 4. User Responsibilities
- Review the demo scenario details (recipient name, alias, budget cap).

## 5. Agent Responsibilities
- Wire Maya's conversational tool in `src/server/opencode.ts` / MCP to extract structured purchase intents.
- Implement a controlled trigger for Bolt submitting a bounty reward intent.
- Route both intents through `GateEngine.evaluateIntent()`.
- Ensure the shared ledger and recipient registry prevent duplicate spending.
- Write an automated integration test executing the complete Maya -> Gate -> Runner -> Ledger -> Bolt -> Block sequence.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Maya correctly extracts recipient, merchant, and amount from chat into `PurchaseIntent`.
- [ ] Maya's purchase is approved, executed by Runner, and recorded in the shared ledger.
- [ ] Bolt submits a second intent using an alias for the same canonical recipient.
- [ ] Gate blocks Bolt's intent with `exceeds_recipient_budget` or requires owner approval.
- [ ] Both agent activities and shared ledger state are visible in the Studio UI.

## 8. Regression Checks
- Existing bot conversational flows (`bot-nova`, `bot-pixel`) remain responsive.
- SQLite transactions correctly commit and rollback.

## 9. Git Workflow
### Local-Only Git Mode
- Commit Maya and Bolt integration updates locally.
### Automatic GitHub Mode
- Push only after cross-agent integration test passes.

## 10. Handoff Instructions
Record cross-agent test results in `CURRENT_STATE.md`. Transition to Phase 07 (Zcash NU7 Testnet Integration).

