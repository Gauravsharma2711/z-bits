# Phase 09 Execution Prompt — Submission Packaging

## 1. Mandatory Documentation Reading
Before starting, read:
1. `hackathon_rules.md` (Sections 1, 2, 3: Eligibility, schedule, originality)
2. `submission_guidelines.md` (All sections: Stadium checklist, rubrics, video limits)
3. `clean.md` (Attribution, license preservation)
4. `CURRENT_STATE.md`
5. `GAP_ANALYSIS.md`

## 2. Objective
Finalize all hackathon submission deliverables for Stadium across both the Privacy (Zcash) and Agentic Commerce (Bitrefill) tracks: repository, README, `FEEDBACK.md`, `PRIVACY_NOTE.md`, video demo script, and Stadium metadata.

## 3. Actual Technical Context
- Hackathon: Free Society Hackathon, Mumbai.
- Final Deadline: Thursday, 5 November 2026, 00:00 IST.
- First Judging: Wednesday, 4 November 2026, 20:00 IST.
- Video Limit: Exactly 2–3 minutes (maximum 3 minutes; judges watch only the first 3 minutes).
- Required Evidence:
  - Agentic Commerce: Real Bitrefill invoice ID, delivery verified, spending guardrails, build-vs-reuse breakdown, `FEEDBACK.md`.
  - Privacy Track: Shielded NU7 testnet transaction ID, `PRIVACY_NOTE.md` (4 questions answered), 30-day plan.

## 4. User Responsibilities
- Submit via designated project point person's checked-in Luma email on Stadium.
- Grant Stadium edit access to checked-in teammates.
- Record the 2–3 minute video following the demo structure.
- Click "Finalize and submit" on Stadium before the deadline.

## 5. Agent Responsibilities
- Assemble comprehensive `README.md` covering: one-line pitch, architecture diagram, design decisions, run instructions (under 15 minutes), guardrails, and build-vs-reuse breakdown.
- Ensure `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `UPSTREAM_NOTICES.md` remain intact.
- Create `FEEDBACK.md` documenting specific developer-tool friction with reproduction steps for Bitrefill and Zcash.
- Verify `PRIVACY_NOTE.md` completely and honestly answers the 4 questions.
- Create `DEMO_SCRIPT.md` providing a second-by-second 3-minute video guide.
- Perform final security scan to ensure zero secrets, API keys, or gift-card codes exist in repository files.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] README.md contains full architecture, tech stack, run guide, and guardrails.
- [ ] Genuine Bitrefill invoice ID and delivered state documented.
- [ ] Genuine shielded NU7 testnet transaction ID documented.
- [ ] `PRIVACY_NOTE.md` and `FEEDBACK.md` present and detailed.
- [ ] 30-day next-step plan included.
- [ ] Zero secrets, private keys, or raw gift card codes in git history or files.
- [ ] Stadium submission fields verified.

## 8. Regression Checks
- Clean checkout test: clone/pull fresh directory, run `npm ci`, `npm run build`, verify app starts.

## 9. Git Workflow
### Local-Only Git Mode
- Tag final local release checkpoint.
### Automatic GitHub Mode
- Push all final documentation and evidence commits to main branch on authenticated remote.

## 10. Handoff Instructions
Phase 09 completes the project. Provide final submission checklist verification to the user and celebrate!

