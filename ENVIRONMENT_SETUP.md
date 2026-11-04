# Z-Bits Environment Setup & Security Guide

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Phase 07–08 — Privacy Integration & Dashboard  
**Security Policy:** ZERO HARDCODED CREDENTIALS • FAIL-CLOSED DEFAULTS

---

## 1. Quick Start Guide

### Step 1: Copy Environment Template
```bash
cp .env.example .env
```
*(Never commit `.env` to Git. The `.gitignore` file is pre-configured to ignore `.env`, `.env.local`, and `*.key` files).*

### Step 2: Configure Core Platform Settings
For local development and testing, Z-Bits operates with safe fallback defaults:
- **Gate Secret:** Generate a random 64-character hex secret for `SPENDPASS_SECRET_KEY`:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Zcash Network:** Defaults to `testnet` (NU7 Testnet).
- **Merchant Sandbox:** Defaults to Bitrefill sandbox mode when `BITREFILL_API_KEY` is blank.

### Step 3: Run the Verification Suite
```bash
# Run all 8 mandatory E2E scenarios
npm run test:e2e
# Or direct command:
$env:NODE_ENV="test"; node --import tsx --test src/server/e2e/e2e-scenarios.test.ts
```

### Step 4: Start the Application
```bash
npm run dev
```
Access the Z-Bits Dashboard at `http://localhost:5173/`.

---

## 2. Environment Variables Reference

| Variable Name | Required | Default / Format | Description |
| :--- | :---: | :--- | :--- |
| `SPENDPASS_SECRET_KEY` | Recommended | Random 32-byte hex | Cryptographic signing key for SpendPass JWT tokens (HMAC-SHA256). |
| `SPENDPASS_TTL_SECONDS` | Optional | `900` (15 mins) | Validity lifespan of issued purchase authorization tokens. |
| `GATE_DAILY_BUDGET_CENTS` | Optional | `15000` ($150.00) | Default daily cumulative spend ceiling across all agents. |
| `GATE_APPROVAL_THRESHOLD_CENTS` | Optional | `2000` ($20.00) | Purchases exceeding this value require manual human approval. |
| `BITREFILL_API_KEY` | Optional | Blank | Live Bitrefill merchant API key (runs in sandbox if blank). |
| `BITREFILL_API_SECRET` | Optional | Blank | Live Bitrefill merchant API secret. |
| `ZCASH_NETWORK` | Optional | `testnet` | Target Zcash network (`testnet` or `mainnet`). |
| `ZCASH_LIGHTWALLETD_ENDPOINT` | Optional | `https://zcash-testnet.lightwalletd.com:9067` | Public lightwalletd gRPC/HTTP proxy endpoint. |
| `ZCASH_EXPLORER_URL` | Optional | `https://blockexplorer.one/zcash/testnet/tx/` | Primary testnet block explorer URL. |

---

## 3. Security Hygiene Checklist

- [x] No private wallet keys or seed phrases exist in `.env`, source code, or logs.
- [x] All database files are stored locally in the OS user app directory (`zbits.db`).
- [x] Merchant claim codes are masked in all terminal outputs and UI views by default.
- [x] Emergency Pause kill switch is readily accessible from the dashboard.

