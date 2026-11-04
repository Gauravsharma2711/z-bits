# Z-Bits Gate: Spending Constitution & Policy Reference

This document specifies the deterministic policy evaluation rules, decision reason codes, precedence order, and configuration fields governing **Gate**.

---

## 1. Spending Constitution Fields

The owner's spending constitution is stored in SQLite table `spending_constitution` and loaded into memory on server startup:

| Field | Type | Default | Description |
|---|---|---|---|
| `currency` | `CurrencyCode` | `"USD"` | Master accounting currency (`USD`, `EUR`, `GBP`, `CAD`, `TAZ`, `ZEC`, `SATS`). |
| `max_per_order_cents` | `INTEGER` | `5000` ($50.00) | Maximum minor currency units permitted in any single order. |
| `daily_limit_cents` | `INTEGER` | `15000` ($150.00) | Cumulative 24-hour spending limit across all agents and all recipients. |
| `monthly_limit_cents` | `INTEGER` | `50000` ($500.00) | Cumulative calendar month spending limit across all agents. |
| `require_approval_above_cents` | `INTEGER` | `2000` ($20.00) | Transactions above this threshold require owner approval before authorization. |
| `allowed_categories_json` | `TEXT` (JSON array) | `["food","streaming","..."]` | Whitelist of allowed product/service categories. Empty list permits all. |
| `allowed_merchants_json` | `TEXT` (JSON array) | `["bitrefill","steam","..."]` | Whitelist of allowed merchants. Normalized case-insensitively. |
| `allowed_denominations_json` | `TEXT` (JSON array) | `[]` | Whitelist of permitted denominations (cents). Empty list permits any amount. |
| `trusted_recipient_only` | `INTEGER` (0/1) | `0` (false) | When `1`, strictly forbids transactions to any untrusted or new recipient. |
| `emergency_pause` | `INTEGER` (0/1) | `0` (false) | Global kill-switch immediately denying all new financial activity. |
| `policy_version` | `INTEGER` | `1` | Incrementing version counter tracking every policy mutation for auditing. |

---

## 2. Decision Precedence Order

When `evaluateIntent(intent)` is invoked, Gate processes checks in the following strict order:

```
[1. Basic Parameter Integrity] -> amount > 0, recipient present, merchant present
            |
[2. Emergency Pause & Policy Status] -> emergencyPause == true OR enabled == false
            |
[3. Idempotency & Tamper Protection] -> duplicate digest OR idempotency key conflict
            |
[4. Canonical Recipient Resolution] -> alias lookup -> trust & blocked check
            |
[5. Merchant Whitelist] -> allowed_merchants check
            |
[6. Category Whitelist] -> allowed_categories check
            |
[7. Denomination Restrictions] -> allowed_denominations check
            |
[8. Per-Order Limit] -> amountCents > max_per_order_cents
            |
[9. Cumulative Spend Accounting] -> recipient cap -> daily budget -> monthly budget
            |
[10. Owner Approval Threshold] -> amount > requireApprovalAbove OR untrusted recipient
            |
[11. Atomic Budget Reservation & Signature] -> status: ALLOW, reserveBudget()
```

---

## 3. Stable Machine-Readable Reason Codes

Gate returns structured reason codes in `reasonCodes: GateReasonCode[]`:

| Reason Code | Outcome | Description |
|---|---|---|
| `ALLOWED_UNDER_THRESHOLD` | `ALLOW` | Transaction fully conforms to policies and is below the approval threshold. |
| `ORDER_LIMIT_EXCEEDED` | `DENY` | Amount exceeds single order ceiling (`max_per_order_cents`) or is non-positive. |
| `DAILY_LIMIT_EXCEEDED` | `DENY` | Transaction would breach the owner's cumulative 24-hour daily limit. |
| `MONTHLY_LIMIT_EXCEEDED` | `DENY` | Transaction would breach the owner's cumulative calendar month budget. |
| `RECIPIENT_LIMIT_EXCEEDED` | `DENY` | Transaction would breach the recipient's personal spending limit across all agents. |
| `MERCHANT_NOT_ALLOWED` | `DENY` | Merchant is not present in the owner's approved merchant whitelist. |
| `CATEGORY_NOT_ALLOWED` | `DENY` | Purchase category is not permitted under the active policy. |
| `DENOMINATION_NOT_ALLOWED` | `DENY` | Order amount does not match the configured allowable denomination increments. |
| `RECIPIENT_UNTRUSTED` | `DENY` / `REQUIRE_APPROVAL` | Recipient is unverified or blocked. |
| `RECIPIENT_NOT_FOUND` | `DENY` | Recipient alias could not be resolved and `trusted_recipient_only` is active. |
| `ALIAS_AMBIGUOUS` | `DENY` | Multiple conflicting canonical recipients matched the normalized alias. |
| `POLICY_REQUIRES_APPROVAL` | `REQUIRE_APPROVAL` | Order amount exceeds the auto-approval threshold. Held in queue for owner review. |
| `EMERGENCY_PAUSE_ACTIVE` | `DENY` | Emergency pause is enabled. All transactions are halted. |
| `IDEMPOTENCY_CONFLICT` | `DENY` | Request reuses an existing idempotency key with a mutated payload digest. |
| `DUPLICATE_REQUEST` | `DENY` | Request with identical key and payload has already been evaluated. |
| `AGENT_UNAUTHORIZED` | `DENY` | Requesting agent does not have permission for financial commerce. |
| `POLICY_DISABLED` | `DENY` | Gate policy engine is disabled. |

---

## 4. Arithmetic Precision & Integrity Rules

- **Zero Floating-Point Math:** All currency calculations are conducted in integer minor units (e.g. cents, satoshis). No floating-point division is used in budget evaluations.
- **Fail-Closed on Unknowns:** Unrecognized merchants, unmapped recipient aliases, or unparsable denominations automatically fail closed and are denied.
- **Atomic Transactions:** Budget reservations and approvals use SQLite `BEGIN IMMEDIATE ... COMMIT` to guarantee strict serialized execution without race conditions.
