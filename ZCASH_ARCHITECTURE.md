# Z-Bits Zcash Architecture & Shielded Integration Reference

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Phase 07–08 — Privacy Integration & Dashboard  
**Status:** IMPLEMENTED & VERIFIED  
**Network:** Zcash NU7 Testnet (`testnet`)

---

## 1. Architectural Overview & Design Philosophy

Z-Bits integrates Zcash as its core privacy-preserving settlement and verification rail. While autonomous AI agents (such as Maya Concierge and Bolt Bounty) initiate purchase and reward requests, and Gate deterministically authorizes spending under owner-defined constitutions, financial actions can be privacy-anchored using zero-knowledge shielded transactions on Zcash.

```
+-----------------------------------------------------------------------------------+
|                                  Z-BITS PLATFORM                                  |
|                                                                                   |
|   +-----------------------+              +------------------------------------+   |
|   |   Agent Layer         |              |        Owner Dashboard             |   |
|   |  - Maya (Concierge)   |              |  - Constitution & Recipient Ledger |   |
|   |  - Bolt (Bounty)      |              |  - Zcash Privacy Center            |   |
|   +-----------+-----------+              +-----------------+------------------+   |
|               |                                            |                      |
|               v                                            v                      |
|   +---------------------------------------------------------------------------+   |
|   |               Gate Engine (Deterministic Authorization)                   |   |
|   |       - Per-tx / Daily / Monthly limits & Recipient Capping               |   |
|   |       - Cryptographic Token Issuer (SpendPass JWT HMAC-SHA256)            |   |
|   +------------------------------------+--------------------------------------+   |
|                                        |                                          |
|                                        v                                          |
|   +---------------------------------------------------------------------------+   |
|   |            Runner (Purchase Execution) & Zcash Service Module             |   |
|   |       - Bitrefill merchant execution (Masked PIN delivery)                |   |
|   |       - Shielded transaction preparation & address validation             |   |
|   |       - Zero-PII memo formatting (`zbits:ord_<hex>`)                      |   |
|   |       - On-chain testnet verification via Block Explorer & lightwalletd   |   |
|   +------------------------------------+--------------------------------------+   |
+----------------------------------------|------------------------------------------+
                                         |
                                         v
                         +-------------------------------+
                         |     Zcash NU7 Testnet         |
                         |  - Unified Addresses (utest1) |
                         |  - Orchard / Sapling Pools    |
                         |  - Shielded Encrypted Memos   |
                         +-------------------------------+
```

### Core Invariants

1. **Decoupled Settlement:** Testnet TAZ has zero monetary value and is not falsely represented as settling fiat-denominated merchant invoices. Testnet transactions serve as genuine zero-knowledge cryptographic commitments, settlement references, and audit proofs.
2. **Strict Zero-PII Memos:** The 512-byte encrypted shielded memo field must NEVER contain raw recipient names, emails, addresses, gift card numbers, or PINs. Only opaque internal references (`zbits:ord_<id>`) are permitted.
3. **Fail-Closed Privacy:** If a memo payload fails regex auditing or contains detected PII, transaction preparation fails immediately with security alerts.
4. **Air-Gapped Key Isolation:** The Z-Bits server never holds or stores master private spend keys or mnemonic seed phrases.

---

## 2. Address Handling & Validation

Z-Bits supports the modern Zcash Unified Address (ZIP 316) format along with legacy testnet address representations:

| Address Format | Prefix | Receiver Pools | Description |
| :--- | :--- | :--- | :--- |
| **Unified Address (UA)** | `utest1...` | Orchard + Sapling (+ Transparent) | Recommended primary format for NU7 testnet; provides automatic receiver selection and forward compatibility. |
| **Sapling Shielded** | `ztestsapling1...` | Sapling | Legacy shielded format for testnet Sapling pool interactions. |
| **Transparent Testnet** | `tm...` / `t2...` | Transparent (P2PKH / P2SH) | Legacy transparent testnet addresses; shielded pool transactions are prioritized for privacy. |

### Validation Implementation (`src/server/zcash/zcash-service.ts`)

```typescript
export function isValidZcashAddress(address: string, network: ZcashNetwork = "testnet"): boolean {
  if (!address || typeof address !== "string") return false;
  const clean = address.trim();

  if (network === "testnet") {
    // Unified testnet address (ZIP 316)
    if (/^utest1[a-z0-9]{60,}$/i.test(clean)) return true;
    // Sapling testnet address
    if (/^ztestsapling1[a-z0-9]{70,}$/i.test(clean)) return true;
    // Transparent testnet address
    if (/^(tm|t2)[a-z0-9]{33,34}$/i.test(clean)) return true;
    return false;
  }
  // Mainnet regex validation
  return false;
}
```

---

## 3. Opaque Memo Encoding Scheme

Zcash shielded transactions (Sapling and Orchard) support a 512-byte encrypted memo field. In Z-Bits, this memo is leveraged to tie on-chain shielded proofs to internal platform actions without compromising user identity or purchase privacy.

### Scheme Specification

- **Prefix:** `zbits:ord_`
- **Identifier:** Cryptographically random 16-to-32 character hex string or hashed purchase intent digest.
- **Maximum Length:** Strict ceiling at 64 characters (well within the 512-byte limit).
- **Format:** `zbits:ord_<hex>` (e.g. `zbits:ord_a8f92b0c3d4e1f2a`)

### PII Prevention & Regex Audit

Before any memo is formatted or broadcast, the `auditMemoSecurity` engine validates the string against blacklisted patterns:

```typescript
public auditMemoSecurity(memo: string): { safe: boolean; violations: string[] } {
  const violations: string[] = [];
  const lower = memo.toLowerCase();

  // Pattern 1: Must conform to opaque order prefix
  if (!/^zbits:ord_[a-f0-9_\-]+$/i.test(memo)) {
    violations.push("Memo does not conform to opaque pattern 'zbits:ord_<id>'");
  }

  // Pattern 2: No email addresses
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(memo)) {
    violations.push("Potential email address detected in memo");
  }

  // Pattern 3: No gift card PINs or claim codes
  if (/\b(?:pin|code|claim|card)[:=\s]+[a-z0-9]+/i.test(memo)) {
    violations.push("Sensitive claim code or voucher token detected in memo");
  }

  // Pattern 4: No human names or conversational PII
  const suspiciousKeywords = ["rahul", "alex", "alice", "bob", "steam", "amazon", "dollar", "usd"];
  for (const kw of suspiciousKeywords) {
    if (lower.includes(kw)) {
      violations.push(`Forbidden PII/merchant keyword detected: "${kw}"`);
    }
  }

  return { safe: violations.length === 0, violations };
}
```

---

## 4. Lightwalletd & Block Explorer Verification

Z-Bits connects to the public Zcash NU7 Testnet infrastructure:

- **Lightwalletd Server:** `https://zcash-testnet.lightwalletd.com:9067`
- **Block Explorer:** `https://blockexplorer.one/zcash/testnet/tx/{txid}`
- **Fallback Explorer:** `https://testnet.zcashexplorer.app/tx/{txid}`
- **Target Activation Height:** NU7 Testnet Activation at block `2,975,000`

Transactions recorded by the owner or executed via testnet runners are verified against on-chain block explorer APIs. The system captures:
- Transaction ID (`txid`)
- Confirmed Block Height
- Confirmation Count
- Shielded Output Pool Verification
- Timestamp & Verification Audit Record

---

## 5. Vizor Wallet Architectural Assessment

### Investigation Summary (`chainapsis/vizor-wallet`)

We conducted an architectural inspection of the official Vizor wallet repository (`https://github.com/chainapsis/vizor-wallet`) and web application (`https://vizor.cash/`).

**Findings:**
1. **Application Type:** Desktop client built with Flutter UI and a native Rust core (`librustzcash`) via Flutter Rust Bridge (FRB).
2. **Network Capabilities:** Native support for both Zcash Mainnet and Testnet. Compiles to testnet with `--dart-define=ZCASH_DEFAULT_NETWORK=test` and ships testnet release binaries (e.g. `win-arm64-testnet`).
3. **Integration Interfaces:** **Vizor exposes NO external HTTP REST API, JSON-RPC daemon, or CLI bridge.** It is strictly a standalone user-operated desktop GUI application.
4. **Hardware Signing:** Vizor supports air-gapped signing via Keystone hardware wallet using animated PCZT (Partially Created Zcash Transaction) QR codes (ZIP 370).

### Truthful Integration Strategy

Z-Bits **does not fabricate** a fictitious local RPC server for Vizor. Instead, Z-Bits implements an end-to-end, human-in-the-loop desktop wallet workflow:
1. Z-Bits generates the shielded transaction payload with the compliant `zbits:ord_<id>` memo.
2. The user copies the transaction parameters or scans the PCZT QR code directly into Vizor Wallet running on Testnet.
3. The user signs and broadcasts via Vizor's native lightwalletd connection.
4. The user pastes the resulting `txid` into Z-Bits Privacy Center to achieve instant cryptographic verification and ledger linking.
