# Phase 07 Execution Prompt — Zcash NU7 Testnet Integration

## 1. Mandatory Documentation Reading
Before starting, read:
1. `hackathon_rules.md` (Section 5: Privacy track & Section 6: Money constraints)
2. `submission_guidelines.md` (Section 3: Privacy track checklist & 4 Privacy questions)
3. `brain.md` (Section 6: Privacy and payment boundaries)
4. `flow.md` (Phase 4: Zcash privacy evidence)

## 2. Objective
Produce one genuine shielded transaction on the Zcash NU7 testnet using unified addresses, attach an opaque internal order reference in the encrypted memo, record the verifiable transaction ID, and draft the comprehensive Privacy & Trust Note.

## 3. Actual Technical Context
- Current `ZcashAdapter` in `src/server/runner/commerce-runner.ts` returns a mock string (`tx_mock_...`).
- Testnet TAZ has NO monetary value and does NOT fund Bitrefill. The Bitrefill order is funded separately via event credits.
- Never place recipient names, phone numbers, gift descriptions, or PII into the Zcash memo field. Only an opaque reference (e.g. `zbits:ord_a8f92b`) is permitted.
- Viewing keys are sensitive audit credentials and must never be exposed publicly.

## 4. User Responsibilities
- Provide testnet wallet credentials or faucet-funded unified address on NU7 testnet.
- Confirm network connectivity to a compatible lightwalletd or testnet node.

## 5. Agent Responsibilities
- Integrate verified Zcash NU7 testnet tool/SDK in `src/server/runner/zcash-client.ts`.
- Execute a genuine shielded value transfer between testnet unified addresses.
- Embed the opaque internal order reference into the encrypted memo.
- Confirm transaction broadcast and capture the genuine transaction ID.
- Create `PRIVACY_NOTE.md` answering the 4 mandatory hackathon questions:
  1. What stays private?
  2. What does the app reveal, and to whom?
  3. What must users trust?
  4. What would you fix next?

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] Genuine shielded transaction constructed and broadcast to NU7 testnet.
- [ ] Verifiable transaction ID obtained and verified on testnet block explorer.
- [ ] Encrypted memo contains only the opaque order reference (zero PII).
- [ ] Separation of testnet TAZ from real Bitrefill settlement is stated plainly.
- [ ] `PRIVACY_NOTE.md` answers all 4 required questions with technical accuracy.

## 8. Regression Checks
- Runner maintains strict isolation between Bitrefill and Zcash payment adapters.
- No wallet keys or spending keys are exposed in git or client bundles.

## 9. Git Workflow
### Local-Only Git Mode
- Commit Zcash client, adapters, and privacy note locally.
- Never commit wallet spending keys or seed phrases.
### Automatic GitHub Mode
- Verify that credentials are not in diff before pushing.

## 10. Handoff Instructions
Record the verified Zcash transaction ID in `CURRENT_STATE.md`. Transition to Phase 08 (Dashboard & Security Hardening).

