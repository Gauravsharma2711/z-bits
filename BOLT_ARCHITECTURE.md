# BOLT ARCHITECTURE REFERENCE — BOUNTY BIT

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Component:** Bolt Bounty Agent (`pixel`)  
**Status:** Production Ready & Verified  
**Runtime Persona:** Bolt (Bounty Bit, botId: `pixel`, personaId: `bolt`)

---

## 1. Role and High-Level Responsibility

Bolt is the contributor rewards and bounty payout Bit in Z-Bits. He monitors milestones, issues, and contributor achievements, structures bounty rewards, and disburses payouts via digital gift cards and vouchers.

### Core Functions
1. **Bounty Intake & Recording:** Receives contributor reward requests from manual inputs or automated webhooks (GitHub issues, PR merges, milestones).
2. **Idempotency Protection:** Enforces unique `idempotency_key` guarantees across all bounty records in the `bounty_events` SQLite table.
3. **Contributor Identity Verification:** Resolves contributor handles/aliases against Gate's canonical recipient registry. Rejects ambiguous or untrusted contributors.
4. **Reward Product Matching:** Selects eligible digital reward products (defaulting to universally redeemable digital gift cards).
5. **Gate Intent Submission:** Formulates a `PurchaseIntent` under `botId: "pixel"` and submits it to Gate's deterministic authorization engine.
6. **Cross-Agent Shared Budget Enforcement:** Shares the owner's recipient limits and spending caps with Maya. If Maya has spent the contributor's budget, Bolt's reward is deterministically blocked by Gate.
7. **Disbursement & Delivery Verification:** Executes approved rewards through SpendPass and Runner, updating bounty state to `EXECUTED`.

---

## 2. Bounty Lifecycle State Machine

Each bounty event in Z-Bits progresses through deterministic state transitions:

```
                  ┌──────────────────────┐
                  │       PENDING        │ ◄── Intake via createBountyEvent()
                  └──────────┬───────────┘
                             │
                  validateBountyEvent()
                             │
                             ▼
                  ┌──────────────────────┐
                  │      VALIDATED       │
                  └──────────┬───────────┘
                             │
                      processReward()
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      Gate ALLOW         Gate DENY         Gate REQUIRE_APPROVAL
          │                  │                  │
          ▼                  ▼                  ▼
   [ Runner Exec ]     ┌───────────┐      ┌────────────┐
          │            │ REJECTED  │      │ AUTHORIZED │ (Pending Review)
     ┌────┴────┐       └───────────┘      └────────────┘
     │         │
  Success   Failure
     │         │
     ▼         ▼
┌──────────┐ ┌────────┐
│ EXECUTED │ │ FAILED │
└──────────┘ └────────┘
```

### State Definitions
- **`PENDING`:** Initial intake state. Recorded with unique idempotency key.
- **`VALIDATED`:** Contributor alias verified against Gate canonical registry; eligible reward packages identified.
- **`AUTHORIZED`:** Gate evaluation returned `REQUIRE_APPROVAL`. Pending owner signature before disbursement.
- **`REJECTED`:** Gate evaluation returned `DENY` (e.g. `RECIPIENT_LIMIT_EXCEEDED`, `ORDER_LIMIT_EXCEEDED`).
- **`EXECUTED`:** Purchase successfully executed by Runner and delivery confirmed by merchant.
- **`FAILED`:** Execution or delivery suffered terminal fulfillment failure.

---

## 3. Database Schema: `bounty_events`

Persisted in SQLite database (`src/server/database.ts`):

```sql
CREATE TABLE IF NOT EXISTS bounty_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  contributor_alias TEXT NOT NULL,
  contributor_id TEXT,
  reward_amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  reason TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  idempotency_key TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  purchase_intent_id TEXT,
  execution_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bounty_events_owner ON bounty_events(owner_id);
CREATE INDEX IF NOT EXISTS idx_bounty_events_contributor ON bounty_events(contributor_id);
CREATE INDEX IF NOT EXISTS idx_bounty_events_idempotency ON bounty_events(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_bounty_events_status ON bounty_events(status);
```

---

## 4. Teammate Tool Exposure

Bolt is bound to the `pixel` agent runtime in Sidemates. His dedicated tools include:
1. `bolt_create_bounty`: Record a contributor reward event with unique idempotency key.
2. `bolt_validate_bounty`: Verify contributor identity and discover eligible reward packages.
3. `bolt_search_reward_products`: Search digital gift cards and payout options.
4. `bolt_process_reward`: Submit intent to Gate and disburse payment via Runner.
5. `bolt_get_bounty_status`: Inspect lifecycle status, execution ID, and delivery reference.

Every tool invocation checks `context.botId === "pixel"`. Attempts by `nova` or unapproved bots to call Bolt tools are rejected with a permission error.
