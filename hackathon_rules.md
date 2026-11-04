# Free Society Hackathon — Rules & Constraints

**Event:** Zcash Presents: Free Society Hackathon  
**Location:** True Tramm Trunk, BKC, Mumbai  
**Time zone:** IST (UTC+5:30)  
**Source:** Event information pack supplied by the participant. The organiser notes that the page may be updated; check the official event page and WebZero Telegram channel for changes.

## 1. Participation and team rules

- The event has 100 participant slots. Attendees must be checked in and have their Luma QR code ready.
- Only checked-in Luma guests may submit.
- Participants may work solo or in teams of up to four.
- Each project has one designated point person. That person is accountable for the submission and receives any prize. There is no team prize.
- Teammates must be checked in with their own Luma email before being granted Stadium edit access.
- Participants must follow event terms and treat attendees, mentors and staff respectfully. Organisers may remove people who do not.

## 2. Project-start and originality rules

- Official hacking begins **Wednesday, 4 November 2026 at 11:00 IST**.
- All project code, design and content submitted must be created during the event hacking window, ending **Thursday, 5 November 2026 at 00:00 IST**.
- Ideas, research and sketches may be prepared before hacking starts.
- Do not submit or build on a project that was started before the hackathon.
- Open-source libraries, SDKs, templates and starter kits are allowed.
- Create a **new repository on the event day**. Judges may inspect commit history.
- Keep the repository history clear and truthful. Distinguish upstream open-source code from new work and preserve all required licences and attribution.

## 3. Schedule

All times are IST.

| Date and time | Event |
|---|---|
| Wed 4 Nov, 11:00 | Hacking starts |
| Wed 4 Nov, 11:00–19:00 | Mentors available at venue |
| Wed 4 Nov, 19:00 | Venue hacking day ends; remote mentor support continues |
| Wed 4 Nov, 20:00 | First judging/scoring session starts; early drafts should be submitted |
| Thu 5 Nov, 00:00 | Final submission deadline; late submissions are not scored |
| Thu 5 Nov, 11:00 | Doors open; top teams are contacted |
| Thu 5 Nov, 12:00 | Demos by top teams |
| Thu 5 Nov, 13:00 | Prize announcements |

A draft is not judged. A finalized submission remains editable until **Thursday, 5 November at 00:00 IST**. The event instructions ask teams to save a draft early and finalize by the first judging time if they want to be included in the first judging session.

## 4. Demo rules

- The demo video is limited to **3 minutes maximum**. Judges watch only the first three minutes.
- A demo video is strongly preferred for the Zcash track, although it is not mandatory to win.
- Demoing in person is not required to win; judges score submissions.
- Show the complete core flow and real evidence. Do not present mocked or simulated operations as real transactions or purchases.

## 5. Track choice

There are two tracks:

### Privacy track — Zcash

Challenge: Make private money easier to use and easier to build with.

Build on **NU7 testnet**, using shielded funds through unified addresses. Follow the Zcash developer pack's compatibility warnings and use tools verified to work with the event's NU7/Ironwood testnet environment.

Suggested themes include:
- Private payment rails.
- The first five minutes of a shielded payment experience.
- Privacy beyond the transaction, including selective disclosure and infrastructure metadata.

A project may enter this track with its own idea if it fits the challenge.

### Agentic Commerce track — Bitrefill

Challenge: Give an AI agent the ability to find, buy and pay for real products through Bitrefill autonomously.

Requirements include:
- Use at least one Bitrefill surface: MCP, CLI, Agent Skills, x402 or REST API.
- Demonstrate a real agent-initiated purchase. A mocked purchase does not satisfy the requirement.
- Provide an invoice ID for at least one real purchase made by the project.
- State the maximum an agent can spend and who approves purchases above that limit.
- Do not consider a purchase complete merely because it is paid. Verify that the invoice/order reaches **delivered**.

A project may enter both tracks and may win in both, provided it satisfies both tracks' requirements.

## 6. Important money, privacy and integration constraints

- Zcash testnet TAZ is test currency and has no real monetary value. A TAZ transaction does **not** fund a real Bitrefill purchase.
- The event pack states that Bitrefill does not accept ZEC directly. The documented ZEC-to-USDC conversion route requires deshielding to a transparent address and a real-money swap; it has no testnet route. Do not claim direct ZEC settlement unless it is actually implemented and evidenced.
- For a hackathon demo, use event-provided Bitrefill credits or another explicitly authorized payment route for the real purchase, and demonstrate the Zcash testnet transaction separately. Explain the relationship honestly.
- Keep Bitrefill API keys and wallet credentials out of source code, prompts, chat logs, screenshots and public repositories.
- Gift-card codes are cash-like secrets. Do not log, commit or expose raw codes in the demo. Mask them and use a protected claim/delivery flow.
- The Bitrefill pack warns about daily product/account limits, rate limits, package-value formatting and test products that may be unavailable or may debit real balance. Verify current catalog and prices at purchase time.
- Keep `buy-products` out of automatic approval until the spending guardrails have been tested.
- x402 is documented as mainnet-only for Bitrefill; do not depend on it for a testnet purchase demo.

## 7. Z-Bits-specific interpretation

For Z-Bits, the practical event scope is:

1. Demonstrate one or more AI Bits submitting a structured purchase intent.
2. Enforce a shared owner-controlled spending policy in deterministic Gate code.
3. Ensure Runner accepts only a valid, scoped authorization and prevents replay or modified purchase requests.
4. Execute one genuine Bitrefill purchase and verify delivery.
5. Demonstrate one genuine shielded NU7 testnet transaction, using an opaque reference where appropriate.
6. Explain clearly that testnet TAZ did not pay for the Bitrefill order.
7. Provide an honest privacy and trust note describing what Zcash, Z-Bits' backend, the AI provider and Bitrefill can see.

Do not add features at the expense of these working core flows.

## 8. Prizes (as listed in the supplied event pack)

- **Privacy track:** $1,300 pool, listed as 2 × $300 and 2 × $200, plus an Ecosystem Prize. A separate MVP recognition includes a ZKSnarks NFT for one standout contribution.
- **Agentic Commerce track:** $1,000, $800 and $600 prizes, plus $100 for best feedback.
- Privacy prizes are paid in USDC; Agentic Commerce prizes are Bitrefill gift cards.

## 9. Official event communications

The event pack says major updates are communicated through the WebZero Telegram channel:

https://t.me/joinWebzero/8828

Check the latest organiser instructions before relying on this document. This file is a working extraction of the supplied event pack, not a replacement for organiser announcements or event terms.
