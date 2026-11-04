# Z-Bits — Build Flow and Roadmap

**Date:** 4 November 2026  
**Hackathon:** Free Society Hack, Mumbai  
**Build window:** Wed 4 Nov 11:00 to Thu 5 Nov 00:00 IST

## 1. Build strategy

Build one complete vertical slice, not the full long-term platform.

**Target demo:** Maya requests a purchase for Rahul. Gate resolves Rahul's canonical recipient record and shared spending total. Runner executes one real Bitrefill purchase using a signed SpendPass and verifies delivery. A second Bit (Bolt) requests another reward for the same recipient; Gate blocks or escalates it because all Bits share one recipient-level budget. Separately, the project creates one genuine shielded Zcash NU7 testnet transaction with an opaque order reference. The testnet transaction does not fund Bitrefill.

## 2. Mandatory order of work

### Phase 0 — Baseline and technical spikes (11:00–12:15)

- Create a new event-day repository and record the starting commit of the Sidemates base.
- Preserve the upstream license and notices.
- Run `npm ci`, `npm run dev`, then `npm run verify` as time permits.
- Confirm web studio, backend, an existing agent and one provider request work.
- Test Bitrefill authentication, product lookup, payment/credits access and invoice retrieval.
- Ask mentors how event credits are assigned and how the test account is expected to pay.
- Ask a Zcash mentor to validate a NU7/Ironwood-compatible testnet tool and create a first shielded transaction.
- Record blockers immediately. Do not start large UI changes before the three integrations are understood.

**Go/no-go at 12:15:** If the base app is unstable, use the smallest working web path and stop reworking the agent framework. If the selected Zcash tool cannot create a test transaction, get mentor support or use another compatible developer tool from the event pack. If Bitrefill cannot pay, resolve that with the mentor before proceeding.

### Phase 1 — Recipient model and Gate (12:15–14:00)

- Define canonical `recipient_id` and aliases.
- Create the shared recipient ledger.
- Define owner, per-order, daily, monthly and per-recipient rules.
- Implement recipient resolution before budget checks.
- Implement idempotency and atomic budget reservation.
- Implement `ALLOW`, `DENY` and `REQUIRE_APPROVAL` with reasons.
- Create signed, expiring, exact-scope, single-use SpendPass.
- Write deterministic tests for aliases, cumulative spending, concurrent requests, expiry, tampering and replay.

**Exit check:** Maya and Bolt test intents for the same recipient hit the same budget. Gate blocks an over-limit request without an LLM decision.

### Phase 2 — Runner and real Bitrefill fulfillment (14:00–16:00)

- Select one Bitrefill surface: MCP, REST API or CLI. Do not implement all three.
- Store the credential server-side.
- Search the catalog and fetch product details.
- Use exact package/denomination values returned by Bitrefill; do not retype package strings.
- Validate current amount/price against SpendPass immediately before purchase.
- Execute one low-value real purchase using event credits or the approved test payment route.
- Retrieve invoice/order and poll until `delivered`.
- Capture invoice ID and sanitized receipt.
- Ensure gift-card codes are not logged or placed in agent transcripts.

**Exit check:** One real order is delivered and its invoice ID is recorded. A timeout is reconciled; it is not blindly retried.

### Phase 3 — Maya and second Bit (16:00–17:00)

- Connect Maya to the existing Sidemates agent runtime/UI.
- Parse free-text request into a validated structured intent.
- Add basic saved contact and alias lookup.
- Route Maya requests only to Gate.
- Add Bolt as a second independent request source. For the MVP, a controlled reward-event trigger is acceptable; implement GitHub webhook only if time permits.
- Ensure both Bits use the same Gate and ledger.

**Exit check:** Maya completes a real eligible request. Bolt's second request for the same recipient is blocked or requires approval due to cumulative spend.

### Phase 4 — Zcash privacy evidence (17:00–18:15)

- Use a tool/SDK confirmed compatible with NU7 and Ironwood testnet.
- Use a shielded unified testnet address.
- Create one actual shielded testnet transaction from the project.
- Use only an opaque order reference in the encrypted memo, if the chosen tool supports it.
- Record transaction ID and testnet evidence.
- Do not use WebZjs or old wallet tutorials unless the mentor confirms current NU7/Ironwood compatibility.
- Do not attempt ZEC-to-USDC conversion or represent TAZ as Bitrefill funding.

**Exit check:** A genuine shielded transaction ID exists and the privacy/trust note accurately explains the separate event-credit purchase.

### Phase 5 — Dashboard, attacks and regression (18:15–19:30)

- Show Bits, recipient budget, pending approval, Gate decision and order state.
- Show sanitized SpendPass metadata, not signing keys or secrets.
- Show actual Bitrefill invoice ID and delivered status.
- Show Zcash testnet transaction ID.
- Demonstrate cross-Bit cumulative recipient cap.
- Test altered SpendPass, replay, duplicate webhook, unknown recipient and over-limit amount.
- Re-run critical provider and agent flows.
- Prepare a public deployment/demo URL; do not claim unavailable integrations work.

### Phase 6 — Draft submission and mentor feedback (19:30–20:00)

- Save Stadium draft using the checked-in team point person's Luma email.
- Give teammates edit access using their checked-in Luma emails.
- Include the one-line pitch, working URL, repository and available evidence.
- Submit event feedback if required.
- Do not wait for the final video before saving the draft.

### Phase 7 — Optional Bolt GitHub integration (20:00–21:30)

Only proceed if the real purchase and Zcash flows already work.

- Configure one GitHub repository and webhook.
- Verify webhook signature.
- Accept only eligible merged PR events.
- Deduplicate delivery/event IDs.
- Map the contributor to a canonical recipient.
- Submit a fixed campaign reward intent to Gate.
- Reuse Runner; do not create a second commerce path.

If this is unstable, retain Bolt as a manually triggered second request source and document GitHub as the next step.

### Phase 8 — Submission materials (21:30–22:30)

- README with setup, architecture, technologies and build-versus-reuse description.
- Privacy and trust note: what is private, what the backend/AI provider/Bitrefill see, trust assumptions and known gaps.
- Bitrefill invoice ID and proof of delivered state.
- Zcash testnet transaction ID.
- Guardrails and maximum spending policy.
- `FEEDBACK.md` with specific developer-tool friction and reproduction steps.
- Next 30-day development plan.
- Verify public repo and URL do not expose secrets, gift-card codes or private keys.

### Phase 9 — Demo and finalization (22:30–00:00)

- Record a 2–3 minute video. Judges watch only the first three minutes.
- Demonstrate Maya's real purchase, Gate's cross-Bit recipient block, Runner's delivery proof and Zcash shielded testnet evidence.
- Show one attack being blocked by deterministic code.
- Keep the privacy explanation honest and concise.
- Recheck Stadium fields and finalize before Thu 5 Nov 00:00 IST.

## 3. Critical cut line

If time slips, remove features in this order:

1. Sage.
2. WhatsApp and extra messaging channels.
3. Full GitHub integration (keep Bolt as a second independent request source).
4. Multi-provider additions beyond the existing working route.
5. Advanced dashboard/analytics and custom policy editor.
6. Multi-user/family support.

**Do not cut:** Gate, shared recipient ledger, at least two request sources for the cross-Bit demo, one real Bitrefill purchase, one genuine shielded Zcash testnet transaction, privacy/trust note, invoice ID, tests for core spending rules and final submission evidence.

## 4. Post-hackathon roadmap

### Phase A — Stabilize and secure
- Independent security review of Gate, SpendPass and Runner.
- Durable database-backed nonce/replay protection.
- Atomic multi-budget reservations and safe release/reconciliation.
- Secret management and encryption review.
- Audit retention/export and recovery behavior.
- Regression test suite and reproducible deployments.

### Phase B — Better agent experience
- Complete Maya and Bolt identities/workflows.
- Add Sage occasion reminders.
- Add WhatsApp adapter only after channel reliability and policy review.
- Add per-Bit provider/model selection without breaking Sidemates provider paths.
- Add AWS Bedrock adapter after live tests for Converse, tool use and streaming.

### Phase C — More commerce and privacy
- Additional products/merchants.
- Secure recipient claim and delivery experience.
- Viewing-key-based private audit with explicit user consent.
- Better privacy boundaries and metadata minimization.
- Mainnet support only after security, operational and legal review.
- Never assume a Zcash-to-Bitrefill direct settlement route exists.

### Phase D — Business product
- Hosted organization deployments.
- Campaigns for communities, hackathons and open-source projects.
- Team reward budgets and multi-party approval.
- White-label gifting/reward experiences.
- Approved affiliate or commerce partnerships.

## 5. Official event constraints

- Hacking started Wed 4 Nov 2026 at 11:00 IST.
- Venue hacking ended at 19:00; remote mentor support continued.
- First judging started around 20:00.
- Final submissions closed Thu 5 Nov 2026 at 00:00 IST.
- Code/design/content must be made during the official window; ideas, research and sketches may be prepared beforehand.
- Use a fresh event-day repository; judges inspect commit history.
- Public repo/README, real demo, Bitrefill invoice ID, guardrails and `FEEDBACK.md` are required for Agentic Commerce.
- Zcash entry requires a genuine shielded testnet transaction ID, public repo/README, privacy/trust note and next-step plan.

Source: Free Society Hack organizer pack and developer resources supplied for this project.
