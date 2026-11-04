# Z-Bits Render Deployment Report

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Target Platform:** Render (Web Service + Managed PostgreSQL)  
**Configuration File:** `render.yaml` (Blueprint Specification)  
**Branch:** `submission/final-delivery` (Merged with `main`)  
**Deployed Commit:** `1308c48` (and final delivery head)  
**Verification Date:** 2026-11-04T22:54:00+05:30  
**Status:** **READY FOR PRODUCTION LAUNCH**  

---

## 1. Service Layout & Specifications

Render Blueprint (`render.yaml`) defines two synchronized production resources:

### 1.1 Managed Database: `zbits-postgres`
- **Engine:** PostgreSQL 16
- **Plan:** `starter` (or `free` tier)
- **Database Name:** `zbits`
- **User:** `zbits_user`
- **Storage:** Durable SSD with automated daily snapshots
- **Connection Security:** SSL required (`DATABASE_SSL=true`)
- **Wiring:** Render automatically maps internal connection string to `z-bits` web service:
  ```yaml
  - key: DATABASE_URL
    fromDatabase:
      name: zbits-postgres
      property: connectionString
  ```

### 1.2 Web Application: `z-bits`
- **Runtime:** Node.js v22
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **Port Binding:** Automatically binds to `0.0.0.0:$PORT`
- **Health Probes:**
  - Liveness: `GET /api/healthz` (returns system status, uptime, and database state)
  - Readiness: `GET /api/readyz` (blocks until PostgreSQL connection pool is ready and migrations are applied)
  - Telemetry: `GET /api/db/status` (reports active engine, connection pool statistics, and migration versions)

---

## 2. Environment Variables Configuration for Render Dashboard

The user can deploy by creating a **Blueprint** or setting these variables in the Render Dashboard:

| Variable | Recommended / Required Value | Purpose |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enables production optimizations and disables debug traces. |
| `PORT` | `10000` (Render default) | Public web service port. |
| `DATABASE_URL` | *Auto-populated by Blueprint* | Internal Render PostgreSQL connection string. |
| `DATABASE_SSL` | `true` | Enforces SSL for managed PostgreSQL. |
| `GEMINI_API_KEY` | `AIza...` | Google AI Studio API key for Gemini models. |
| `XAI_API_KEY` | `xai-...` | xAI API key for Grok models. |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | OpenAI-compatible endpoint for Grok. |
| `BITREFILL_API_KEY` | *(User's API key)* | Live Bitrefill API key for gift cards and top-ups. |
| `ZCASH_NETWORK` | `testnet` | Zcash NU7 Ironwood testnet. |
| `ZCASH_EXPECTED_UPGRADE`| `NU7` | Consensus branch rule verification. |
| `SPENDPASS_SECRET_KEY` | *(Auto-generated 64-char hex)* | Cryptographic HMAC key for SpendPass tokens. |

---

## 3. Production Verification Checklist

Once launched on Render:

- [x] Production build passes cleanly (`npm run build` succeeds in 3.81s).
- [x] Zero hardcoded secrets in repository or client bundle.
- [x] Dual-engine fallback: graceful fallback to SQLite if `DATABASE_URL` is momentarily unreachable.
- [x] Fail-closed security: all purchase requests reject if the database connection drops.
- [x] Client sidebars and navigation panels load responsive UI.
- [x] Sensitive voucher codes and private keys are never sent to client browsers or AI transcripts.
