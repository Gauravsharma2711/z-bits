# Z-Bits SpendPass: API Reference

> **Tagline:** Your agents. Your rules. Your money.  
> **Base URL:** `/api/gate/spendpass`  
> **Content-Type:** `application/json`

---

## 1. Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/gate/spendpass` | Lists SpendPass token records for the owner (supports status & limit filters). |
| `GET` | `/api/gate/spendpass/:id` | Retrieves a specific SpendPass record by token ID or `jti`. |
| `POST` | `/api/gate/spendpass/verify` | Validates a SpendPass compact JWT token against cryptographic and execution scopes. |
| `POST` | `/api/gate/spendpass/claim` | Atomically transitions token state from `ISSUED` to `CLAIMED` for a specific execution ID. |
| `POST` | `/api/gate/spendpass/consume` | Atomically transitions token state from `CLAIMED` to `CONSUMED` upon completed purchase. |
| `POST` | `/api/gate/spendpass/:id/revoke` | Revokes an active token and releases its budget reservation. |

---

## 2. Endpoint Details

### 2.1 List SpendPass Tokens

**`GET /api/gate/spendpass`**

**Query Parameters:**
- `status` *(optional)*: Filter by `ISSUED`, `CLAIMED`, `CONSUMED`, `REVOKED`, or `EXPIRED`.
- `limit` *(optional)*: Maximum records to return (default: `50`, max: `200`).

**Response (200 OK):**
```json
{
  "tokens": [
    {
      "id": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
      "jti": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
      "ownerId": "local-owner",
      "purchaseIntentId": "intent_1730000000_abc12",
      "authorizationId": "auth_99f8e7d6c5b4",
      "reservationId": "res_a1b2c3d4",
      "recipientId": "rec_self",
      "agentId": "nova",
      "merchantId": "bitrefill",
      "productId": "steam_15",
      "denomination": 1500,
      "currency": "USD",
      "maxAmount": 1500,
      "policyVersion": 1,
      "keyId": "k1",
      "status": "ISSUED",
      "executionId": null,
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImsxIn0...",
      "issuedAt": "2026-11-04T10:00:00.000Z",
      "expiresAt": "2026-11-04T10:15:00.000Z",
      "consumedAt": null,
      "revokedAt": null,
      "createdAt": "2026-11-04T10:00:00.000Z",
      "updatedAt": "2026-11-04T10:00:00.000Z"
    }
  ]
}
```

---

### 2.2 Verify SpendPass Token

**`POST /api/gate/spendpass/verify`**

Used by Runner prior to and during checkout to verify that the cryptographic signature is intact and the token scope matches the actual cart parameters.

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImsxIn0...",
  "executionContext": {
    "recipientId": "rec_self",
    "merchantId": "bitrefill",
    "productId": "steam_15",
    "denomination": 1500,
    "currency": "USD",
    "actualAmountCents": 1500,
    "executionId": "exec_555"
  }
}
```

**Success Response (200 OK):**
```json
{
  "valid": true,
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "jti": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "purchaseIntentId": "intent_1730000000_abc12",
  "recipientId": "rec_self",
  "merchantId": "bitrefill",
  "productId": "steam_15",
  "denomination": 1500,
  "currency": "USD",
  "maxAmount": 1500,
  "policyVersion": 1,
  "reasonCodes": []
}
```

**Failure Response (200 OK with `valid: false`):**
```json
{
  "valid": false,
  "reasonCodes": ["AMOUNT_EXCEEDED"],
  "errorMessage": "Amount exceeded: purchase price ($16.00) exceeds maximum authorized SpendPass limit ($15.00)."
}
```

---

### 2.3 Claim SpendPass for Execution

**`POST /api/gate/spendpass/claim`**

Locks the token for exclusive use by an execution runner, preventing concurrent double-claims.

**Request Body:**
```json
{
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "executionId": "exec_555"
}
```

**Success Response (200 OK):**
```json
{
  "ok": true,
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "executionId": "exec_555",
  "status": "CLAIMED"
}
```

**Conflict Response (409 Conflict):**
```json
{
  "error": "SpendPass \"sp_7a8b9c1d2e3f4a5b6c7d8e9f\" could not be claimed (already claimed, consumed, revoked, or expired)."
}
```

---

### 2.4 Complete Execution (Consume SpendPass)

**`POST /api/gate/spendpass/consume`**

Finalizes the token and marks the associated budget reservation in `spending_ledger` as settled (`SETTLED`).

**Request Body:**
```json
{
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "executionId": "exec_555"
}
```

**Success Response (200 OK):**
```json
{
  "ok": true,
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "executionId": "exec_555",
  "status": "CONSUMED"
}
```

---

### 2.5 Revoke SpendPass

**`POST /api/gate/spendpass/:id/revoke`**

Owner-initiated cancellation of an unused or claimed token. Automatically releases the reserved budget.

**Request Body:**
```json
{
  "reason": "owner_requested_cancellation"
}
```

**Success Response (200 OK):**
```json
{
  "ok": true,
  "spendpassId": "sp_7a8b9c1d2e3f4a5b6c7d8e9f",
  "status": "REVOKED",
  "reason": "owner_requested_cancellation"
}
```

---

## 3. Reason Codes Reference

| Reason Code | Category | Meaning |
| :--- | :--- | :--- |
| `INVALID_SIGNATURE` | Cryptographic | Compact JWT signature verification failed or payload tampered. |
| `UNSUPPORTED_ALGORITHM` | Cryptographic | Algorithm in header is not `HS256` (e.g. `none` or RSA). |
| `UNKNOWN_SIGNING_KEY` | Cryptographic | Key ID (`kid`) is not present in active key ring. |
| `TOKEN_EXPIRED` | Temporal | Token has passed its `exp` expiration timestamp. |
| `TOKEN_NOT_YET_VALID` | Temporal | Current time is prior to token `nbf` timestamp. |
| `TOKEN_NOT_FOUND` | Persistence | Token `jti` does not exist in `spendpass_tokens` table. |
| `TOKEN_REVOKED` | State | Token status is `REVOKED`. |
| `TOKEN_ALREADY_CLAIMED` | State | Token is already locked by another `executionId`. |
| `TOKEN_ALREADY_CONSUMED` | State | Token has already been used for a completed purchase. |
| `RESERVATION_INVALID` | Ledger | Associated `spending_ledger` reservation is released or settled. |
| `PURCHASE_INTENT_MISMATCH` | Scope | Execution requested a different purchase intent ID. |
| `RECIPIENT_MISMATCH` | Scope | Execution recipient does not match authorized recipient ID. |
| `MERCHANT_MISMATCH` | Scope | Execution merchant does not match authorized merchant ID. |
| `PRODUCT_MISMATCH` | Scope | Execution product ID does not match authorized product ID. |
| `DENOMINATION_MISMATCH` | Scope | Execution denomination does not match authorized denomination. |
| `CURRENCY_MISMATCH` | Scope | Currency code does not match authorized currency. |
| `AMOUNT_EXCEEDED` | Scope | Actual checkout price exceeds authorized `max_amount`. |
| `EMERGENCY_PAUSE_ACTIVE` | Kill Switch | Gate Emergency Pause is active; all execution blocked. |
