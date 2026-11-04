# Z-Bits — Second-by-Second 3-Minute Demo Video Script

**Target Duration:** Exactly 2 minutes, 45 seconds (Under 3:00 hard ceiling)  
**Resolution:** 1080p (1920x1080) at 60fps  
**Presenter:** Project Point Person  

---

### Timeline Overview

```text
[0:00 - 0:25] Hook & The Core Problem (LLMs hallucinate; AI agents cannot be trusted with funds)
[0:25 - 0:55] Maya Concierge: Requesting a gift card purchase for "Rahul"
[0:55 - 1:25] The Gate Engine & SpendPass: Deterministic math, policy check, and signed token issuance
[1:25 - 1:55] Bolt Bounty Defense: Second agent tries to exceed Rahul's $500 shared limit -> Deterministically blocked!
[1:55 - 2:25] Zcash NU7 Privacy & Vizor Wallet: Shielded transaction with opaque memo (zbits:ord_...) verified on explorer
[2:25 - 2:45] Conclusion & Call to Action: "Your agents. Your rules. Your money."
```

---

### Segment 1: Hook & Core Problem (0:00 – 0:25)
- **Visual:** Screen shares Z-Bits Studio dashboard (`http://localhost:5173/`).
- **Narration:**
  > *"Every AI agent company promises autonomous commerce. But here's the dirty secret: language models hallucinate. Giving an LLM direct access to your credit card or crypto wallet is financial suicide.  
  > Welcome to Z-Bits. Our tagline: Your agents. Your rules. Your money.  
  > Z-Bits is an open-source personal AI agent platform where agents propose, but a deterministic mathematical Gate decides."*

---

### Segment 2: Maya Concierge in Action (0:25 – 0:55)
- **Visual:** Open chat tab with **Maya (Concierge Bit)**. Type:  
  `"Maya, buy a $25 Steam digital gift card for my bestie Rahul."`
- **Narration:**
  > *"Meet Maya, our Concierge Bit. We ask her to buy a gift card for 'bestie Rahul'. Notice that Maya doesn't execute the purchase herself. She resolves the nickname 'bestie' to canonical recipient 'Rahul Sharma' and formats a Purchase Intent with an idempotency key."*

---

### Segment 3: Gate & SpendPass Token (0:55 – 1:25)
- **Visual:** Click over to **Spending Rules & Gate Panel**. Show the approved intent.
- **Narration:**
  > *"Here is the Gate Engine. Zero LLM reasoning. Written in pure TypeScript with ACID transactions in PostgreSQL.  
  > Gate verifies Rahul's limit, checks our daily budget, and atomically issues a SpendPass: a single-use, HMAC-SHA256 signed JWT token valid for 15 minutes.  
  > The server-side Commerce Runner verifies the SpendPass and places the order via Bitrefill's API, securely delivering the card while masking sensitive claim PINs."*

---

### Segment 4: The Core USP — Maya & Bolt Defense (1:25 – 1:55)
- **Visual:** Switch to **Bolt (Bounty Bit)**. Type:  
  `"Bolt, award contributor Rahul a $250 bug bounty."`  
  Show the instant rejection dialog with error badge `RECIPIENT_LIMIT_EXCEEDED`.
- **Narration:**
  > *"Now here is the core breakthrough: multi-agent collusive defense.  
  > Our second agent, Bolt, attempts to award Rahul a $250 bounty. Rahul has a $500 cap, and Maya already spent $300.  
  > Bolt doesn't have an isolated budget. Maya and Bolt share the exact same financial constitution. Gate immediately blocks Bolt with RECIPIENT_LIMIT_EXCEEDED! No agent can collude or drain your wallet."*

---

### Segment 5: Zcash Shielded Privacy & Vizor Wallet (1:55 – 2:25)
- **Visual:** Click on the **Privacy Center** tab. Show the verified testnet transaction card and click through to `blockexplorer.one`.
- **Narration:**
  > *"Finally, privacy. When settlements occur, Z-Bits anchors to the Zcash NU7 Testnet using Unified Addresses.  
  > Look at block 2,984,102 on the explorer. External observers see zero sender, zero receiver, and zero amount.  
  > The memo field contains strictly an opaque reference: `zbits:ord_a8f92b`. Zero names, zero emails, zero phone numbers. Full mathematical privacy on-chain, auditable only inside the owner's private database."*

---

### Segment 6: Wrap-up & Call to Action (2:25 – 2:45)
- **Visual:** Show the Emergency Kill Switch being toggled, followed by the GitHub repository and Render deployment status.
- **Narration:**
  > *"With one toggle, our Emergency Kill Switch can freeze all spending across every agent instantly.  
  > Z-Bits is production-ready, deploys to Render with PostgreSQL 16 in one click, and runs on your own hardware.  
  > Z-Bits: Your agents. Your rules. Your money. Thank you!"*
