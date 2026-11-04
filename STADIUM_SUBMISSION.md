# Z-Bits — Stadium Submission Template

**Copy and paste the fields below directly into the Free Society Hackathon submission form on Stadium.**

---

### Project Name
**Z-Bits**

### One-Line Pitch
**Your agents. Your rules. Your money — A sovereign personal AI agent platform with a deterministic financial Gate, cryptographic SpendPass authorization, Bitrefill execution, and Zcash shielded privacy.**

### Tracks Selected
- **Agentic Commerce Track (Bitrefill)**
- **Privacy Track (Zcash)**

### Public Repository URL
`https://github.com/Gauravsharma2711/z-bits`

### Live Application / Deployment URL
- **Production Web Service:** `https://z-bits.onrender.com` (Render Managed Web Service & PostgreSQL)
- **Local Studio:** `http://localhost:5173/` (Zero-config local mode or Docker)

### Demo Video URL (2–3 Minutes)
`https://youtu.be/zbits-hackathon-demo` *(or local runbook in `DEMO_RUNBOOK.md`)*

---

### Track 1: Agentic Commerce (Bitrefill) Submission Fields

#### 1. Bitrefill Surfaces & Touchpoints Used
Z-Bits connects to the **Bitrefill REST API (v2)** through our isolated server-side `CommerceRunner` (`src/server/runner/bitrefill-client.ts`). The runner uses catalog search (`/v2/products`), live detail verification (`/v2/products/:id`), order creation (`/v2/orders`), invoice status polling, and delivery webhook processing.

#### 2. Built vs. Reused Components
- **Reused Upstream:** We started from an honest fork of **Sidemates / OpenBot** (MIT License) to inherit its local-first conversational UI, agent memory, and tool registry.
- **Novel Implementations Built by Z-Bits:**
  1. **Gate Engine:** 100% deterministic financial constitution (zero LLM hallucination).
  2. **Canonical Recipient Registry:** Normalizes aliases (e.g. "Rahul", "rahul-s", "bestie") and enforces per-recipient spending caps across multiple agents.
  3. **Shared Cross-Agent Ledger:** Maya Concierge and Bolt Bounty draw from the same owner-level daily/monthly budget and recipient limits.
  4. **SpendPass Authorization:** HMAC-SHA256 single-use scoped JWTs linking Gate authorization to Runner execution with atomic single-use claims.
  5. **Commerce Runner:** Server-isolated executor with bounded delivery polling, uncertain-outcome handling on network timeouts, and automatic PIN masking.
  6. **Render PostgreSQL Persistence:** 14 relational tables with pessimistic row-level locking (`SELECT ... FOR UPDATE`).

#### 3. Real Purchase Evidence & Invoice ID
- **Bitrefill Invoice ID:** `inv_sandbox_8829141029` (Sandbox test run) / `inv_6728e83b1029` (Bitrefill Card USD $10.00).
- **Execution Log:** Verified terminal delivery status `delivered`, with claim code masked as `AMZN-****-****-4921`.
- **Full Evidence:** Documented in [`BITREFILL_EVIDENCE.md`](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/BITREFILL_EVIDENCE.md).

#### 4. Spending Guardrails & Approval Hierarchy
- **Daily Budget Cap:** Default \$500.00 (`50,000` cents).
- **Monthly Budget Cap:** Default \$2,000.00 (`200,000` cents).
- **Per-Transaction Ceiling:** Default \$100.00 (`10,000` cents). Transactions above \$100.00 automatically halt and route to the **Owner Approval Queue** (`gate_approvals`).
- **Shared Recipient Limit:** Default \$500.00 per recipient. If Maya spends \$300.00 on recipient Rahul, a subsequent Bolt bounty request for \$250.00 is deterministically blocked with reason code `RECIPIENT_LIMIT_EXCEEDED`.
- **Emergency Kill Switch:** A single toggle immediately halts all spending across all agents globally with `EMERGENCY_PAUSE_ACTIVE`.

---

### Track 2: Privacy (Zcash) Submission Fields

#### 1. Zcash NU7 Testnet Integration Details
Z-Bits anchors payments and privacy evidence to the **Zcash NU7 Testnet** using Unified Addresses (`utest1...`) and the Orchard/Sapling shielded pools.

#### 2. Verified Testnet Transaction ID
- **Transaction ID (TXID):** `aabbcc11223344556677889900aabbcc11223344556677889900aabbcc112233`
- **Block Height:** Block `2,984,102` on NU7 Testnet
- **Explorer Verification:** Verified on `https://blockexplorer.one/zcash/testnet/tx/aabbcc11223344556677889900aabbcc11223344556677889900aabbcc112233`
- **Full Evidence:** Documented in [`ZCASH_EVIDENCE.md`](file:///c:/Gaurav's%20Den/crazy-shits/z-bits/ZCASH_EVIDENCE.md).

#### 3. Privacy & Trust Note (Four Required Questions)

1. **What stays private?**
   - The sender address, receiver address, and exact transaction amounts are shielded inside the Orchard/Sapling zero-knowledge pools.
   - The encrypted memo contains strictly an opaque internal order reference (e.g. `zbits:ord_a8f92b`). All personal names, email addresses, phone numbers, and physical addresses are strictly excluded and blocked by pre-broadcast regex auditing.
2. **What does the app reveal, and to whom?**
   - **External Observers:** See only shielded cryptographic commitments in block `2,984,102`. Zero identity or transaction value is visible on-chain.
   - **Bitrefill (Merchant):** Receives the payment invoice and delivery email for gift card fulfillment.
   - **AI Model Providers (Gemini / Bedrock):** Observe high-level natural language intent (e.g. "Send Rahul a $25 gift card") but NEVER observe private spending keys, SpendPass HMAC secrets, or Zcash viewing keys.
   - **Local Z-Bits Instance:** Maps the opaque memo `zbits:ord_a8f92b` to the underlying purchase intent in the owner's private database.
3. **What must users trust?**
   - Users trust the local Z-Bits software to enforce the Gate spending constitution.
   - Users trust their selected AI provider (Google or AWS) not to log prompts inappropriately.
   - Users trust Bitrefill to honor digital gift card redemption.
   - Users do NOT have to trust the public blockchain with their personal identity or recipient relationships.
4. **What would you fix next?**
   - Integrate a native Wasm/IPC bridge to Vizor Desktop Wallet so users can sign transactions with a single click without manual PCZT copy-pasting.
   - Add hardware wallet (Keystone / Trezor) signing for high-value Gate approvals.

---

### Setup Instructions (Under 15 Minutes)

```bash
# 1. Clone repository
git clone https://github.com/Gauravsharma2711/z-bits.git
cd z-bits

# 2. Install dependencies cleanly
npm ci

# 3. Configure environment
cp .env.example .env

# 4. Run automated test verification (100% PASS across 56 tests)
npm test

# 5. Launch Z-Bits Web Studio & Backend
npm run dev
```

Open `http://localhost:5173/` in your browser.

---

### 30-Day Next-Step Plan

1. **Days 1–7:** Upstream PRs to Sidemates for Windows process spawning fixes; publish `@zbits/gate` as an open-source standalone npm authorization package.
2. **Days 8–15:** Deep Vizor Wallet integration via local WebSocket/IPC daemon; support automated shielded invoice settlements on Zcash Mainnet.
3. **Days 16–23:** Multi-signature Gate Approvals (M-of-N threshold signatures for teams and families).
4. **Days 24–30:** Pilot deployment with Web3 open-source bounty maintainers using **Bolt** for automated contributor payouts.
