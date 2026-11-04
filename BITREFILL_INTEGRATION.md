# Bitrefill Integration Specification & Protocol Guide

**Component:** Bitrefill Commerce Adapter  
**Client Implementation:** `src/server/runner/bitrefill-client.ts`  
**API Version:** Bitrefill REST API v2  
**Protocol:** HTTPS JSON REST with HTTP Basic / Bearer Authentication  

---

## 1. Authentication & Security Configuration

Bitrefill API v2 uses API Key and API Secret credentials for server-to-server operations.

### Configuration Environment Variables

```bash
# Production / Live API Credentials
BITREFILL_API_KEY=your_bitrefill_api_key_here
BITREFILL_API_SECRET=your_bitrefill_api_secret_here
BITREFILL_API_BASE_URL=https://api.bitrefill.com/v2

# Testing & Sandbox Mode
BITREFILL_SANDBOX=false # Set to true to force sandbox testing even if keys exist
```

### Server-Side Security Model
- **Zero Client Exposure:** Credentials never leak to the frontend React application, Vite bundles, or AI agent context transcripts.
- **Header Construction:** `Authorization: Basic base64(apiKey:apiSecret)` or Bearer token generated strictly inside `BitrefillClient.getAuthHeader()`.

---

## 2. Supported Operations & API Endpoints

### 2.1 Product Catalog Discovery
- **Endpoint:** `GET /products`
- **Query Parameters:**
  - `query`: Text search term (e.g., `"steam"`, `"amazon"`, `"uber"`).
  - `country`: Two-letter ISO country code (e.g., `"US"`, `"CA"`, `"GB"`).
- **Client Method:** `BitrefillClient.searchProducts(query, country)`
- **Response Format:**
  ```json
  [
    {
      "id": "steam-usa",
      "name": "Steam Gift Card USD",
      "country": "US",
      "currency": "USD",
      "categories": ["gaming", "digital_gift_cards"],
      "isAvailable": true,
      "packages": [
        { "value": 1000, "price": 1000, "currency": "USD" },
        { "value": 1500, "price": 1500, "currency": "USD" },
        { "value": 2000, "price": 2000, "currency": "USD" },
        { "value": 5000, "price": 5000, "currency": "USD" }
      ]
    }
  ]
  ```

### 2.2 Product Detail & Denomination Validation
- **Endpoint:** `GET /products/{productId}`
- **Client Method:** `BitrefillClient.getProductDetails(productId)`
- **Validation Rules:**
  - Must return `isAvailable === true` (in-stock).
  - Denomination requested by SpendPass must match an exact package in `packages`.
  - Package price must satisfy: `package.price <= spendpass.max_amount`.

### 2.3 Order Submission
- **Endpoint:** `POST /orders`
- **Client Method:** `BitrefillClient.createOrder({ productId, denominationCents, currency, recipientEmail })`
- **Request Payload:**
  ```json
  {
    "products": [
      {
        "product_id": "steam-usa",
        "value": 20.00,
        "quantity": 1
      }
    ],
    "auto_pay": true,
    "payment_method": "balance",
    "email": "orders@z-bits.local"
  }
  ```
- **Response:**
  ```json
  {
    "invoiceId": "inv_bf_1730718900_abc123",
    "orderId": "ord_bf_1730718900_abc123",
    "status": "pending",
    "deliveryStatus": "pending",
    "totalCents": 2000,
    "currency": "USD",
    "createdAt": "2026-11-04T10:45:00.000Z"
  }
  ```

### 2.4 Invoice & Fulfillment Polling
- **Endpoint:** `GET /invoices/{invoiceId}`
- **Client Method:** `BitrefillClient.getInvoice(invoiceId)`
- **Delivery Lifecycle:**
  1. `pending` (Invoice created; awaiting processing)
  2. `delivering` (Merchant processing fulfillment; `status: paid`)
  3. `delivered` (Digital code issued; `status: delivered`)
  4. `failed` (Fulfillment failed; terminal error)

---

## 3. The Delivery Verification Rule: `Paid != Delivered`

A foundational architectural requirement of Z-Bits Runner is that **payment confirmation does not equal delivery**:

- In digital commerce and gift-card APIs, a merchant invoice can be marked `paid` before the digital code is generated or delivered by the inventory distributor.
- If an agent platform considers `paid` as the terminal state, funds would be permanently settled from the owner's budget even if delivery subsequently fails due to inventory depletion or distribution lockouts.
- **Runner Requirement:** Runner continues polling until `deliveryStatus === 'delivered'`. Only upon verified delivery does Runner:
  1. Settle the Gate ledger reservation (`spending_ledger.status = 'SETTLED'`).
  2. Mark the SpendPass token as `CONSUMED`.
  3. Record the masked gift card code reference in the invoice record.

---

## 4. High-Fidelity Sandbox Mode

To allow complete, deterministic end-to-end testing without incurring financial costs or requiring live API secrets:

1. **Automatic Activation:** When `BITREFILL_API_KEY` is not present in `.env`, or when running under `NODE_ENV === "test"`, the client automatically activates sandbox mode.
2. **Realistic Progression:** Polling calls against sandbox invoices automatically advance the lifecycle state:
   - Call 1: `status: pending, deliveryStatus: pending`
   - Call 2: `status: paid, deliveryStatus: delivering`
   - Call 3: `status: delivered, deliveryStatus: delivered` (returns masked voucher code `STEAM-****-****-2026`)
3. **Simulation Hooks:** For automated regression tests, the client exposes `setSimulateTimeout(true)` and `setSimulateOrderFailure(true)` to verify uncertain network outcomes and terminal error handling.
