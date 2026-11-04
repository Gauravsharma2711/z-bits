# Z-Bits SpendPass: Security Architecture & Threat Model

> **Tagline:** Your agents. Your rules. Your money.  
> **Security Philosophy:** Autonomous AI agents are untrusted actors in financial transaction paths. Every purchase capability must be cryptographically bounded, deterministic, single-use, and fail-closed.

---

## 1. Threat Model & Mitigations

| Threat | Attack Scenario | SpendPass Defense Mechanism |
| :--- | :--- | :--- |
| **Token Replay / Double Spending** | An agent or malicious process intercepts a valid SpendPass token and submits it multiple times to Runner or multiple Runners to duplicate payments. | **Atomic Single-Use State Machine:** Runner must atomically execute `claimForExecution` before checkout. The transition from `ISSUED` to `CLAIMED` occurs inside SQLite `BEGIN IMMEDIATE ... COMMIT`. Any duplicate or parallel claim attempt immediately fails (`TOKEN_ALREADY_CLAIMED`). Once executed, the token transitions to `CONSUMED`. |
| **Parameter Tampering / Forgery** | An agent alters the payload of an issued SpendPass to increase `max_amount`, redirect `recipient_id`, or change `merchant_id`. | **HMAC-SHA256 Cryptographic Signature:** Any modification to the base64url payload invalidates the signature. Signature comparison is performed via constant-time `timingSafeEqual`. |
| **Algorithm Confusion (`alg: none`)** | An attacker replaces `alg: HS256` with `alg: none` and strips the signature, hoping the server accepts an unsigned JWT. | **Strict Algorithm Allowlisting:** The header decoder strictly requires `header.alg === "HS256"`. Any missing, empty, or alternative algorithm string is rejected with `UNSUPPORTED_ALGORITHM` before any payload claims are trusted. |
| **In-Flight Price Escalation** | A merchant or intermediary charges more than what Gate evaluated and approved. | **Hard Immutable Ceiling:** Runner execution context validation enforces `actualAmountCents <= claims.max_amount`. If the final checkout amount exceeds the authorized amount by even 1 cent, verification fails with `AMOUNT_EXCEEDED`. |
| **Stale / Zombie Authorizations** | An unused token is executed hours or days later after budget or policy conditions have changed. | **Dual Temporal Expiration:** Compact JWT includes `exp` timestamp (default: 15 minutes TTL). Additionally, SQLite persistence tracks `expires_at` and automatically expires reservations in `spending_ledger`. |
| **Unauthorized Recipient Substitution** | An agent substitutes the user's friend with an attacker-controlled crypto wallet or email. | **Cryptographic Recipient Binding:** The canonical `recipient_id` (resolved by Gate's strict normalizer) is baked into the signed token claims and verified against the execution context (`RECIPIENT_MISMATCH`). |
| **Post-Approval Compromise** | An anomaly or breach is detected after Gate issued tokens, but before Runner dispatched payments. | **Gate Emergency Pause Kill-Switch:** Activating `emergencyPause = true` automatically updates the database, revokes all unclaimed tokens for the owner, and causes any pending `verifySpendPass` or `claimSpendPass` call to fail closed with `EMERGENCY_PAUSE_ACTIVE`. |
| **Key Exposure / Rotation** | A signing key is compromised or scheduled for periodic rotation. | **Key ID (`kid`) Routing:** SpendPass supports multi-key configuration with active key rotation (`rotateSigningKey`). Tokens signed with retired keys fail with `UNKNOWN_SIGNING_KEY`. |

---

## 2. Cryptographic Construction

### 2.1 RFC 7519 Compact JWT Structure

```
${base64url(header)}.${base64url(payload)}.${base64url(HMAC-SHA256(signingInput, secret))}
```

Where `signingInput` is `${headerB64}.${payloadB64}`.

### 2.2 Constant-Time Signature Comparison

To prevent timing side-channel attacks where an attacker deduces signature bytes by measuring server response latency, signature verification uses Node.js `node:crypto.timingSafeEqual`:

```typescript
const sigBuf = Buffer.from(signatureB64, "utf8");
const expBuf = Buffer.from(expectedSignature, "utf8");

if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
  return this.failVerification(["INVALID_SIGNATURE"], "Cryptographic signature verification failed.");
}
```

---

## 3. SQLite Concurrency & ACID Guarantees

In financial systems, in-memory state or optimistic locking is vulnerable to process crashes and race conditions. SpendPass relies on Node 22's native `node:sqlite` in Write-Ahead Logging (WAL) mode:

```sql
BEGIN IMMEDIATE;
-- 1. Read token status, expiration, and reservation state
-- 2. Validate status == 'ISSUED' and exp > now
-- 3. Verify emergency_pause == 0
-- 4. Atomically update status to 'CLAIMED' and bind execution_id
COMMIT;
```

`BEGIN IMMEDIATE` ensures that no other write transaction can interleave between verification and state mutation, providing mathematical immunity to double-claim race conditions even under high concurrency.

---

## 4. Fail-Closed Security Policy

In every validation failure mode (malformed JSON, unknown key, signature mismatch, expired token, missing reservation, or mismatched merchant):
- The verification pipeline returns `{ valid: false, reasonCodes: [...] }`.
- Detailed audit logs are emitted for security tracing.
- No partial authorization is granted.
- The downstream runner halts execution immediately.
