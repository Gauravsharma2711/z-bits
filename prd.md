# Z-Bits — Product Requirements Document

**Version:** 2.1  
**Date:** 4 November 2026  
**Status:** Hackathon MVP specification  
**Base:** [Sidemates](https://github.com/PrisacariuRobert/sidemates)  
**Tagline:** Your agents. Your rules. Your money.

## 1. Product summary

Z-Bits is a free, open-source personal AI-agent platform where users delegate purchases and rewards to specialized agents called Bits. Its core differentiator is **recipient-aware, cross-agent spending under one shared financial constitution**.

All Bits share one canonical recipient registry and spending ledger. A gift or reward purchased by Maya reduces what Bolt or Sage can spend on the same recipient. Aliases must resolve to one recipient identity. Each financial request passes through deterministic Gate authorization and is executed only by Runner after a scoped, signed SpendPass is verified.

Z-Bits reuses the existing Sidemates agent runtime and adapts its product identity and workflows. It does not rebuild the agent framework.

## 2. Problem

Personal agents are becoming capable of taking actions and initiating purchases, but independent agents can create fragmented budgets, duplicate rewards, misidentify recipients or exceed an owner's intended spending. Ordinary per-agent limits do not solve cross-agent cumulative spending against the same person.

Users need useful agents that can perform commerce while one owner-controlled system enforces shared recipient identity, spending limits, approvals and auditable execution.

## 3. Target users

- Individuals and households sending gifts or mobile top-ups.
- Open-source maintainers and contributor communities issuing rewards.
- Student clubs, hackathons and campus communities.
- Small teams and organizations managing appreciation or incentive budgets.
- Developers who want to self-host personal agents and retain control of their data and policies.

## 4. USP and positioning

**USP:** Relationship-aware spending across independent agents. Z-Bits evaluates the recipient's canonical identity and total spend across all Bits, not merely an individual agent's order limit.

Positioning: **A private commerce team for your life.** Many specialized agents can act, but all share the owner's financial constitution.

Do not claim Z-Bits is the first agent spending firewall, first key-isolated agent system or first signed payment mandate. The differentiation is the product implementation of canonical recipient identity plus a shared cross-agent budget and privacy-aware commerce workflow.

## 5. Product principles

1. Free and open-source software; external provider, hosting, messaging and purchase costs remain the user's responsibility.
2. Agents can reason and request; deterministic services authorize and execute.
3. All Bits share one owner-level and recipient-level ledger.
4. Default to least privilege and fail closed.
5. Privacy claims must match the actual data flow.
6. Keep the existing agent system working; customize its presentation and connect Z-Bits domain services through explicit interfaces.
7. Never represent mocks or testnet funds as real settlement.

## 6. Bit roles

| Bit | Responsibility | Scope |
|---|---|---|
| **Maya — Concierge** | Understand requests for gifts/top-ups, resolve saved contacts and aliases, ask clarifying questions, request authorization and communicate status. | Primary MVP agent |
| **Bolt — Bounty** | Receive a bounded contributor-reward event and submit a reward request to Gate. | Second request source to prove cross-agent budget sharing; GitHub webhook is optional if time permits |
| **Sage — Occasion** | Maintain occasion reminders and propose gifts. | Post-hackathon/stretch |
| **Gate — Guard** | Deterministic policy evaluation, recipient resolution, shared budget reservation, approvals, SpendPass issuance and audit. | Mandatory service; no LLM decision-making |
| **Runner — Buyer** | Validate SpendPass, execute exact Bitrefill purchase, poll invoice/order and verify delivery. | Mandatory service; no LLM authority |

The Bit names are product personas. Preserve internal IDs and component names in the Sidemates runtime; use display/configuration mapping where required.

## 7. MVP scope

### P0 — Must ship for hackathon

**Existing application foundation**
- Forked Sidemates repository starts and its existing core flows remain functional.
- Z-Bits product branding is applied across user-facing surfaces.
- Existing internal agent IDs, runtime, memory, approval flow and provider execution routes are preserved.
- Existing provider/API regression is diagnosed and fixed before new integrations are layered on.

**Maya and second request source**
- Maya accepts a natural-language gift or top-up request.
- Request is normalized into a typed purchase intent.
- Saved contact and basic aliases resolve to a canonical `recipient_id`.
- Bolt can submit a separate bounded reward request (manual event trigger is acceptable for the MVP if a verified GitHub webhook is not ready).
- Both agents route through the same Gate and ledger.

**Gate / Shared Spending Constitution**
- Owner policy configuration for per-order, daily, monthly and per-recipient caps.
- Allowed product/brand/category list and allowed denominations.
- Canonical recipient registry with aliases.
- Cross-agent recipient-level cumulative spend calculation.
- New-recipient approval or trusted-contact restriction.
- Duplicate/idempotency protection.
- Atomic budget reservation and settlement/release.
- `ALLOW`, `DENY` and `REQUIRE_APPROVAL` decisions with reason codes.
- Emergency purchase pause.
- Short-lived signed, single-use SpendPass.

**Runner / Bitrefill**
- Server-side Bitrefill integration via one supported surface (MCP, REST API or CLI; choose one for MVP).
- Search products and retrieve current product details.
- Validate exact product, package/denomination and actual price against SpendPass.
- Execute one real agent-initiated purchase using event credits or an explicitly authorized method.
- Retrieve invoice/order and wait for `delivered` before reporting success.
- Store receipt/claim data securely; never print gift-card codes in logs or agent history.

**Zcash privacy integration**
- Use a compatible NU7 testnet tool/SDK and shielded unified address.
- Create one genuine shielded testnet transaction from the project.
- Use an opaque order reference only in the encrypted memo, if supported by the selected flow.
- Record transaction ID and verifiable status.
- Clearly state testnet TAZ has no value and does not fund Bitrefill. Use event credits for the real purchase.
- Write an honest privacy and trust note describing public chain, backend, AI provider and Bitrefill visibility.

**Dashboard and proof**
- Show Bits, pending approvals, recipient budget, purchase status and chronological activity.
- Show Gate's allow/deny reason and cross-agent ledger state.
- Show SpendPass status without exposing signing secrets.
- Show actual Bitrefill invoice ID and delivery state.
- Show Zcash testnet transaction ID and confirmation state.

### P1 — Add only after P0 is proven

- Authenticated GitHub webhook for Bolt.
- Telegram approval channel.
- Additional provider adapters, including AWS Bedrock, if not already stable.
- Basic Sage occasion reminders.
- More contact aliases and import/export.
- Better audit export and UX polish.

### P2 — Post-hackathon

- WhatsApp adapter and multi-channel identity management.
- Fully autonomous Sage with calendar/contact integrations.
- Multiple merchants and payment rails.
- Zcash mainnet support after security review.
- Multi-user/family accounts and multi-party approvals.
- Organization campaign management and hosted deployment.
- Advanced recipient preference/relationship intelligence.
- Marketplace of Bits and policy templates.

## 8. Primary user journeys

### 8.1 Maya purchase

1. User asks Maya for a gift card or top-up.
2. Maya extracts merchant, product, denomination, recipient and purpose; it asks for missing details.
3. Recipient lookup resolves contact aliases to canonical `recipient_id`.
4. Maya submits a structured intent to Gate.
5. Gate checks identity, merchant/product, order cap, recipient cap, total owner budget, daily/monthly totals, duplicate status and approval requirements.
6. Gate atomically reserves the budget and issues a signed SpendPass only when allowed.
7. Runner verifies signature, exact scope, expiry, nonce and revocation state.
8. Runner obtains current product detail/price and executes the exact purchase.
9. Runner polls invoice/order until delivered or a terminal failure/uncertain state.
10. Budget is settled or safely released; activity is recorded; Maya informs the user.

### 8.2 Cross-Bit recipient limit

1. Maya completes a purchase for recipient Rahul.
2. The shared ledger records the amount against Rahul's canonical ID.
3. Bolt submits a separate reward request using Rahul's alias.
4. Gate resolves the alias to the same recipient ID, totals spend across all Bits and blocks or requests approval for the over-limit request.
5. Dashboard shows both agent requests and one shared recipient budget.

### 8.3 New recipient

1. Request contains an untrusted or unknown recipient.
2. Gate returns `REQUIRE_APPROVAL` and does not issue SpendPass.
3. Owner approves the exact recipient, product and amount through an independently enrolled channel or authenticated dashboard.
4. Approval is short-lived, one-time and bound to the request.
5. Runner executes only after Gate re-evaluates and issues the scoped SpendPass.

### 8.4 Failure/uncertain purchase

- A timeout after a provider call must not trigger a blind retry.
- Mark the outcome `UNCERTAIN`, reconcile using the provider invoice/order ID, and require safe recovery before another purchase.
- Never claim delivery until provider state proves delivery.

## 9. Architecture

```text
Web Studio / Existing Sidemates UI
              |
      Existing Agent Runtime
        /      |       \
      Maya    Bolt    (Sage later)
        \      |       /
       Structured Purchase Intent
                  |
          Recipient Resolver
                  |
       Shared Spending Constitution
                  |
          Gate (deterministic)
          /       |        \
       Deny   Approval   SpendPass
                              |
                         Runner
                              |
                         Bitrefill
                              |
                     Invoice / Delivery

Zcash NU7 testnet: separate privacy-evidence/payment demonstration
with opaque order reference; not Bitrefill settlement.
```

### Existing foundation

Use the Sidemates repository's existing paths and responsibilities as discovered in the checked-out version. The current upstream README documents `src/studio/`, `src/server/`, `src/shared/`, `site/`, `desktop/`, `deploy/`, `skills/` and `mcp/`. Preserve core capabilities and adapt selectively; inspect the real checkout before editing.

### Z-Bits-owned domain modules

Add modular services for:
- `recipient-registry`: canonical recipients and aliases.
- `spending-policy`: policy definitions and deterministic evaluations.
- `spending-ledger`: owner/recipient/campaign totals and atomic reservations.
- `spendpass`: signed, scoped, expiring, single-use authorizations.
- `runner`: authorized purchase execution and reconciliation.
- `bitrefill-adapter`: chosen commerce API surface.
- `zcash-adapter`: NU7 testnet transaction evidence.
- `audit-events`: append-only security and fulfillment events.

Do not force these names or a new framework if the existing repository has established conventions. Preserve the separation of responsibilities.

## 10. Core data concepts

- `Owner`: controls Bits, policies and credentials.
- `BitProfile`: user-facing persona mapped to an existing internal agent ID.
- `Recipient`: canonical private recipient record.
- `RecipientAlias`: normalized alias/phone/contact identifier mapped to recipient.
- `PurchaseIntent`: requested merchant, product, denomination, recipient, purpose and initiating Bit.
- `Policy`: owner-level, recipient-level and campaign-level rules.
- `BudgetReservation`: atomic hold against applicable limits.
- `SpendPass`: signed exact-scope purchase authorization.
- `Order`: provider invoice/order, state and idempotency key.
- `AuditEvent`: decision, approval, execution, reconciliation and delivery event.
- `PrivacyReference`: opaque link between internal order and optional Zcash testnet evidence.

Protect contact data, encrypted delivery codes, credentials and viewing keys. Never place PII in a public transaction field or plain-text memo.

## 11. Provider strategy

Preserve the existing Sidemates provider/runtime adapters. The repository's current README documents Gemini, Claude/Claude Code, OpenAI-compatible APIs, OpenCode Go and Ollama routes; validate the actual checked-out version. AWS Bedrock is an additional integration only if implemented and tested, not an assumption.

Provider keys and AWS credentials remain server-side or in the established secure vault. Different Bits may use different providers if the existing runtime supports per-agent connections. Do not replace provider-specific paths with a lowest-common-denominator adapter that breaks tools or streaming.

## 12. Functional requirements and acceptance criteria

| ID | Requirement | Acceptance |
|---|---|---|
| FR-01 | Maya creates structured purchase intent | Required fields are validated; missing details trigger clarification |
| FR-02 | Canonical recipient resolution | Different aliases for one contact map to one ID |
| FR-03 | Shared cross-Bit ledger | Maya and Bolt see the same recipient cumulative spend |
| FR-04 | Atomic policy enforcement | Concurrent requests cannot overspend the same remaining allowance |
| FR-05 | SpendPass | Altered, expired, revoked or replayed tokens are rejected |
| FR-06 | Runner scope enforcement | Runner purchases only the exact authorized product/recipient/amount |
| FR-07 | Bitrefill fulfillment | Actual invoice ID and delivered state are captured |
| FR-08 | Zcash evidence | One real shielded NU7 testnet transaction ID is available |
| FR-09 | Honest privacy note | Data visibility and trust assumptions are stated accurately |
| FR-10 | API reliability | A provider request succeeds end-to-end through the UI and intended runtime |
| FR-11 | Auditability | Every Gate decision and order transition has a traceable event |
| FR-12 | Fail-closed behavior | Unavailable Gate/ledger/signature verification blocks purchase |

## 13. Security requirements

- AI Bits never access Gate signing keys, Zcash spending keys or Bitrefill credentials.
- Gate is deterministic; do not ask an LLM whether a purchase is safe.
- Verify all incoming GitHub webhook signatures if GitHub integration is enabled.
- Resolve aliases before evaluating budgets.
- Reserve budgets transactionally.
- Apply idempotency across inbound events and provider orders.
- SpendPass is signed, short-lived, exact-scope and single-use.
- Runner checks the live product price against `max_price` immediately before execution.
- Handle provider timeouts as uncertain; never blindly replay purchases.
- Encrypt sensitive contact data and claim codes; mask them in UI/logs.
- Use an independently secured second channel for step-up approval; two apps on one compromised device are not independent factors.
- Keep viewing keys private and disclose backend/AI-provider visibility.
- Global pause blocks new purchases and revokes outstanding SpendPass tokens.

## 14. Free/open-source model

The Z-Bits software tier is free and open source. No subscription, purchase markup or Z-Bits transaction fee. External costs (LLM inference, hosting, messaging, purchased goods, network fees) are paid directly by the user or project. No essential security feature is paywalled.

## 15. Hackathon deliverables

For the Privacy/Zcash track:
- One-line pitch.
- Public repository and README with technology/design decisions.
- Public testable URL if the app is user-facing.
- One genuine shielded NU7 testnet transaction ID.
- Privacy and trust note.
- Next-step plan.
- Short demo showing the real flow.

For Agentic Commerce/Bitrefill:
- Public repository and README.
- 2–3 minute demo of a real agent-initiated purchase.
- At least one real Bitrefill invoice ID.
- Guardrails (maximum spend and approval rules).
- One paragraph identifying Bitrefill touchpoints and what was built versus reused.
- `FEEDBACK.md` documenting useful developer feedback.

Use event credits for the Bitrefill order and disclose that separately from Zcash testnet activity. Confirm actual product/package availability and account payment method with mentors before relying on a demo item.

## 16. Explicitly out of scope for hackathon

- Sage full implementation.
- WhatsApp integration.
- Full multi-user family account system.
- Full marketplace of Bits.
- Mainnet Zcash wallet or ZEC-to-USDC bridge.
- Multiple merchant integrations.
- Production deployment automation and signed desktop packaging.
- Advanced analytics, recommendation engine or broad contacts sync.

## 17. Success metrics

- One real Bitrefill purchase initiated through a Bit and verified delivered.
- One genuine shielded NU7 testnet transaction created by the project.
- Cross-Bit recipient budget demonstrably blocks or escalates a second request.
- SpendPass alteration/replay tests are rejected.
- No credential, recipient PII or gift-card code appears in logs or public memo.
- Existing application and provider workflows pass regression tests.
- Public README, video, privacy note, invoice ID and testnet tx ID are submitted.

## 18. Sources and implementation references

- Base repository: https://github.com/PrisacariuRobert/sidemates
- Base README: https://github.com/PrisacariuRobert/sidemates#readme
- Base package scripts and checks: https://github.com/PrisacariuRobert/sidemates/blob/main/package.json
- Base `.env.example`: https://github.com/PrisacariuRobert/sidemates/blob/main/.env.example
- Base security policy: https://github.com/PrisacariuRobert/sidemates/blob/main/SECURITY.md
- Official Zcash and Bitrefill developer material supplied for Free Society Hack, 4–5 November 2026.
