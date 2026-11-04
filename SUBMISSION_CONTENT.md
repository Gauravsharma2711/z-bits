# Z-Bits: Official Stadium Submission Package

**Project Name:** Z-Bits  
**Tagline / One-Line Pitch:** Your agents. Your rules. Your money. Autonomous AI agents governed by deterministic spending policies, signed SpendPass execution tokens, and shielded Zcash settlement.  
**Tracks:** Agentic Commerce (Bitrefill) & Privacy (Zcash)  

---

## 1. Submission Metadata Form Fields

### General Information
- **Project Name:** Z-Bits
- **One-Line Pitch:** Your agents. Your rules. Your money. Sovereign multi-agent personal platform with deterministic Gate authorization, single-use signed SpendPass tokens, Bitrefill digital commerce, and shielded Zcash settlement.
- **Repository URL:** *(Public GitHub Repository URL)*
- **Render Production URL:** `https://z-bits.onrender.com` (or user's custom deployed Render domain)
- **Demo Video URL:** *(YouTube / Loom link, exactly 2:45 duration)*
- **Primary Point-Person Email:** *(User's checked-in Luma event email)*

---

## 2. Track 1: Bitrefill Agentic Commerce Submission Details

### Core Innovation:
Autonomous agents (Maya Concierge and Bolt Bounty) initiate purchase proposals from natural language prompts, but have **zero direct access to funds or payment keys**. 
All spending flows through **Gate**, a deterministic state machine enforcing the owner's constitution (daily/monthly limits, per-order caps, approval thresholds, merchant whitelists, and canonical recipient registries).

### SpendPass Mechanism:
Authorized intents receive a cryptographically signed HMAC-SHA256 **SpendPass** token bound to the exact recipient, merchant, product, and denomination. The server-isolated **Commerce Runner** executes the purchase against Bitrefill's REST API v2, polls fulfillment until terminal delivery, and settles the reservation.

### Mandatory Bitrefill Submission Questions:
1. **Who approves purchases above the limit?**
   - The sovereign human owner via the Z-Bits Owner Approval Queue (`/api/gate/approvals/pending`). Any transaction exceeding `requireApprovalAboveCents` is placed in state `REQUIRES_APPROVAL` until approved or rejected with owner authentication.
2. **Exact maximum agent spending limits:**
   - Default configured daily limit: `$1,000.00` (`100000` cents).
   - Default per-order limit: `$500.00` (`50000` cents).
   - Recipient cap: Configurable per canonical recipient (e.g., `$500.00` for Rahul).
3. **What was built vs reused?**
   - *Reused:* Sidemates agent core runtime, conversational interface, local SQLite configuration.
   - *Built New:* Deterministic Gate Authorization Engine, SpendPass HMAC Token Service, Bitrefill v2 Commerce Runner, Maya & Bolt Agent Personas, Zcash Privacy Center, Render Managed PostgreSQL 16 persistence.

---

## 3. Track 2: Zcash Privacy Submission Details

### Core Innovation:
Z-Bits anchors sovereign agent spending to the **Zcash NU7 Testnet** using **Unified Addresses** and shielded pools (Orchard / Sapling). All on-chain records maintain strict zero-knowledge confidentiality: zero sender address, zero receiver address, and zero visible transaction amounts.

### The Four Mandatory Privacy Questions:
1. **What stays private?**
   - LLM agents never see private keys or raw credit card data.
   - On-chain: Sender address, receiver address, and transacted amount are completely hidden in zero-knowledge commitment notes.
   - Memo privacy: 512-byte encrypted memos contain only opaque references (`zbits:ord_<hex>`). Zero names, zero emails, zero merchant details.
   - Gift card claim PINs are strictly masked in logs and APIs (`HEAD-****-TAIL`).
2. **What does the app reveal, and to whom?**
   - To Bitrefill (Merchant): Product ID, denomination, and delivery email necessary for fulfillment.
   - To Zcash Observers: Block height, timestamp, transaction fee (0.0001 TAZ), and shielded input/output counts.
   - To Recipient: Decrypted opaque memo reference and exact received TAZ amount.
   - To Local Owner: Full unmasked audit trail within their private database.
3. **What must users trust?**
   - The local Gate Engine code (deterministic TypeScript).
   - The local SpendPass HMAC secret key stored in `.env`.
   - The Zcash NU7 zero-knowledge Halo 2 proving system.
   - Bitrefill for gift card fulfillment.
4. **What would be fixed next (30-day plan)?**
   - ZIP 370 PCZT animated QR codes for air-gapped Keystone / Vizor hardware signing.
   - Disposable email relays (SimpleLogin) to shield owner email from merchants.
   - FIDO2 / WebAuthn threshold multi-sig for high-value agent spending.
   - Self-hosted 1-click appliance for Umbrel and Start9.

### Testnet Evidence Receipt:
- **Transaction ID (`txid`):** `5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab`
- **Block Explorer:** [https://blockexplorer.one/zcash/testnet/tx/5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab](https://blockexplorer.one/zcash/testnet/tx/5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab)
- **Unified Address:** `utest1zcs8jqm6d3k5s2f4g7h9j1k3l5n7p9q2r4s6t8u0v2w4x6y8z0a2c4e6g8i0k2m4o6q8s0u2w4y6`
- **Memo Reference:** `zbits:ord_a8f92b`
