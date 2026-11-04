# MAYA ARCHITECTURE REFERENCE — CONCIERGE BIT

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Component:** Maya Concierge Agent (`nova`)  
**Status:** Production Ready & Verified  
**Runtime Persona:** Maya (Concierge Bit, botId: `nova`, personaId: `maya`)

---

## 1. Role and High-Level Responsibility

Maya is the personal concierge Bit in Z-Bits. She handles personal gift card purchases, digital vouchers, balance top-ups, and occasion-based gifting on behalf of the owner.

### Core Functions
1. **Natural Language Understanding:** Parses user prompts to extract recipient name/alias, product category or brand, denomination amount, currency, and occasion.
2. **Ambiguity Resolution:** Interacts with Gate's canonical recipient registry to map aliases to verified identities (`CanonicalRecipient`). Fails closed when an identity is ambiguous or unverified.
3. **Product Discovery & Pricing:** Queries Runner and the Bitrefill catalog to find available digital gift cards and matching supported denomination packages.
4. **Structured Proposal Building:** Formulates a clear proposal detailing the item, price, recipient, and whether owner authorization will be required under Gate's spending constitution.
5. **Purchase Intent Generation:** Builds a cryptographically digested `PurchaseIntent` and submits it to Gate.
6. **Execution & Delivery Tracking:** If Gate issues an `ALLOW` decision with a signed `SpendPass`, delegates execution to Runner and verifies terminal fulfillment (`delivered` vs `failed`).

---

## 2. Security Boundaries & Invariants

Maya operates under strict zero-trust security boundaries:

```
[ User Prompt ]
       │
       ▼
[ Maya (Concierge) ] ── (NLP Entity Extraction)
       │
       ├─► Gate Registry Check: resolveRecipientSafely(alias)
       │       └── If ambiguous/missing ──► Returns Clarification Prompt
       │
       ├─► Runner Product Discovery: searchProducts(query)
       │
       ├─► Construct PurchaseProposal
       │
       ├─► Construct PurchaseIntent (Immutable digest)
       │
       ▼
   [ Gate Engine ] ◄── Evaluates Owner Constitution & Shared Ledger
       │
       ├── DENY ──────────────────► Returns deterministic reason codes
       ├── REQUIRE_APPROVAL ──────► Pauses execution, creates ApprovalRecord
       └── ALLOW ─────────────────► Issues signed, scoped, single-use SpendPass
                                         │
                                         ▼
                                   [ Runner ] ──► Executes on Bitrefill
```

### Invariant Rules
- **No Direct Financial Authority:** Maya cannot self-authorize purchases, modify budget limits, or alter recipient spending caps.
- **No Private Key Access:** Maya never possesses or accesses Gate's HMAC signing secrets.
- **No Merchant API Access:** Maya has zero network access to Bitrefill API endpoints. All purchases must proceed through Runner with a valid SpendPass.
- **Ambiguity Fails Closed:** When a recipient query is ambiguous (e.g. "Rahul" matches multiple entries), Maya refuses to guess and generates a structured clarification request.

---

## 3. Workflow Implementation Details

### A. Intent Extraction (`parseRequest`)
- Analyzes natural language strings using regex patterns and keyword mappings.
- Extracts:
  - `recipientAlias`: parsed from phrases like *"buy Alice a..."*, *"send Bob..."*, *"for myself"*.
  - `denominationCents` & `currency`: extracts amounts like `"$25"`, `"50 USD"`, `"€20"`.
  - `productQuery`: matches recognized digital brands (*steam, amazon, uber, doordash, apple, netflix, etc.*).
  - `occasion`: identifies gifting occasions (*birthday, anniversary, holiday, bonus*).
- Outputs `MayaIntentExtraction`:
  ```typescript
  export interface MayaIntentExtraction {
    rawQuery: string;
    recipientAlias?: string;
    canonicalRecipientId?: string;
    productQuery?: string;
    denominationCents?: number;
    currency: CurrencyCode;
    isAmbiguous: boolean;
    missingFields: string[];
    needsClarification: boolean;
    clarificationPrompt?: string;
  }
  ```

### B. Purchase Proposal (`createProposal`)
- Discovers live Bitrefill catalog items matching the extracted query.
- Finds exact or closest available denomination package.
- Evaluates against Gate's active constitution (`requireApprovalAboveCents`) to determine if human sign-off will be required before intent submission.
- Returns `MayaPurchaseProposal`.

### C. Purchase Submission (`submitPurchase`)
- Verifies recipient resolution via Gate's canonical registry.
- Verifies product availability and valid package pricing via Runner.
- Constructs an immutable `PurchaseIntent` with SHA-256 `intentDigest`.
- Submits intent to `GateEngine.evaluateIntent(intent, ownerId)`.
- Handles outcomes:
  - **DENY:** Explains exact rejection codes (*e.g. `DAILY_BUDGET_EXCEEDED`, `RECIPIENT_LIMIT_EXCEEDED`*).
  - **REQUIRE_APPROVAL:** Records persistent intent, returns `approvalId` for owner review in the Z-Bits UI.
  - **ALLOW:** Receives `SpendPass`, dispatches execution to `runner.executeSpendPass()`, and monitors terminal delivery.

---

## 4. Teammate Tool Exposure

Maya is bound to the `nova` agent runtime in Sidemates. Her dedicated tools include:
1. `maya_resolve_recipient`: Verify alias against Gate canonical recipient registry.
2. `maya_search_products`: Search available Bitrefill digital vouchers and products.
3. `maya_get_product_details`: Inspect product details and package denominations.
4. `maya_create_proposal`: Build structured purchase proposals for owner confirmation.
5. `maya_submit_purchase`: Submit intent to Gate and execute authorized purchases.
6. `maya_get_purchase_status`: Inspect execution and delivery progress.

Each tool execution strictly verifies `context.botId === "nova"`. Calls from unauthorized teammates (such as `pixel`) are denied at the gateway layer.
