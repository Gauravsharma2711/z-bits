# Z-Bits: Render PostgreSQL Deployment Guide

This document provides complete instructions for deploying **Z-Bits** with **Render Managed PostgreSQL**.

---

## 1. Quick Deploy via Render Blueprint (Recommended)

Z-Bits includes an infrastructure-as-code Blueprint file: `render.yaml` located at the root of the repository.

### Step 1: Connect Repository to Render
1. Navigate to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New** → **Blueprint**.
3. Connect your GitHub / GitLab repository containing the `z-bits` codebase.
4. Select the `database/postgresql-render` branch (or `main` upon merging).

### Step 2: Review Blueprint Services
Render will automatically detect the two coordinated services defined in `render.yaml`:
1. **`zbits-postgres`**: Managed PostgreSQL 16 database (Starter tier with 10 GB SSD).
2. **`z-bits`**: Node.js Web Service running Express, TypeScript runtime, and Vite frontend.

Render injects the internal connection string automatically:
```yaml
envVars:
  - key: DATABASE_URL
    fromDatabase:
      name: zbits-postgres
      property: connectionString
```

### Step 3: Populate Sensitive Keys
Before launching, provide values for the generated secrets:
- `GATE_SIGNING_SECRET`: Cryptographic secret for Gate HMAC state validation.
- `SPENDPASS_SECRET_KEY`: Cryptographic signing key for single-use JWT SpendPass tokens.
- `BITREFILL_API_KEY` / `BITREFILL_API_SECRET`: (Optional for live Bitrefill orders; mock runner is enabled if omitted).
- `ZCASH_TESTNET_RPC_URL` / `ZCASH_EXPLORER_API`: Zcash testnet verification endpoints.

Click **Apply** to provision both database and application.

---

## 2. Manual Setup (Alternative)

If you prefer provisioning resources manually:

### 1. Provision Render PostgreSQL
1. Click **New** → **PostgreSQL**.
2. **Name:** `zbits-postgres`
3. **Database:** `zbits`
4. **User:** `zbits_user`
5. **Region:** Choose the region closest to your users (e.g. `Oregon (US West)` or `Frankfurt (EU)`).
6. **PostgreSQL Version:** `16`
7. Click **Create Database**.

### 2. Copy Internal Connection String
Under database **Connections**, copy the **Internal Database URL** (e.g. `postgres://zbits_user:...@dpg-...-a/zbits`).

### 3. Provision Web Service
1. Click **New** → **Web Service**.
2. **Runtime:** Node
3. **Build Command:** `npm install && npm run build`
4. **Start Command:** `npm start`
5. Under **Environment Variables**, set:
   - `DATABASE_URL`: *(paste Internal Database URL)*
   - `DATABASE_SSL`: `true`
   - `DATABASE_MAX_CONNECTIONS`: `20`
   - `NODE_ENV`: `production`
   - `PORT`: `10000`

---

## 3. Database Migration Execution

Z-Bits supports two distinct migration workflows:

### A. Automatic Boot Migration (Default)
When `DATABASE_URL` is configured, `DatabaseService.initialize()` automatically runs all pending SQL files from `src/server/db/migrations/` in transaction-safe sequential order before the web server begins accepting traffic.

### B. Manual CLI Migration
You can also run migrations manually via SSH or Render Shell:
```bash
# Apply pending migrations
npm run db:migrate

# Inspect migration status and applied version list
npm run db:status

# Reset database schema (development only)
npm run db:reset
```

---

## 4. Health Checks & Zero-Downtime Deployment

Render is configured to poll the `/api/readyz` endpoint before shifting traffic to a new deployment container:

```yaml
healthCheckPath: /api/readyz
```

- If PostgreSQL is unreachable or migrations have failed, `/api/readyz` returns HTTP `503 Service Unavailable`, preventing the release of an unhealthy container.
- When PostgreSQL is healthy and migrations are verified, `/api/readyz` returns HTTP `200 OK` and traffic transitions seamlessly.

---

## 5. Backup & Point-in-Time Recovery

1. **Daily Automated Backups:** Render PostgreSQL automatically captures daily snapshots with 7-day retention on standard tiers.
2. **Manual Snapshot:** Under database **Backups**, click **Take Backup Now**.
3. **Restoring a Backup:** You can create a clone of the database from any snapshot directly from the Render dashboard.

---

## 6. Local Development with Docker

To run the exact same PostgreSQL 16 environment locally:

```bash
# Start PostgreSQL container
docker compose up -d

# Verify database is healthy
docker compose ps

# Run migrations
npm run db:migrate

# Check status
npm run db:status
```
