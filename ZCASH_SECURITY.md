# Z-Bits Zcash Security & Privacy Specification

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Phase 07–08 — Privacy Integration & Dashboard  
**Security Level:** CRITICAL (Air-Gapped, Non-Custodial, Fail-Closed)

---

## 1. Threat Model & Security Invariants

In an autonomous AI agent environment, traditional assumptions about user presence and transaction inspection break down. Z-Bits is designed around the principle of **hostile or compromised agents** acting under strict deterministic boundaries.

| Threat Scenario | Vector | Z-Bits Mitigation |
| :--- | :--- | :--- |
| **Agent Leaking PII to Blockchain** | Compromised LLM puts recipient email or gift card PIN in shielded memo | Fail-closed `auditMemoSecurity` regex inspection blocks broadcast immediately. |
| **Private Key Exfiltration** | Web application or API compromises server memory or filesystem | Zero private keys stored on server; all signing is client-side or manual via Vizor/Keystone. |
| **Unshielded / Transparent Exposure** | Agent requests payout to transparent `t-address`, exposing graph | Address format enforcement prioritizes shielded Unified Addresses (`utest1...`); transparent fallback requires explicit confirmation. |
| **Replay or Tampered Txid** | Reusing old testnet `txid` to claim unearned bounties | Unique database constraints (`UNIQUE(txid)`) and on-chain block height verification. |
| **Simulated vs. Real Confusion** | User believes testnet TAZ bought real goods | Clear UI disclaimers and decoupling of fiat gift card settlement from testnet proofs. |

---

## 2. Key Management & Air-Gapped Non-Custodial Boundaries

### Zero Private Keys Principle

Z-Bits adheres to an absolute non-custodial model:
1. **No Seed Phrases:** The platform never accepts, requests, stores, or logs 12- or 24-word recovery seeds.
2. **No Spending Keys:** The Z-Bits backend contains zero logic or storage for Zcash Spending Keys (`ask`, `nsk`, `ovk`).
3. **No Key Derivation in LLM Context:** Agents are strictly isolated from any cryptographic key material.

### Signing Flow

```
[Agent Request] -> [Gate Authorizes] -> [Zcash Service Formats Intent]
                                                   |
                                                   v
                         [Opaque Payload Prepared: {to, amount, memo}]
                                                   |
                                                   v
                         [Owner Opens Vizor Wallet / Hardware Signer]
                                                   |
                         [Sign & Broadcast over Testnet P2P / Lightwalletd]
                                                   |
                                                   v
                        [Owner Submits TXID to Z-Bits Dashboard]
                                                   |
                                                   v
                        [On-Chain Block Verification via Explorer]
```

---

## 3. Strict Memo Privacy & Zero-PII Policy

Zcash encrypted memos provide 512 bytes of confidentiality against outside network observers. However, information placed inside the memo is permanently decryptable by anyone holding the Incoming Viewing Key (IVK) or Full Viewing Key (FVK) of the recipient address.

### Mandatory Rules

1. **Rule 1 (Opaque Only):** Memos MUST follow the structure `zbits:ord_<hex>`.
2. **Rule 2 (No Plaintext Metadata):** No merchant names (`"Steam"`, `"Amazon"`), no item types (`"USD 10"`), and no human names (`"Rahul"`).
3. **Rule 3 (No Secret Claim Codes):** Delivery PINs, redemption links, and claim codes are stored exclusively in the encrypted SQLite database on the owner's machine and are masked in the UI. They are NEVER injected into on-chain memos.

### Security Audit Implementation

Every transaction preparation call passes through `auditMemoSecurity(memo)` in `src/server/zcash/zcash-service.ts`. If any violation is detected:
- The transaction preparation aborts.
- An audit event of category `security_alert` is written to `audit_logs` table.
- A descriptive error is returned, stopping downstream processing.

---

## 4. Replay Protection & Database Schema

The SQLite schema for Zcash transactions enforces cryptographic uniqueness:

```sql
CREATE TABLE IF NOT EXISTS zcash_transactions (
    id TEXT PRIMARY KEY,
    txid TEXT UNIQUE NOT NULL,
    owner_id TEXT NOT NULL,
    to_address TEXT NOT NULL,
    amount_zat INTEGER NOT NULL,
    amount_zec REAL NOT NULL,
    memo_ref TEXT NOT NULL,
    status TEXT NOT NULL,
    block_height INTEGER,
    confirmations INTEGER DEFAULT 0,
    explorer_url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    verified_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_zcash_tx_owner ON zcash_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_zcash_tx_txid ON zcash_transactions(txid);
```

### Idempotency & Replay Defense

- `txid` is unique across the entire database. Re-submitting an existing `txid` returns the existing verified record without re-crediting or re-running actions.
- Each memo reference incorporates a unique order reference (`zbits:ord_<random16>`), preventing cross-order reference collisions.

---

## 5. Security Audit Logging

All Zcash-related actions generate structured, immutable security audit logs:

- `zcash_transaction_prepared`: Logged when an address and opaque memo are assembled.
- `zcash_transaction_recorded`: Logged when a transaction ID is submitted for tracking.
- `zcash_transaction_verified`: Logged when on-chain explorer or lightwalletd confirms block inclusion.
- `zcash_memo_security_violation`: Logged when an invalid or PII-laden memo is blocked.

