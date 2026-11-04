# Phase 03 Execution Prompt — Gate: Recipient Registry & Shared Ledger

## 1. Mandatory Documentation Reading
Before starting, read:
1. `brain.md` (Sections 2, 3, 4: Shared Spending Constitution & USP)
2. `prd.md` (Sections 6, 7, 8: Gate requirements & journeys)
3. `flow.md` (Phase 1: Recipient model and Gate)
4. `CURRENT_STATE.md`

## 2. Objective
Implement the core USP of Z-Bits: a deterministic, SQLite-backed financial authority that enforces canonical recipient identity, alias resolution, atomic budget reservations, and a shared cross-agent spending ledger across all Bits.

## 3. Actual Technical Context
- Current `gate-engine.ts` stores daily/monthly limits and idempotency keys in ephemeral JavaScript `Map` structures, losing state across restarts.
- Missing SQLite tables: `recipients`, `recipient_aliases`, `spending_ledger`, and `budget_reservations`.
- Gate must NEVER delegate financial authorization decisions to an LLM.

## 4. User Responsibilities
- Review default spending policy limits ($50 max per transaction, $150 daily, $500 monthly, $20 approval threshold).
- Define initial test recipients and aliases.

## 5. Agent Responsibilities
- Create durable SQLite schemas in `src/server/database.ts` for recipients, aliases, spending ledger, and reservations.
- Implement `RecipientResolver`: normalize input names, phone numbers, and handles into a canonical `recipient_id`.
- Implement atomic 2-phase budget reservation (`reserve` -> `settle` / `release`) to prevent race conditions during concurrent Bit requests.
- Implement cross-Bit cumulative spend evaluation: Maya's purchase reduces what Bolt can spend on the same recipient.
- Enforce fail-closed behavior: if database or Gate is unavailable, purchases are blocked.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Multiple aliases for one contact (e.g. "Rahul", "+919876543210", "@rahul") resolve to one canonical `recipient_id`.
- [ ] Shared ledger durably records cumulative spend across multiple Bits in SQLite.
- [ ] Concurrent requests cannot overspend the remaining allowance.
- [ ] Over-limit requests return `DENY` or `REQUIRE_APPROVAL` with structured reason codes.
- [ ] Comprehensive automated tests cover alias resolution, race condition reservations, and cumulative limit enforcement.

## 8. Regression Checks
- Existing database tables and bot configurations in `openbot.sqlite` remain intact.
- `gate-engine.test.ts` passes with new persistent database methods.

## 9. Git Workflow
### Local-Only Git Mode
- Commit SQLite migrations and Gate engine updates locally.
### Automatic GitHub Mode
- Push only after unit and database tests pass.

## 10. Handoff Instructions
Once Phase 03 passes, record Gate implementation details in `CURRENT_STATE.md` and transition to Phase 04 (SpendPass Authorization).

