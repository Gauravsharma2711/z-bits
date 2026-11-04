# Free Society Hackathon — Submission Guidelines

**Project:** Z-Bits  
**Submission platform:** Stadium  
**Time zone:** IST (UTC+5:30)  
**Final deadline:** **Thursday, 5 November 2026 at 00:00 IST**  
**First judging session:** Wednesday, 4 November 2026 at 20:00 IST

This document turns the supplied event pack's submission requirements into a checklist for Z-Bits. Follow the latest organiser instructions if they change.

## 1. Stadium submission process

1. Use the **Luma email of the project's designated point person** to submit on Stadium.
2. Create and save a draft early. Drafts are visible only to the submitting point person and are not judged.
3. Add teammates through the team list and grant edit access. Each teammate must be checked in using their own Luma email.
4. Complete the event feedback form.
5. Choose the Privacy track, Agentic Commerce track or both.
6. Complete the fields and evidence required for each selected track.
7. Click **Finalize and submit**. A draft is not a submission.
8. Finalize by **Wed 4 Nov, 20:00 IST** to be included in the first judging session. The final deadline is **Thu 5 Nov, 00:00 IST**. A finalized submission remains editable until the final deadline.

Late submissions are not scored.

## 2. Materials required for every Z-Bits submission

Prepare the following:

- [ ] One-line pitch describing what Z-Bits does and for whom.
- [ ] Public repository created during the hackathon, with a useful README.
- [ ] README lists every technology used and explains important design decisions.
- [ ] Clear instructions to run the project. For the Bitrefill track, the brief asks for setup in under 15 minutes.
- [ ] Public URL where judges can try the app, dashboard or checkout if submitting a usable web application.
- [ ] Demo video, ideally 2–3 minutes and never longer than 3 minutes.
- [ ] Clear evidence of the real working flow, not mock screens or simulated purchases.
- [ ] Next-step plan describing what the team will do in the 30 days after the event, with links to work already started where available.
- [ ] Ensure the project point person's contact details and Stadium submission are correct.

For the Zcash track, SDKs, CLIs, bots, agents and backends that do not have a public interactive app can use a video or README to show Zcash working, for example by linking to a transaction explorer.

## 3. Privacy track submission checklist (Zcash)

Required:

- [ ] One-line pitch.
- [ ] Build on NU7 testnet using shielded funds through unified addresses.
- [ ] One testnet transaction ID created by the project.
- [ ] Public repository and README listing technologies and design decisions.
- [ ] Privacy and trust note.
- [ ] Next-step plan for the following 30 days.
- [ ] Public application URL if the submission is an app people can use, such as a web app, checkout or dashboard.

Strongly preferred:

- [ ] A 2–3 minute demo showing every step of the one-line pitch.
- [ ] A real end-to-end transaction flow.
- [ ] A clear explanation of what the user sees and what the public blockchain does not reveal.

Optional, not scored:

- [ ] Friction notes tagged by area, describing what slowed development.

### Privacy and trust note — four required questions

Judges use this note to score the **Private** criterion. Answer all four questions directly:

1. **What stays private?** State which transaction details are shielded, and what information is not placed on-chain.
2. **What does the app reveal, and to whom?** Describe what Z-Bits' backend, hosted wallet/light-wallet infrastructure, AI model provider, Bitrefill and other services can observe.
3. **What must users trust?** Name the parties and components users must trust, such as Z-Bits' operator, backend, wallet infrastructure, AI provider and fulfillment provider.
4. **What would you fix next?** Disclose known information leaks, metadata exposures and unresolved privacy limitations.

For Z-Bits, explicitly state that phone numbers, names and recipient details are kept off the Zcash memo. Explain any opaque order reference and who can resolve it. Do not claim end-to-end privacy if the backend or fulfillment provider can see personal data.

### Zcash judging rubric

Each category is scored 0–3, plus a possible bonus point. Maximum score: 16.

| Criterion | What full marks require |
|---|---|
| Works | Core demo flow works for real, without mocked, manual or bypassed steps, with verifiable evidence |
| Private | Privacy is designed in; disclosures and trust assumptions are clearly explained |
| Easy | Intended user can complete the core task unaided in minutes |
| Needed | Evidence of demand, user validation or partner interest |
| Continuing | A real next step is underway, such as an upstream PR, issue, partner conversation, pilot or users |
| Bonus | Exceptional contribution/reusable ecosystem work; standout Nym or Noir integration may qualify |

A project scoring **0 on Works cannot win**. The brief says the number of features, technologies, polish and friction notes are not scoring criteria.

## 4. Agentic Commerce submission checklist (Bitrefill)

Required:

- [ ] Use at least one Bitrefill surface: MCP, CLI, Agent Skills, x402 or REST API.
- [ ] Show an agent-initiated purchase working in the demo. It must not be mocked.
- [ ] Include the invoice ID of at least one real purchase made by the project.
- [ ] Include the spending guardrails: maximum an agent can spend and who approves spending above that limit.
- [ ] Public repository and README explaining the project, selected lane (or original idea), setup and how to run it in under 15 minutes.
- [ ] 2–3 minute demo video showing the real purchase flow.
- [ ] One paragraph explaining which Bitrefill touchpoints were used and what the team built versus reused.
- [ ] `FEEDBACK.md` describing what broke, caused confusion or slowed development.

If entering the Zcash track as well:

- [ ] Identify which components satisfy which track.
- [ ] Add the Zcash privacy threat model and privacy/trust note.
- [ ] Include the real shielded NU7 testnet transaction ID separately from the Bitrefill invoice ID.

### Bitrefill demonstration sequence

Use the real developer flow:

1. `search-products`
2. `get-product-details`
3. `buy-products`
4. `get-invoice-by-id`
5. Poll invoice/order status until **delivered**.

Paid does not mean delivered. The demo should show the delivered state and provide the invoice ID.

### Z-Bits guardrails to disclose

State the exact limits actually implemented, for example:

- Maximum amount per order.
- Daily or campaign budget.
- Monthly recipient budget.
- Product/brand allowlist.
- New-recipient approval process.
- Duplicate/replay protection.
- Who can approve exceptional purchases.

Only claim a guardrail if the code enforces it. Explain that Gate is deterministic and that AI Bits do not hold payment credentials or signing keys.

### Bitrefill handling and security reminders

- Keep API keys out of Git, prompts, logs and screenshots.
- Keep `buy-products` out of an agent's automatic approval list until Gate and Runner protections are tested.
- Retrieve the current package values and price from product details; do not manually invent or retype denomination values.
- Check the actual amount immediately before purchase.
- Mask gift-card codes in the UI and logs. Never commit or publish codes.
- Respect account/product daily limits and API rate limits.
- Do not use hidden test products with an account balance unless Bitrefill has explicitly enabled and explained them for the account.
- Confirm event credits and the permitted payment route with Bitrefill mentors.

## 5. Z-Bits evidence checklist for entering both tracks

The two tracks have different evidence. Keep the evidence separate and label it clearly.

| Evidence | What it proves |
|---|---|
| Shielded NU7 testnet transaction ID | Zcash integration works on testnet |
| Bitrefill invoice ID | A real order was created and purchased |
| Delivered order status | Fulfillment completed |
| Gate decision/audit record | Spending rules were enforced |
| Attack-test results | Over-limit, duplicate, alias or modified authorization attempts were blocked |
| Privacy and trust note | What is hidden, exposed and trusted is disclosed |
| Public repository and README | Judges can inspect and run the project |
| Public demo URL/video | Judges can experience or inspect the working flow |

**Important payment distinction:** The event pack says Bitrefill does not accept ZEC directly. NU7 testnet TAZ is not real money and cannot fund a real Bitrefill order. If Z-Bits uses event credits for the Bitrefill purchase, state that plainly. Demonstrate the Zcash shielded testnet transaction as a separate privacy flow; do not claim it settled or funded the Bitrefill invoice.

## 6. Suggested Z-Bits one-line pitch

> Z-Bits is a team of personal AI agents that can gift, reward and purchase on your behalf, while one shared, privacy-first financial constitution enforces recipient-level budgets and authorizes every real purchase.

Adjust this only to describe functionality that is actually working in the submitted build.

## 7. Suggested 3-minute demo structure

Keep the video below the three-minute limit. Judges watch only the first three minutes.

| Time | What to show |
|---|---|
| 0:00–0:20 | Z-Bits problem and one-line pitch |
| 0:20–0:50 | Maya or Bolt creates a genuine purchase intent |
| 0:50–1:15 | Gate evaluates the shared recipient budget and issues/rejects authorization |
| 1:15–1:50 | Runner executes the real Bitrefill purchase; show invoice and delivered status |
| 1:50–2:20 | Show genuine shielded NU7 transaction evidence and explain the separate funding paths |
| 2:20–2:50 | Show a cross-agent spending attack blocked by Gate and summarize privacy/trust |

Do not spend most of the video on architecture slides. Show the product working.

## 8. Final pre-submit checklist

- [ ] New event-day Git repository with visible, truthful commit history.
- [ ] Correct point person Luma email used on Stadium.
- [ ] Teammates checked in and granted access if applicable.
- [ ] Correct track(s) selected.
- [ ] One-line pitch entered.
- [ ] Public URL tested from a logged-out or clean browser session, if required.
- [ ] README contains tech stack, design decisions and run instructions.
- [ ] Real Bitrefill invoice ID included for Agentic Commerce.
- [ ] Order is verified as delivered.
- [ ] Spending limits and approval policy documented.
- [ ] `FEEDBACK.md` included for Bitrefill.
- [ ] Real shielded NU7 testnet transaction ID included for Privacy.
- [ ] Privacy and trust note answers all four questions.
- [ ] 30-day next-step plan included.
- [ ] Demo video is no longer than three minutes.
- [ ] Event feedback form completed.
- [ ] Stadium draft saved before first judging; final submission button clicked before the final deadline.
- [ ] No API keys, wallet secrets, private keys or gift-card codes in the public repository or video.

## 9. Submission ownership and deadline

The designated project point person owns the Stadium submission and receives any prize. There is no team prize.

- **First judging:** Wed 4 Nov 2026, 20:00 IST.
- **Final submission:** Thu 5 Nov 2026, 00:00 IST.
- **Top-team demos:** Thu 5 Nov 2026, 12:00 IST.
- **Prize announcements:** Thu 5 Nov 2026, 13:00 IST.

Check the event page and official Telegram channel for any updates before finalizing.
