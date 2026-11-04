# Z-Bits Hackathon 3-Minute Live Demo Runbook

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Format:** Live Demonstration (3 Minutes)  
**Audience:** Hackathon Judges & Evaluators

---

## Preparation Checklist (T-minus 2 Minutes)

1. Start Z-Bits Backend and Frontend:
   ```bash
   npm run dev
   ```
2. Open Browser at `http://localhost:5173/` or Studio view.
3. Ensure local testnet database is initialized (`zbits.db`).

---

## 3-Minute Live Demonstration Script

### Minute 0:00 – 0:45: The Problem & The Solution (Hook)
- **Speaker:** *"Autonomous AI agents can write code, book meetings, and plan trips. But the moment an agent touches money, today's world breaks: either you hand over a blank check credit card, or you have to manually approve every coffee.
Enter **Z-Bits**: 'Your agents. Your rules. Your money.'
Z-Bits introduces **Gate**, a deterministic financial constitution engine that puts human owners in complete control, and **Zcash Privacy**, ensuring on-chain settlement leaves zero identity trail."*
- **Action:** Show the **Z-Bits Platform Overview**:
  - Point to Daily Budget ($300.00), Monthly Budget ($1,000.00).
  - Point to the active Zcash NU7 Testnet status badge.

### Minute 0:45 – 1:30: Maya & Bolt Share One Constitution
- **Speaker:** *"Here we have two independent agents: Maya (personal concierge) and Bolt (developer bounty agent). Let's see them share a single financial constitution."*
- **Action 1 (Maya):**
  - Type prompt in Maya Concierge chat: *"Get a $50 Steam card for Rahul."*
  - Maya queries Gate: Gate checks constitution, finds Rahul's cap ($400), authorizes the purchase, and issues a cryptographic SpendPass.
  - Runner executes with Bitrefill. The voucher is delivered instantly! Show the masked claim PIN (`••••••••••••`) and click to reveal.
- **Action 2 (Bolt & Gate Blocking):**
  - Switch to Bolt Bounty agent: Submit a $400 contributor reward for Rahul.
  - Gate evaluates cumulative spend: $50 + $400 = $450 > $400 cap.
  - Gate deterministically **BLOCKS** Bolt! Show the error message: `RECIPIENT_LIMIT_EXCEEDED`.
  - Highlight: *"Neither agent can collude, lie, or bypass the owner's recipient cap."*

### Minute 1:30 – 2:15: Human Approval & Emergency Pause Kill Switch
- **Action 3 (Human in the Loop):**
  - Maya attempts a $100 purchase (above the $50 auto-approval threshold).
  - Gate returns `REQUIRE_APPROVAL`.
  - Navigate to the **Approval Center** in the dashboard.
  - Show the pending request. Click **Approve**.
  - Show the atomic execution completing immediately upon owner consent.
- **Action 4 (Emergency Kill Switch):**
  - Click the **Emergency Pause** toggle in the Spending Constitution tab.
  - Attempt any purchase: Instantly blocked with `EMERGENCY_PAUSE_ACTIVE`.
  - Toggle off: Normal operations resume.

### Minute 2:15 – 3:00: Zcash Shielded Settlement & Zero-PII Verification
- **Speaker:** *"Finally, how do we handle settlement and privacy? We anchor transactions to the Zcash NU7 Testnet."*
- **Action 5 (Privacy Center):**
  - Navigate to the **Zcash Privacy Center** tab.
  - Show the verified transaction:
    - `txid`: `5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab`
    - Address: Unified Address `utest1...`
    - Opaque Memo: `zbits:ord_a8f92b`
  - Click the link to open [blockexplorer.one](https://blockexplorer.one/zcash/testnet/tx/5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab).
  - Highlight:
    1. *Sender, receiver, and amount are completely shielded.*
    2. *The memo contains strictly zero PII (`zbits:ord_...`), audited by our regex engine before broadcast.*
    3. *Vizor Desktop Wallet workflow enables air-gapped signing via Keystone QR codes.*
- **Conclusion:** *"Z-Bits: Your agents. Your rules. Your money. Thank you!"*

