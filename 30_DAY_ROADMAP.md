# Z-Bits 30-Day Engineering Roadmap

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Document Purpose:** Post-Hackathon 30-Day Production Readiness Plan  
**Date:** November 2026  

---

## 1. Overview & Vision

During the Free Society Hackathon, we proved that autonomous AI agents can initiate real-world commerce and contributor rewards while being strictly governed by a deterministic, non-negotiable financial Gate.

Over the next 30 days, we will transition Z-Bits from an event-validated prototype into a self-hosted, consumer-grade software platform for privacy-preserving, agentic financial delegation.

---

## 2. Weekly Sprint Plan

### Week 1 (Days 1–7): Non-Custodial Hardware Signing & PCZT (ZIP 370)
- **Objective:** Upgrade Zcash testnet integration into native Partially Created Zcash Transactions (PCZT).
- **Deliverables:**
  - Implement WebAssembly / Rust FFI wrapper for `zcash_client_backend` and ZIP 370.
  - Generate animated QR codes in the Z-Bits Owner Dashboard for air-gapped Keystone and Vizor hardware signing.
  - Enable direct shielded UTXO note selection without centralized RPC dependency.
  - Zero private keys in server memory, guaranteed by design.

### Week 2 (Days 8–14): Disposable Email Relays & Merchant Privacy
- **Objective:** Prevent merchants from learning the owner's or recipient's real email address.
- **Deliverables:**
  - Integrate disposable email relay providers (e.g., SimpleLogin / Masked Email APIs) into the Commerce Runner.
  - Automatically generate a single-use proxy email for each Bitrefill order (e.g., `ord_8k2n1@relay.z-bits.local`).
  - Runner polls and decrypts fulfillment gift-card codes from the ephemeral relay mailbox, stores them encrypted locally, and destroys the mailbox.

### Week 3 (Days 15–21): Multi-Signature Approval Center & Threshold Security
- **Objective:** Elevate large purchases from single-owner approval to cooperative multi-sig.
- **Deliverables:**
  - Expand `gate_approvals` table to support $M$-of-$N$ threshold signatures (e.g., 2-of-3 co-signers).
  - Push notifications via webhooks / encrypted Signal bot for pending approval requests exceeding `$1,000.00`.
  - Passkey / WebAuthn biometric approval in the browser for one-click hardware-bound authorization.
  - Automatic escalation triggers when purchase frequency spikes abnormal to typical patterns.

### Week 4 (Days 22–30): Self-Hosted 1-Click Appliance & Public Launch
- **Objective:** Enable anyone to run Z-Bits locally or on cloud VMs in under 5 minutes.
- **Deliverables:**
  - One-click Umbrel, Start9, and Docker Compose distribution package.
  - Automated database backup and restore script with client-side GPG encryption.
  - Public documentation site with interactive architecture explorer and developer SDK.
  - Open bug bounty program powered by Bolt (paying bounties directly in shielded Zcash).

---

## 3. Milestones & Success Metrics

| Milestone | Target Timeline | Success Metric |
| :--- | :--- | :--- |
| **ZIP 370 PCZT Signing** | Day 7 | 100% of Zcash transactions signed via air-gapped QR codes |
| **Merchant Identity Isolation** | Day 14 | Zero personal email addresses transmitted to Bitrefill |
| **WebAuthn Threshold Approvals** | Day 21 | FIDO2 hardware token signing for approval queue |
| **1-Click Self-Hosted Appliance** | Day 30 | Docker launch in under 3 minutes with zero cloud telemetry |
