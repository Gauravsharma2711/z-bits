# Z-Bits Privacy & Trust Specification

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Phase 07–08 — Privacy Integration & Dashboard  
**Status:** COMPLETE & AUTHORITATIVE

---

## The Four Core Hackathon Questions

---

### 1. What Stays Private?

Z-Bits enforces privacy at four distinct architectural layers:

#### A. Autonomous Agent Layer (LLM Isolation)
- **Zero Raw Financial Secrets:** LLM agents (Maya, Bolt, Nova, Pixel) NEVER receive owner private keys, credit card numbers, Bitrefill API secrets, or master signing HMAC keys in their system prompts, conversational contexts, or function calling tools.
- **Masked Claim Codes:** Gift card claim codes and redemption PINs returned by merchants are masked (`••••-••••-••••`) in agent responses, public APIs, and database audit tables. PINs are unmasked only on-demand by the authenticated human owner in the local dashboard.
- **Scoped Identity:** Agents know only recipient aliases (`"rahul"`, `"self"`). The underlying canonical identity (full name, email, delivery coordinates) is resolved deterministically by Gate and never echoed back to LLM context windows.

#### B. Blockchain Settlement Layer (Zcash Shielded Pool)
- **Sender & Receiver Addresses:** When transacting via Zcash Unified Addresses (`utest1...`) and Sapling/Orchard shielded pools, sender and receiver addresses remain completely hidden from the public blockchain ledger.
- **Transacted Value:** Output amounts are encrypted inside zero-knowledge commitment notes. Public block explorers cannot determine how much TAZ was transferred.
- **Memo Confidentiality:** The 512-byte transaction memo is encrypted on-chain. Only the recipient holding the appropriate viewing key can decrypt the memo ciphertext.

#### C. Metadata & Memo Sanitization Layer
- **Zero-PII Memos:** Memos on-chain strictly contain opaque identifiers (`zbits:ord_<hex>`). No recipient names, emails, addresses, merchant names, or order items are ever placed on the blockchain.
- **Deterministic Pre-Broadcast Filter:** Memos are checked against strict regex denylists before broadcast; any attempt to inject PII or secret PINs is rejected fail-closed.

#### D. Local Infrastructure Layer
- **Air-Gapped Keys:** The Z-Bits backend server never stores or manages Zcash private spending keys or seed phrases. Signing occurs in the user's desktop wallet (e.g. Vizor) or hardware wallet.
- **Local-First SQLite Database:** All spending history, alias registries, and audit logs remain stored locally in the owner's SQLite database (`zbits.db`), completely shielded from cloud telemetry.

---

### 2. What Is Revealed?

Full transparency regarding necessary data disclosures is critical to trust. The following information is intentionally or unavoidably revealed to specific parties:

| Recipient / Observer | What Is Revealed | Why It Is Revealed |
| :--- | :--- | :--- |
| **Merchant (Bitrefill)** | Product ID, Denomination, Delivery Email, IP Address | Required to issue and fulfill the digital gift card or mobile top-up. (Can be mitigated with disposable alias emails). |
| **Zcash Blockchain Observers** | Transaction timestamp, block height, transaction fee (0.0001 TAZ), number of shielded inputs/outputs | Unavoidable consensus metadata inherent to the Zcash network protocol. |
| **Recipient (with Viewing Key)** | Opaque memo (`zbits:ord_<hex>`), exact received amount | Required for the recipient to attribute incoming funds to an order. |
| **Local Owner (Dashboard)** | Complete transaction ledger, unmasked claim PINs (upon clicking reveal), agent request logs, Gate authorization decisions | The owner is the sovereign controller of the platform and must maintain complete visibility. |
| **Gate Authorization Engine** | Purchase intent, requested amount, canonical recipient ID | Required to deterministically enforce daily/monthly budgets and constitution policies. |

---

### 3. What Is Trusted?

Z-Bits establishes trust boundaries through deterministic software and cryptographic proofs rather than subjective trust:

1. **Gate Authorization Engine (Trusted Local Software):** Gate is trusted to evaluate spending limits, verify aliases, issue HMAC-signed SpendPass tokens, and enforce emergency pauses. This trust is anchored in deterministic TypeScript code and persisted SQLite state, not LLM reasoning.
2. **SpendPass HMAC Key (Trusted Secret):** The local symmetric secret (`SPENDPASS_SECRET_KEY`) is trusted to authenticate tokens between Gate and Runner. It is stored locally in `.env` and never exposed outside backend memory.
3. **Bitrefill API & Merchant Infrastructure (External Trusted Counterparty):** Trusted to fulfill paid gift card orders, provide accurate catalog pricing, and maintain voucher validity.
4. **Zcash Cryptographic Parameters (Zcash NU7 Network):** We trust the Halo 2 zero-knowledge proving system without trusted setup (Orchard pool) and the Sapling cryptographic primitives maintained by the Electric Coin Company and Zcash Community.
5. **Human Owner Sovereign Override:** The human owner is the root of trust. Any transaction exceeding the approval threshold requires explicit owner approval. The owner possesses a physical Emergency Pause kill-switch.

---

### 4. What to Fix Next (Production Roadmap)?

While the Z-Bits hackathon prototype delivers a complete, secure, and verifiable architecture, the following enhancements are prioritized for production deployment:

1. **Native PCZT Generation in Server (ZIP 370):** Implement a native Rust FFI or WebAssembly module to generate Partially Created Zcash Transactions (PCZT) directly, displaying animated QR codes for seamless Keystone and Vizor air-gapped signing.
2. **Ephemeral Disposable Delivery Relays:** Integrate anonymous email relays (e.g., SimpleLogin or Masked Email APIs) into Runner so that even the merchant (Bitrefill) never learns the owner's or recipient's real email address.
3. **Mainnet Shielded Automated Runner:** Once Vizor or Zashi exposes a secure local IPC daemon or when running a local `zcashd` / `zebra` node, provide automated shielded payment execution on Zcash Mainnet alongside Bitrefill crypto payment invoices.
4. **Hardware Security Module (HSM) / Secure Enclave for Gate:** Store the SpendPass HMAC signing key inside a TPM (Trusted Platform Module), Apple Secure Enclave, or YubiKey to prevent key extraction even if the host OS is compromised.
5. **Multi-Signature Approval Center:** Upgrade the Owner Approval Center to support M-of-N threshold signatures (e.g. 2-of-3 family members or co-signers) for high-value agent purchases.
