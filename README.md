<h1 align="center">Z-Bits</h1>

<p align="center">
  <strong>Your agents. Your rules. Your money.</strong><br />
  A free, open-source personal AI agent platform that gives you a team of specialized AI agents called Bits.<br />
  Autonomous execution, multi-provider AI intelligence, deterministic financial Gate, and shielded Zcash privacy.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#the-bits-team">The Bits Team</a> ·
  <a href="#deterministic-gate--spendpass">Gate & SpendPass</a> ·
  <a href="#runner--bitrefill-execution">Runner (Bitrefill)</a> ·
  <a href="#zcash-shielded-privacy">Zcash Privacy</a> ·
  <a href="#render-postgresql-deployment">Render Deployment</a> ·
  <a href="PRIVACY_AND_TRUST.md">Privacy & Trust</a> ·
  <a href="SECURITY_AND_ATTACK_TEST_REPORT.md">Security Report</a> ·
  <a href="30_DAY_ROADMAP.md">30-Day Roadmap</a> ·
  <a href="FEEDBACK.md">Ecosystem Feedback</a>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Node: 20+" src="https://img.shields.io/badge/node-20%2B-green.svg" />
  <img alt="Tests: 73 passed" src="https://img.shields.io/badge/tests-73%20passed-brightgreen.svg" />
  <img alt="Zcash: NU7 Testnet" src="https://img.shields.io/badge/zcash-NU7%20Shielded-gold.svg" />
  <img alt="Database: PostgreSQL 16" src="https://img.shields.io/badge/database-PostgreSQL%2016-blue.svg" />
</p>

---

## What is Z-Bits?

Hosted agent services lock you into a single proprietary model and rent you access to computing time. **Z-Bits** runs locally or on your own private infrastructure, giving you full sovereignty over your agents, instructions, memories, and budget.

- **Universal AI Providers:** Connect **Google Gemini** (via `@google/genai`), **xAI Grok** (via OpenAI-compatible REST API at `https://api.x.ai/v1`), **AWS Bedrock**, local inference (Ollama, LM Studio), or self-hosted models.
- **The Bits Team:** Work with specialized Bits designed for real responsibilities:
  - **Maya (Concierge Bit):** Everyday tasks, synthesis, vendor comparisons, gifting, and personal commerce inquiries.
  - **Bolt (Bounty Bit):** Contributor rewards, repository maintenance, bug fix payouts, and developer workflows.
- **Deterministic Financial Gate:** Language models hallucinate and cannot be trusted with financial boundaries. In Z-Bits, all commerce requests pass through a mathematical **Gate** policy that enforces strict per-transaction caps, daily/monthly budgets, and canonical recipient registries before generating a cryptographically signed HMAC-SHA256 authorization token (**SpendPass**).
- **Runner Execution Service:** Commercial execution (such as Bitrefill voucher purchasing and Zcash shielded settlements) occurs in an isolated server environment. Sensitive payment tokens, merchant secrets, and private keys are never exposed to AI models or client browsers.
- **Render PostgreSQL Persistence:** Production-ready dual-engine architecture: runs offline in zero-config local SQLite, or with Render Managed PostgreSQL 16 with row-level pessimistic locking (`SELECT ... FOR UPDATE`) and managed migrations.

---

## The Bits Team

Z-Bits introduces an extensible presentation mapping layer that provides tailored personas while preserving the proven underlying agent runtime:

| Persona | Title | Internal ID | Key Responsibilities | Financial Integration |
|---|---|---|---|---|
| **Maya** | Concierge Bit | `nova` | General assistance, vendor comparisons, gift card requests | Submits purchase intents to Gate |
| **Bolt** | Bounty Bit | `pixel` | Repository maintenance, contributor rewards, bug bounties | Enforces contributor recipient limits |

Both Maya and Bolt share the **exact same owner spending constitution** and **canonical recipient ledger**. If Maya spends \$300 for recipient "Rahul" (who has a \$500 limit), Bolt is deterministically blocked from spending more than \$200 for Rahul, regardless of what alias or bot initiates the request.

---

## Deterministic Gate & SpendPass

```text
[Bit Request: Intent] 
       │
       ▼
[Z-Bits Gate Policy Engine]
  ├─ Mathematical limit verification (Daily/Monthly budget, per-order cap)
  ├─ Recipient alias resolution to canonical identity & cap check
  ├─ Emergency Pause kill-switch check
  ├─ Idempotency & duplicate check
  └─ HMAC-SHA256 Cryptographic Authorization Token (SpendPass)
       │
       ▼
[Runner Execution Layer (Server-Side Isolation)]
  ├─ Validates SpendPass signature & atomic claim (single-use)
  ├─ Bitrefill Commerce Adapter (Live REST API v2)
  ├─ Bounded delivery polling (paid != delivered)
  ├─ Masks secret gift-card PINs (HEAD-****-TAIL)
  └─ Settles budget reservation in persistent PostgreSQL ledger
```

---

## Zcash Shielded Privacy

Z-Bits anchors financial verification and settlement onto the **Zcash NU7 Testnet**:

1. **Unified Addresses (ZIP 316):** Full support for shielded Unified Addresses (`utest1...`) and Sapling/Orchard pools.
2. **Strict Zero-PII Encrypted Memos:** Memos on-chain strictly follow the opaque format `zbits:ord_<id>`. A regex auditor blocks plain-text names, emails, and claim PINs fail-closed prior to broadcast.
3. **On-Chain Verification:** Transactions are verified on-chain via `blockexplorer.one` with confirmed block heights and confirmations.
   - **Sample TxID:** [`5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab`](https://blockexplorer.one/zcash/testnet/tx/5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab)
4. **Zingo & Vizor Wallet Workflow:** Non-custodial user-signing workflow. Zero private keys or seeds are stored on the server.
5. **Privacy & Trust:** Complete answers to what stays private, what is revealed, what is trusted, and production fixes documented in [PRIVACY_AND_TRUST.md](PRIVACY_AND_TRUST.md).

---

## Quick Start (< 15 Minutes)

### Prerequisites
- Node.js `v20.0.0` or later (tested on Node `v22.20.0`)
- npm `10+`

### Installation

```bash
# Clone the repository
git clone https://github.com/Gauravsharma2711/z-bits.git
cd z-bits

# Install dependencies
npm ci

# Configure environment variables
cp .env.example .env
```

### Running Locally

```bash
# Development mode (Vite frontend + Express backend)
npm run dev

# Or production build & start
npm run build
npm start
```

Open your browser at `http://localhost:5173/` or `http://127.0.0.1:4310` to launch **Z-Bits Studio**.

### Running Automated Test Suites (All 73 Passing)

```bash
# 1. End-to-End Security Scenarios (8 tests)
$env:NODE_ENV="test"; $env:BITREFILL_SANDBOX="true"; npx tsx --test src/server/e2e/e2e-scenarios.test.ts

# 2. Gate & SpendPass Security Engine (14 tests)
$env:NODE_ENV="test"; npx tsx --test src/server/gate/gate-engine.test.ts src/server/gate/spendpass.test.ts

# 3. Commerce Runner Service (16 tests)
$env:NODE_ENV="test"; $env:BITREFILL_SANDBOX="true"; npx tsx --test src/server/runner/runner.test.ts

# 4. Maya & Bolt Multi-Agent Workflows (18 tests)
$env:NODE_ENV="test"; $env:BITREFILL_SANDBOX="true"; npx tsx --test src/server/agents/agents-workflow.test.ts

# 5. Persistent PostgreSQL Database Engine (17 tests)
$env:NODE_ENV="test"; npx tsx --test src/server/db/postgres-zbits.test.ts
```

---

## Render PostgreSQL Deployment

Z-Bits is fully prepared for one-click deployment via **Render Blueprints** (`render.yaml`):

1. Go to the [Render Dashboard](https://dashboard.render.com/) and click **New** → **Blueprint**.
2. Connect your GitHub repository.
3. Render automatically provisions:
   - `zbits-postgres`: Managed PostgreSQL 16 database.
   - `z-bits`: Node.js web service with automatic migrations and `/api/readyz` health checks.
4. For detailed step-by-step instructions, see [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md).

---

## Official Hackathon Documentation

- [FINAL_DELIVERY_AUDIT.md](FINAL_DELIVERY_AUDIT.md) — Comprehensive readiness audit against all criteria.
- [SECURITY_AND_ATTACK_TEST_REPORT.md](SECURITY_AND_ATTACK_TEST_REPORT.md) — Real execution evidence for all 73 security tests.
- [BITREFILL_EVIDENCE.md](BITREFILL_EVIDENCE.md) — Live Bitrefill v2 API verification receipts and order execution flow.
- [ZCASH_EVIDENCE.md](ZCASH_EVIDENCE.md) — Zcash NU7 testnet transaction receipts and block explorer links.
- [PRIVACY_AND_TRUST.md](PRIVACY_AND_TRUST.md) — Full answers to the four core privacy questions.
- [30_DAY_ROADMAP.md](30_DAY_ROADMAP.md) — Post-hackathon 4-week production roadmap.
- [FEEDBACK.md](FEEDBACK.md) — DevEx feedback for Bitrefill and Zcash ecosystems.
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — Second-by-second script for the 2:45 demo video.
- [SUBMISSION_CONTENT.md](SUBMISSION_CONTENT.md) — Official Stadium submission text and links.

---

## License & Attribution

Z-Bits is released under the **MIT License**.

This project is an adapted fork and transformation of **Sidemates** (originally **OpenBot**), created by Robert Prisacariu and contributors. All original copyright notices, license terms, and required attributions are preserved in accordance with the MIT License. See [UPSTREAM_NOTICES.md](UPSTREAM_NOTICES.md) for complete details.
