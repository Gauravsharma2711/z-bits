# Z-Bits — Developer Experience & Ecosystem Feedback

**Project:** Z-Bits (Your agents. Your rules. Your money.)  
**Hackathon:** Free Society Hackathon 2026  
**Tracks:** Agentic Commerce (Bitrefill) & Privacy (Zcash)  

This document provides honest, constructive developer experience (DevEx) feedback based on our end-to-end implementation of the Bitrefill API and Zcash NU7 shielded testnet integration.

---

## 1. Bitrefill Developer Experience Feedback

### What Worked Well:
1. **Catalog Search & Product Diversity:** The catalog endpoints (`/v2/products`, `/v2/inventory/countries`) provide rich metadata including denomination types (`fixed` vs `range`), currency codes, and delivery types.
2. **Deterministic Invoice Lifecycle:** The invoice states (`created` → `paid` → `delivered`) provide clear boundaries for state-machine transitions in asynchronous runner execution.
3. **Mock Mode for Development:** Having predictable response structures made it straightforward to build reliable sandbox fallback mocks for automated continuous integration.

### Pain Points & Areas for Improvement:
1. **Missing Native Typescript / Node SDK:**
   - *Observation:* Integrating required writing a custom REST client with manual HMAC/API key header management.
   - *Recommendation:* An official, typed TypeScript SDK (`@bitrefill/node` or `@bitrefill/sdk`) with built-in retry policies, webhook signature verification, and automated response typing would reduce onboarding time from hours to minutes.
2. **Webhook & Delivery Webhook Documentation:**
   - *Observation:* Clarifying the exact delivery webhook schema versus polling endpoints required trial and error. The distinction between `paid` (funds received) and `delivered` (gift card PIN issued) is critical for agents. Agents executing purchases must not release budget until terminal `delivered` state is reached.
   - *Recommendation:* Provide interactive webhook event simulators and clear documentation emphasizing the `paid` vs `delivered` distinction.
3. **Agent-Centric Auth & Scoped Keys:**
   - *Observation:* Bitrefill API keys have full administrative access. In autonomous agent architectures, having scoped, disposable sub-keys (e.g. capped at \$50 per key or restricted to specific product categories) directly within the merchant platform would complement Z-Bits' SpendPass layer.

---

## 2. Zcash Developer Experience Feedback

### What Worked Well:
1. **Unified Addresses (ZIP 316):**
   - *Observation:* Unified addresses (`utest1...`) streamline receiving addresses across Orchard, Sapling, and Transparent pools, eliminating the cognitive burden of choosing between z-addrs and t-addrs.
2. **Fast Block Times & Lightwalletd Protocol:**
   - *Observation:* Lightwalletd endpoints and block explorers (`blockexplorer.one`, `testnet.zcashblockexplorer.com`) reliably indexed testnet blocks with minimal latency.
3. **Encrypted Memos (ZIP 302):**
   - *Observation:* The 512-byte encrypted memo field is a standout superpower. It enabled Z-Bits to embed cryptographic references (`zbits:ord_<id>`) that are completely invisible on public ledgers and readable only by the intended recipient.

### Pain Points & Areas for Improvement:
1. **Local RPC Server vs Desktop Wallet Integration:**
   - *Observation:* There is a gap between running a heavy full node (`zcashd` / `zebra` + `lightwalletd`) locally and integrating with lightweight user wallets like **Vizor** or **Zashi**. Vizor does not currently expose a localhost RPC or IPC daemon that local web applications can query directly.
   - *Recommendation:* Provide an IPC bridge or standardized Web-Wallet standard (similar to EIP-1193 in Ethereum) allowing local AI agents or web applications to request transaction signing without manual QR code / PCZT copy-pasting.
2. **Testnet Faucets & Reliability:**
   - *Observation:* NU7 testnet faucets frequently exhaust their balances or throttle requests during hackathon surges. Developers spend valuable hours tracking down functional faucets.
   - *Recommendation:* A hosted, rate-limited testnet faucet API with automated programmatic dispensing for verified hackathon participants would drastically accelerate onboarding.
3. **TypeScript / JavaScript Shielded Transaction Libraries:**
   - *Observation:* Generating shielded proofs (Orchard / Halo 2) in pure JavaScript or browser environments remains complex. Most mature tooling is in Rust (`librustzcash`).
   - *Recommendation:* Publish an official Wasm-bundled npm package (`@zcash/wasm-sdk`) that handles address generation, memo parsing, and transaction building out of the box in modern Node.js and browser runtimes.

---

## 3. Summary of Built vs. Reused Components

| Component | Upstream / Reused | Z-Bits Novel Implementation |
|---|---|---|
| **Agent Foundation** | Fork of Sidemates / OpenBot (conversational UI, SQLite workspace, tool registry) | Preserved 100% of runtime; fixed Windows process spawning and path quoting bugs. |
| **Financial Authorization** | None (new subsystem) | **Gate Engine**: 100% deterministic spending constitution, fail-closed canonical recipient registry, shared cross-agent ledger. |
| **Cryptographic Tokens** | None (new subsystem) | **SpendPass**: HMAC-SHA256 compact JWTs with scope binding, single-use atomic claims, and replay protection. |
| **Fulfillment Execution** | None (new subsystem) | **Commerce Runner**: Server-isolated Bitrefill client, bounded delivery polling, uncertain-outcome handling, masked code storage. |
| **Agent Personas** | Generic chat personas | **Maya Concierge** & **Bolt Bounty**: Full commerce integration submitting to shared Gate budget. |
| **Privacy & Shielded Tx** | None (new subsystem) | **Zcash Privacy Center**: NU7 testnet explorer verification, zero-PII memo enforcement, Vizor QR code bridge. |
| **Cloud Persistence** | Local SQLite only | **Render Managed PostgreSQL 16**: Dual-engine architecture, 14 tables, row-level pessimistic locking (`SELECT ... FOR UPDATE`), automated migrations. |
