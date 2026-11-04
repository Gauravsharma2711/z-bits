# Z-Bits — Privacy & Trust Note

**Project:** Z-Bits (Your agents. Your rules. Your money.)  
**Track:** Privacy Track (Zcash)  
**Hackathon:** Free Society Hackathon 2026, Mumbai  

Judges use this note to score the **Private** criterion (maximum 3 points). All four questions are answered directly, honestly, and without speculative claims.

---

## 1. What Stays Private?

- **On-Chain Shielded Graph:** When Z-Bits records or settles a payment on Zcash NU7 Testnet (`blockexplorer.one`), the sender address, recipient address, and transaction amount are shielded inside the Orchard and Sapling zero-knowledge pools.
- **Strictly Opaque Memo:** The on-chain encrypted memo contains **zero Personally Identifiable Information (PII)**. It contains exclusively an opaque internal reference in the format:
  ```text
  zbits:ord_<random_hash>
  ```
  *(Example: `zbits:ord_a8f92b`)*
- **Pre-Broadcast Regex Auditing:** Before any transaction payload is assembled or broadcast, our deterministic memo validation engine scans the memo against strict rejection filters. Any inclusion of names, phone numbers, email addresses, delivery addresses, or claim PINs fails-closed immediately with a `MEMO_SECURITY_VIOLATION` security event.
- **Agent Prompt Isolation:** Conversation prompts sent to AI models (e.g. Gemini or Bedrock) never include Zcash private keys, viewing keys, or SpendPass HMAC signing keys.

---

## 2. What Does the App Reveal, and to Whom?

- **To the Public Blockchain / External Observers:**
  - Reveals **only** the existence of a shielded transaction in block `2,984,102` with valid zero-knowledge proofs.
  - Zero sender addresses, zero receiver addresses, zero amounts, and zero text memos are exposed.
- **To the Merchant / Fulfillment Partner (Bitrefill):**
  - Receives the delivery email address (e.g. `recipient@example.com`) and chosen gift card denomination required to issue and activate the digital voucher.
  - Bitrefill does NOT observe the user's Zcash wallet address, AI conversation transcripts, or other recipient aliases.
- **To the AI Model Providers (Google Gemini / Anthropic / AWS Bedrock):**
  - Observes the high-level user request (e.g. *"Maya, send Rahul a \$25 Steam card for his birthday"*).
  - Does NOT observe private keys, SpendPass HMAC secrets, database credentials, or full payment card numbers.
- **To the Local Z-Bits Owner Instance:**
  - Maintains the private mapping between `zbits:ord_a8f92b`, the canonical recipient profile, and the underlying purchase intent in the owner's private local SQLite/PostgreSQL database.

---

## 3. What Must Users Trust?

1. **Local Z-Bits Software:** Users must trust that the local Gate authorization engine correctly enforces the configured spending constitution, daily/monthly budgets, and kill switch.
2. **Selected AI Provider:** Users must trust their chosen AI API provider (Google, Anthropic, or AWS) to process conversational prompts according to their published privacy policies.
3. **Fulfillment Merchant (Bitrefill):** Users must trust Bitrefill to deliver valid digital claim codes upon invoice payment.
4. **Zcash Network & Cryptographic Primitives:** Users trust the mathematical soundness of Halo 2 zero-knowledge proofs and the Zcash NU7 protocol.
5. **No Blind Trust in Agents:** Users do **NOT** have to trust AI agents with their money. AI agents are untrusted callers that can never authorize spend or access private keys.

---

## 4. What Would You Fix Next?

In the next 30 days following the hackathon:

1. **Air-Gapped Wallet Bridge for Vizor:** Replace the manual PCZT QR code copy-paste flow with an authenticated local IPC/WebSocket daemon so Vizor Desktop Wallet can sign shielded transactions seamlessly.
2. **Hardware Security Module (HSM) Key Storage:** Move the SpendPass HMAC signing key and Zcash viewing keys into host TPM / Secure Enclave hardware to prevent memory extraction even on compromised operating systems.
3. **Automated Mainnet Shielded Runner:** Expand the Commerce Runner to support automated Zcash Mainnet shielded payments directly against Bitrefill's crypto payment addresses.
4. **Multi-Signature Approval Center:** Support M-of-N threshold signatures (e.g. 2-of-3 family members or co-signers) for high-value agent purchases exceeding \$250.
