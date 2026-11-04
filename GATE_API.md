# Z-Bits Gate: REST API Reference

The Gate service exposes REST endpoints for managing the owner's spending constitution, canonical recipients, approval queue, spending ledger, and intent evaluations.

---

## 1. Spending Constitution Endpoints

### `GET /api/gate/constitution`
Returns the current owner spending constitution, version, and live cumulative spend.

**Response (200 OK):**
```json
{
  "constitution": {
    "id": "default",
    "ownerId": "local-owner",
    "currency": "USD",
    "maxPerOrderCents": 5000,
    "dailyBudgetCents": 15000,
    "monthlyBudgetCents": 50000,
    "requireApprovalAboveCents": 2000,
    "allowedCategories": ["food", "streaming", "digital_gift_cards", "gaming", "utilities", "mobile"],
    "allowedMerchants": ["bitrefill", "steam", "amazon_egift", "uber_eats", "doordash"],
    "allowedDenominations": [],
    "trustedRecipientOnly": false,
    "emergencyPause": false,
    "policyVersion": 3,
    "createdAt": "2026-11-04T09:00:00.000Z",
    "updatedAt": "2026-11-04T09:15:00.000Z"
  },
  "spend": {
    "dailySpentCents": 3000,
    "monthlySpentCents": 3000,
    "recipientSpentCents": 0
  }
}
```

### `PUT /api/gate/constitution` or `PATCH /api/gate/constitution`
Mutates the owner spending constitution. Increments `policyVersion` and records an audit log event.

**Request Body:**
```json
{
  "maxPerOrderCents": 10000,
  "dailyBudgetCents": 25000,
  "requireApprovalAboveCents": 5000,
  "allowedMerchants": ["bitrefill", "steam", "amazon_egift"]
}
```

**Response (200 OK):**
```json
{
  "ok": true,
  "constitution": { ... }
}
```

### `POST /api/gate/emergency-pause`
Toggles or sets the emergency kill switch.

**Request Body:**
```json
{
  "paused": true
}
```

---

## 2. Recipient Registry Endpoints

### `GET /api/gate/recipients`
Lists all registered canonical recipients, their aliases, and current spending vs limit.

**Response (200 OK):**
```json
[
  {
    "id": "rec_rahul",
    "ownerId": "local-owner",
    "displayName": "Rahul Sharma",
    "status": "ACTIVE",
    "trusted": true,
    "recipientLimitCents": 50000,
    "aliases": [
      { "alias": "rahul", "normalizedAlias": "rahul" },
      { "alias": "Rahul Sharma", "normalizedAlias": "rahul sharma" }
    ],
    "spentCents": 30000,
    "remainingLimitCents": 20000
  }
]
```

### `POST /api/gate/recipients`
Registers a new canonical recipient with optional aliases and spending limit.

**Request Body:**
```json
{
  "displayName": "Rahul Sharma",
  "trusted": true,
  "recipientLimitCents": 50000,
  "aliases": ["rahul", "rahul.sharma@example.com"]
}
```

### `POST /api/gate/recipients/:id/aliases`
Adds an alias to an existing canonical recipient.

**Request Body:**
```json
{
  "alias": "+1-555-0199"
}
```

---

## 3. Intent Evaluation & Approvals

### `POST /api/gate/evaluate`
Submits a purchase intent from an agent for deterministic evaluation and reservation.

**Request Body:**
```json
{
  "intentId": "intent_7890",
  "idempotencyKey": "idem_123456",
  "botId": "nova",
  "personaName": "Maya",
  "merchant": "bitrefill",
  "recipient": "rahul",
  "amountCents": 3000,
  "currency": "USD",
  "itemDescription": "Steam Digital Card $30",
  "intentDigest": "8a3e9...",
  "createdAt": "2026-11-04T09:20:00.000Z"
}
```

**Response (200 OK — Allowed):**
```json
{
  "allowed": true,
  "requiresUserApproval": false,
  "decision": "ALLOW",
  "reason": "approved_under_threshold",
  "reasonCodes": ["ALLOWED_UNDER_THRESHOLD"],
  "policyNotes": "Purchase approved within deterministic Gate thresholds.",
  "policyVersion": 3,
  "canonicalRecipient": {
    "id": "rec_rahul",
    "displayName": "Rahul Sharma"
  },
  "reservation": {
    "id": "res_ab12cd",
    "amountCents": 3000,
    "status": "RESERVED",
    "expiresAt": "2026-11-04T09:35:00.000Z"
  },
  "signedAuthorization": {
    "authorizationId": "auth_99182",
    "intentId": "intent_7890",
    "authorizedAmountCents": 3000,
    "currency": "USD",
    "authorizedAt": "2026-11-04T09:20:00.000Z",
    "expiresAt": "2026-11-04T09:35:00.000Z",
    "signature": "3f98c8..."
  }
}
```

**Response (200 OK — Requires Owner Approval):**
```json
{
  "allowed": true,
  "requiresUserApproval": true,
  "decision": "REQUIRE_APPROVAL",
  "reason": "awaiting_user_approval",
  "reasonCodes": ["POLICY_REQUIRES_APPROVAL"],
  "policyNotes": "Amount ($35.00) exceeds auto-approval threshold ($20.00). Explicit owner approval required.",
  "approvalId": "appr_4f21e0",
  "policyVersion": 3
}
```

### `GET /api/gate/approvals`
Lists pending approvals awaiting owner review.

### `POST /api/gate/approvals/:id/resolve`
Resolves a pending approval with owner decision.

**Request Body:**
```json
{
  "decision": "APPROVED"
}
```
*(Accepts `"APPROVED"` or `"REJECTED"`)*

---

## 4. Ledger & Audit History

### `GET /api/gate/ledger`
Returns recent spending ledger entries with reservation statuses (`RESERVED`, `SETTLED`, `RELEASED`) and current daily/monthly spend.

### `GET /api/gate/audit`
Returns cryptographic audit log entries with severity levels, actors, and metadata.
