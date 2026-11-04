# Z-Bits Unified Dashboard Architecture

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Phase 07–08 — Privacy Integration & Dashboard  
**Status:** IMPLEMENTED & VERIFIED

---

## 1. Dashboard Overview & Component Hierarchy

The Z-Bits Dashboard provides the central control panel for the platform owner. It unifies all eight core operational and governance surfaces into a responsive, real-time interface built with React, TypeScript, and Tailwind CSS.

```
src/
├── studio/
│   ├── ZbitsOverview.tsx           <-- Main platform KPI cards, quick actions & system status
│   ├── SpendingRulesPanel.tsx      <-- Complete 8-tab operations & governance console
│   │   ├── Tab: constitution       <-- Per-tx, daily, monthly limits, emergency pause
│   │   ├── Tab: recipients         <-- Canonical address book, alias mappings & caps
│   │   ├── Tab: approvals          <-- Human-in-the-loop pending approval resolver
│   │   ├── Tab: ledger             <-- Real-time cross-agent budget reservations & settlements
│   │   ├── Tab: purchases          <-- Bitrefill execution tracking & masked PIN reveal
│   │   ├── Tab: zcash              <-- Shielded testnet status, tx verification & Vizor guide
│   │   ├── Tab: agents             <-- Maya Concierge & Bolt Bounty live activity streams
│   │   └── Tab: audit              <-- Immutable cryptographic audit trail
```

---

## 2. The Eight Functional Areas

### 1. Platform Overview (`ZbitsOverview.tsx`)
- Displays real-time spending metrics: Daily spend vs. Daily limit, Monthly spend vs. Monthly limit.
- Runner & Merchant status: Active Bitrefill catalog status, total executions, total volume ($).
- Zcash Network badge: Live status of Zcash NU7 Testnet, active lightwalletd node, block height.
- Direct quick-navigation shortcuts to Constitution, Approvals, and Zcash Privacy Center.

### 2. Spending Constitution Panel (`SpendingRulesPanel.tsx?tab=constitution`)
- Per-Transaction Ceiling (e.g. $100.00).
- Daily Budget (e.g. $300.00).
- Monthly Budget (e.g. $1,000.00).
- Human Approval Threshold (e.g. $50.00).
- Emergency Pause Kill Switch: Instantly freezes all agent spending with zero downtime.

### 3. Recipient Management (`SpendingRulesPanel.tsx?tab=recipients`)
- Canonical recipient address book with display names and delivery emails.
- Alias resolution table (`"rahul"`, `"friend"`, `"self"`).
- Per-recipient cumulative spending caps enforcing cross-agent budget boundaries.
- Form to add new recipients with alias binding.

### 4. Spending Ledger (`SpendingRulesPanel.tsx?tab=ledger`)
- Live ledger of all active budget reservations and finalized settlements.
- Columns: Ledger ID, Agent (`maya` / `bolt`), Recipient, Amount, Status (`RESERVED`, `SETTLED`, `RELEASED`), Expires At.
- Guaranteed atomicity across concurrent agent calls.

### 5. Approval Center (`SpendingRulesPanel.tsx?tab=approvals`)
- Displays high-value or policy-flagged purchase requests in `PENDING` status.
- Shows agent, requested recipient, merchant, item description, and amount.
- One-click `Approve` or `Reject` actions. Approving atomically generates a SpendPass token and dispatches execution.

### 6. Purchase Tracking & Masked Claim Codes (`SpendingRulesPanel.tsx?tab=purchases`)
- Complete history of Bitrefill executions.
- Displays Merchant Invoice ID, Product, Denomination, Delivery Status, and Execution Status.
- **Masked PIN Reveal:** Claim codes are rendered as `••••••••••••`. Clicking the eye toggle securely reveals the unmasked redemption code for the owner.

### 7. Zcash Privacy Center (`SpendingRulesPanel.tsx?tab=zcash`)
- Live Zcash NU7 Testnet status badge and lightwalletd node endpoint (`zcash-testnet.lightwalletd.com:9067`).
- Form to verify transactions on-chain by entering a testnet `txid`.
- Table of recorded shielded transactions with block heights, confirmations, and direct links to `blockexplorer.one`.
- Interactive Vizor Wallet desktop integration guide detailing the 6-step manual / PCZT QR workflow.
- Complete 4-part Privacy & Trust assessment matrix.

### 8. Agent Activity & Audit Trail (`SpendingRulesPanel.tsx?tab=agents` & `tab=audit`)
- Activity stream showing natural language prompts processed by Maya Concierge and contributor bounties resolved by Bolt Bounty.
- Complete cryptographic audit log recording Gate decisions, SpendPass claims, Runner dispatches, and emergency pause toggles.

---

## 3. Backend API Routes Supporting the Dashboard

All dashboard panels are backed by live REST API endpoints mounted in `src/server/index.ts`:

| Endpoint | Method | Purpose |
| :--- | :--- | :--- |
| `/api/zbits/overview` | `GET` | Aggregated metrics, budgets, execution stats, network status |
| `/api/gate/constitution` | `GET` / `POST` | Retrieve or update owner spending constitution |
| `/api/gate/constitution/emergency-pause` | `POST` | Toggle owner emergency pause kill switch |
| `/api/gate/recipients` | `GET` / `POST` | List and register canonical recipients |
| `/api/gate/approvals` | `GET` / `POST` | List pending approvals and resolve (APPROVE/REJECT) |
| `/api/gate/ledger` | `GET` | Query live budget reservations and settlements |
| `/api/gate/audit-logs` | `GET` | Retrieve cryptographic security audit trail |
| `/api/runner/executions` | `GET` | Query Bitrefill purchase history |
| `/api/zcash/status` | `GET` | Query Zcash NU7 testnet and Vizor compatibility status |
| `/api/zcash/transactions` | `GET` | List recorded shielded testnet transactions |
| `/api/zcash/transaction/verify` | `POST` | Verify a testnet txid on-chain and update record |
| `/api/zcash/transaction/prepare` | `POST` | Format shielded payment payload with opaque memo |
| `/api/zcash/privacy-evidence` | `GET` | Retrieve verified testnet evidence and explorer links |

