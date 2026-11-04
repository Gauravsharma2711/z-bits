# Z-Bits Runner Security Architecture & Threat Model

**Component:** Runner Security Layer  
**Phase:** 05  
**Domain:** Autonomous Financial Execution & Merchant Interactions  

---

## 1. Threat Modeling & Mitigations

| Threat ID | Threat Description | Attack Vector | Runner Defense / Mitigation |
|---|---|---|---|
| **T-01** | Agent Bypasses Gate | Agent attempts to call Bitrefill API directly to spend owner funds. | Bitrefill API keys are server-side only. Runner endpoint `/api/runner/execute` rejects any request lacking a valid SpendPass token signed with Gate's private HMAC secret. |
| **T-02** | SpendPass Replay / Duplicate Execution | Agent or malicious interceptor resubmits an already-used SpendPass token. | Atomic SQLite claim transition (`claimSpendPass`) changes state `ISSUED -> CLAIMED` before outbound network dispatch. Replays fail with `SPENDPASS_ALREADY_CLAIMED` / `TOKEN_ALREADY_CONSUMED`. |
| **T-03** | Concurrent Double-Claim Race Condition | Two parallel threads submit the identical SpendPass token simultaneously. | SQLite row-level locks and atomic `UPDATE spendpass_tokens SET status='CLAIMED' WHERE id=? AND status='ISSUED'` ensure exactly one caller succeeds; all concurrent callers fail closed. |
| **T-04** | Scope Hijacking / Parameter Tampering | Attacker intercepts SpendPass and modifies recipient, merchant, or product to divert funds. | SpendPass payload is cryptographically signed. Any modification invalidates the HMAC signature (`INVALID_SIGNATURE`). Execution context is strictly validated against token claims. |
| **T-05** | Merchant Price Slippage / Over-Charge | Merchant raises price of product after intent evaluation but before order execution. | Runner checks live merchant package price against the immutable SpendPass `max_amount`. If `actualPrice > max_amount`, execution fails with `PRICE_EXCEEDS_AUTHORIZATION`. |
| **T-06** | Network Timeout Ambiguity (Double-Spend Risk) | Outbound order submission to Bitrefill times out; unknown whether order was created. | Uncertain-outcome safety rule: Runner flags execution as `UNCERTAIN` and holds the Gate ledger reservation active. Runner **never** blindly retries or cancels reservations without reconciliation. |
| **T-07** | Sensitive Credential & Code Exfiltration | Gift card codes, PINs, or API secrets leaked into agent chat logs, system logs, or API responses. | Constant-time pattern masking (`maskSensitiveCode`) converts raw codes to `ABCD-****-****-1234`. Raw claim codes are never stored in databases, logs, or API payloads. |

---

## 2. Cryptographic Token Verification Protocol

Prior to performing any external network request, `CommerceRunner` invokes `GateEngine.verifySpendPass(token, execContext)`:

```
+-------------------------------------------------------------+
|               SpendPass JWT Validation Pipeline             |
+-------------------------------------------------------------+
  1. Structural format check (Header.Payload.Signature)
  2. Header algorithm validation (HS256) & Key ID verification
  3. Constant-time HMAC-SHA256 signature verification
  4. Issuer ("zbits:gate") and Audience ("zbits:runner") check
  5. Time bounds verification (nbf <= now <= exp)
  6. Persistence state check in SQLite (status == 'ISSUED')
  7. Exact Scope Matching:
     - Recipient: token.sub == execContext.recipientId
     - Merchant: token.merchant == execContext.merchantId
     - Product: token.product_id == execContext.productId
     - Denomination: token.denomination == execContext.denomination
     - Price Ceiling: execContext.actualAmountCents <= token.max_amount
+-------------------------------------------------------------+
```

If **any** check fails, Runner halts execution immediately and logs a `runner_execution_blocked` security alert in the audit log.

---

## 3. Sensitive Data Masking Policy

In autonomous agent platforms, gift-card codes and PINs returned by merchants are high-value bearer instruments:

### Masking Rules:
1. **Raw Codes Strictly Disallowed:** Raw gift-card voucher codes, PINs, or redemption URLs must never appear in `runner_invoices`, `runner_executions`, `audit_events`, SQLite rows, or WebSocket live events.
2. **Standard Mask Pattern:**
   ```typescript
   public maskSensitiveCode(code?: string | null): string | null {
     if (!code) return null;
     const trimmed = code.trim();
     if (trimmed.length <= 8) {
       return "****";
     }
     const prefix = trimmed.slice(0, 4);
     const suffix = trimmed.slice(-4);
     return `${prefix}-****-****-${suffix}`;
   }
   ```
   *Example:* `STEAM-9876-5432-1098-2026` -> `STEA-****-****-2026`.

---

## 4. Uncertain Outcome Management

When dealing with third-party merchant APIs over public networks, network dropouts and gateway timeouts (`ETIMEDOUT`, `504 Gateway Timeout`) are inevitable.

### The Problem
If Runner assumes a timed-out request failed and releases the reservation, the merchant might have actually processed the order and debited Bitrefill balance, resulting in unaccounted financial loss. If Runner assumes it succeeded, the agent might never receive the voucher.

### The Z-Bits Solution
1. Runner immediately marks the execution record status as `UNCERTAIN`.
2. Reason code `MERCHANT_OUTCOME_UNCERTAIN` is persisted.
3. The SpendPass token remains in `CLAIMED` status (cannot be reused by the agent).
4. The Gate reservation in `spending_ledger` remains `RESERVED` (funds are held safe and cannot be spent on other items).
5. A high-priority audit event `runner_purchase_uncertain` is dispatched for operator inspection and out-of-band reconciliation.
