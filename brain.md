# Z-Bits — Project Brain

**Last updated:** 4 November 2026  
**Product status:** Hackathon MVP in progress  
**Base repository:** [PrisacariuRobert/sidemates](https://github.com/PrisacariuRobert/sidemates)  
**Product tagline:** Your agents. Your rules. Your money.

## 1. What Z-Bits is

Z-Bits is a free, open-source personal AI-agent platform. Users work with specialized agents called **Bits**. Each Bit can have a distinct role, instructions, provider/model configuration and access to approved capabilities.

Z-Bits' differentiator is **recipient-aware, cross-agent spending under one shared financial constitution**. All Bits share the owner's recipient identity map and spending ledger. A purchase by one Bit reduces the available allowance for that recipient across every other Bit. Aliases for the same person must resolve to one canonical recipient record.

Z-Bits is not merely a chatbot with a shopping tool, nor just a spending firewall. The product combines useful personal agents with a shared, deterministic financial authority.

## 2. Core product promise

> Multiple specialized agents can request useful purchases, but none can bypass the owner's shared rules, duplicate spending against the same recipient, or execute an altered authorization.

**Primary USP:** relationship-aware, cross-agent spending. The system evaluates *who receives value*, the shared amount already spent on that recipient, the purpose and the policy—not just whether an individual agent's single order is below a cap.

## 3. The Bits

| Bit | Role | Product status |
|---|---|---|
| **Maya** | Concierge: understands personal gift/recharge requests, resolves contacts, asks clarifying questions and tracks fulfillment. | MVP, primary agent |
| **Bolt** | Bounty: receives a contributor-reward event and submits a bounded reward request. | MVP-lite / second request source |
| **Sage** | Occasion: remembers birthdays and occasions and proposes gifts. | Post-hackathon / stretch |
| **Gate** | Deterministic authorization service. Enforces recipient trust, shared budgets, approvals, idempotency and signed SpendPass permissions. | Mandatory system service, not an LLM |
| **Runner** | Deterministic execution service. Verifies SpendPass, executes the exact authorized Bitrefill purchase and verifies fulfillment. | Mandatory system service, not an LLM |

Maya, Bolt and Sage are intelligent agent personas. Gate and Runner are security/execution services presented as system Bits. They must not depend on an LLM to make financial authorization decisions.

## 4. Shared Spending Constitution

The owner configures one policy set shared by all Bits:

- Per-order maximum.
- Daily and monthly owner-level limits.
- Per-recipient daily/monthly limits.
- Allowed merchants, brands, categories and denominations.
- Recipient trust status and aliases.
- Approval requirements, including first-time recipients.
- Campaign-specific limits for rewards.
- Expiry, duplicate prevention and emergency pause.

Recipient resolution must map different names, aliases and identifiers to a canonical recipient ID before budget evaluation. A budget reservation must be atomic so two simultaneous requests cannot spend the same remaining allowance.

## 5. Security model

1. AI Bits produce structured **purchase intents**, not payment instructions.
2. Bits never receive Zcash spending keys, Bitrefill credentials or Gate signing keys.
3. Gate validates the intent against the shared policy and spending ledger.
4. Gate returns `DENY`, `REQUIRE_APPROVAL` or `ALLOW`.
5. An allowed request receives a short-lived, signed, single-use **SpendPass** bound to the exact order, recipient, product, denomination, maximum price, policy version, expiry and nonce.
6. Runner independently verifies the signature, scope, expiry, revocation and nonce before execution.
7. Runner never changes the recipient, product or amount after authorization.
8. The result is recorded and the budget reservation is settled or safely released.
9. If Gate, the ledger or authorization verification is unavailable, purchases fail closed.

SpendPass must not be replayable. Use a cryptographically secure nonce, durable single-use state and idempotent order handling. Budget reservation and authorization creation must be atomic.

## 6. Privacy and payment boundaries

Zcash and Bitrefill are separate integrations in the hackathon MVP:

- Zcash NU7 public testnet demonstrates a genuine shielded transaction and transaction evidence.
- The testnet transaction may contain only an opaque order reference in its encrypted memo. Never place a phone number, contact name, relationship, product description or other PII in the memo.
- Testnet TAZ has no monetary value and does not fund a Bitrefill purchase.
- The real Bitrefill purchase is funded with event credits or another explicitly configured supported method.
- Never claim that a Zcash testnet transaction settled the Bitrefill invoice.
- The privacy note must identify what the public chain, Z-Bits backend, AI provider and Bitrefill can see and what each party must be trusted with.

Viewing keys are sensitive read-only audit capabilities. Do not expose them publicly or treat them as public proofs.

## 7. Free product model

Z-Bits software is free and open source. No subscription, hidden purchase markup or Z-Bits transaction fee is planned. Users still bear external costs such as AI inference, hosting, messaging, network fees and purchased goods. No essential security control should be paywalled.

## 8. Base repository and adaptation rules

The base is the Sidemates repository, currently observed at version `0.42.0` on 4 November 2026. Its documented architecture includes `src/studio/`, `src/server/`, `src/shared/`, `site/`, `desktop/`, `deploy/`, `skills/` and `mcp/`. It is a substantial local-first agent product, not a blank web template.

**Preserve the working agent machinery.** Keep internal Bit/teammate IDs, runtime classes, routing, memory, approvals, tools, routines, browser/computer controls, persistence and existing provider routes unless a measured incompatibility requires a change.

Use a presentation/configuration layer for Z-Bits display names. Do not rename internal agent identifiers just to display Maya or Bolt.

The public UI, application metadata, onboarding, navigation, icons, empty states, product help and Z-Bits-owned docs should use Z-Bits branding. Preserve MIT licensing, third-party notices, required copyright statements and a clear upstream-origin notice. Do not remove attribution or misrepresent the fork as independently authored from scratch.

## 9. AI provider principles

- Preserve working provider routes already present in Sidemates.
- Keep provider credentials server-side or in the repository's established secure credential storage.
- Support Gemini and existing OpenAI-compatible integrations without breaking their underlying execution route.
- Add AWS Bedrock as a separate provider adapter, using the native Converse API where appropriate and supporting the documented OpenAI-compatible endpoint only where compatible.
- Respect provider/model capability differences for streaming, tools and structured output.
- Do not show a provider as connected until a real backend test succeeds.
- Do not replace the complete runtime with a simplistic universal chat-completion adapter.

Provider configuration and agent execution are separate from Gate/Runner financial authorization.

## 10. Hackathon priorities

**Must work:** application starts; Maya produces a valid purchase intent; Gate enforces shared recipient budget; Runner executes one real Bitrefill purchase and confirms delivery; Zcash produces one genuine shielded NU7 testnet transaction; public repo, README, privacy/trust note, invoice ID, transaction ID and demo are ready.

**Best proof of USP:** Maya completes a purchase for a recipient, then Bolt submits a second request for the same canonical recipient. Gate blocks or requires approval because the recipient's shared budget has been consumed. Show the decision and ledger entry.

**Cut first if time is short:** WhatsApp, Sage, full GitHub OAuth/app, multiple providers, advanced analytics, custom memory, multi-user accounts, Zcash mainnet, ZEC-to-USDC conversion and any feature not required to prove the core flow.

## 11. Non-negotiable engineering rules

- Diagnose and fix the current API/provider regression before adding new provider features.
- Make a baseline run and record existing failures before edits.
- Keep changes small, testable and reversible.
- Preserve upstream functionality unless explicitly removed after dependency analysis.
- Never delete tests, security checks or build scripts simply to make the build pass.
- Never fake a provider connection, payment, transaction, invoice or delivery state.
- Keep secrets out of source, prompts, logs, screenshots and Git history.
- Use a new event-day repository and preserve an honest commit history as required by the hackathon.
- Confirm the actual checked-out commit and tree before relying on assumptions in this file.

## 12. Reference links

- Base repository: https://github.com/PrisacariuRobert/sidemates
- Upstream README and current run commands: https://github.com/PrisacariuRobert/sidemates#readme
- Upstream changelog: https://github.com/PrisacariuRobert/sidemates/blob/main/CHANGELOG.md
- Upstream security policy: https://github.com/PrisacariuRobert/sidemates/blob/main/SECURITY.md
- Zcash developer resources and Bitrefill event pack: use the official materials supplied for Free Society Hack, 4–5 November 2026.
