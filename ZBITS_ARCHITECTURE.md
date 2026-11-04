# Z-Bits Technical Architecture

**Tagline:** Your agents. Your rules. Your money.

Z-Bits transforms the agent foundation into a personalized personal AI platform prepared for autonomous personal commerce.

---

## 1. Architectural Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        Z-BITS FRONTEND & STUDIO                        │
│  Overview · Bits (Maya, Bolt, Sage) · Chat · Gate Spending Rules · AI  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       HTTP / WebSocket JSON APIs
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│                    Z-BITS EXTENSION & IDENTITY LAYER                   │
│  Persona Mapping (Maya->nova, Bolt->pixel, Sage->scout)                │
├───────────────────────────────────┬────────────────────────────────────┤
│           DETERMINISTIC GATE      │           RUNNER EXECUTION         │
│  - Mathematical budget limits     │  - Isolated merchant adapters      │
│  - Per-transaction caps           │  - Bitrefill Gift Cards / eSIM     │
│  - Idempotency & Replay Checks    │  - Zcash Shielded Settlement       │
│  - HMAC-SHA256 Auth Signing       │  - Zero LLM credential exposure    │
├───────────────────────────────────┴────────────────────────────────────┤
│                    UNIVERSAL AI PROVIDER REGISTRY                      │
│  - Google Gemini (@google/genai)                                       │
│  - AWS Bedrock Converse API (@aws-sdk/client-bedrock-runtime)          │
│  - Generic OpenAI-Compatible Endpoints                                 │
│  - Preserved: Claude Code, OpenCode Go, Local Models                   │
├────────────────────────────────────────────────────────────────────────┤
│                    PRESERVED AGENT ENGINE & RUNTIME                    │
│  - Multi-agent orchestration, thread memory, vector embeddings         │
│  - Sandboxed browser automation, MCP tools, filesystem workspaces     │
│  - SQLite database schemas, run controls, approval mechanisms          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Preservation of Underlying Bit Components

To guarantee 100% stability and zero regression in agent capabilities, internal identifiers and runtime components are strictly preserved:

| User-Facing Persona | Role Title | Internal Agent ID | Mascot | Preserved Responsibilities |
|---|---|---|---|---|
| **Maya** | Concierge Bit | `nova` | `nova` | General requests, research, travel, gifting, personal commerce inquiries |
| **Bolt** | Bounty Bit | `pixel` | `blob` | Code benchmarks, repository events, git workflows, bug fixes |
| **Sage** | Occasion Bit | `scout` | `sprout` | Milestones, calendar tracking, reminders, routine follow-ups |

**Key Architectural Rule:** Database records, message threads, run IDs, routing logic, and MCP tools continue to use `nova`, `pixel`, and `scout`. The `zbits-personas.ts` mapping layer presents them as Maya, Bolt, and Sage across all user interfaces.

---

## 3. Deterministic Gate Financial Policy Engine

Autonomous commerce requires ironclad safety. LLMs hallucinate and can be jailbroken; therefore, **financial authorization in Z-Bits is never delegated to an AI model.**

### Gate Verification Pipeline
1. **Purchase Intent Creation:** A Bit formulates a structured `PurchaseIntent` containing:
   - `intentId`, `idempotencyKey`, `botId`, `merchant`, `recipient`, `amountCents`, `currency`, `itemDescription`.
2. **Intent Digest Calculation:** An immutable SHA-256 digest of the request fields is computed.
3. **Idempotency & Replay Protection:** Re-evaluating the same idempotency key or intent digest prevents double-charging.
4. **Merchant Whitelist Verification:** The target merchant must match the user-defined whitelist.
5. **Per-Transaction & Budget Limits:** The amount is verified against:
   - Single purchase cap (`maxPerTransactionCents`)
   - Rolling daily budget (`dailyBudgetCents`)
   - Rolling monthly budget (`monthlyBudgetCents`)
6. **Approval Threshold:** Transactions above `requireApprovalAboveCents` trigger explicit human confirmation before proceeding.
7. **Cryptographic Authorization:** If all checks pass, the server signs a `SignedPurchaseAuthorization` using HMAC-SHA256 with a 15-minute expiration timestamp.
8. **Emergency Kill-Switch:** Disabling the Gate instantly blocks all automated spending globally.

---

## 4. Runner Server-Side Execution Service

The Runner executes authorized purchases in total isolation from the agent runtime:
- **No LLM Credential Exposure:** Financial API keys, merchant tokens, and private keys reside exclusively in the server vault, never accessible to Bit prompts or browser scripts.
- **Bitrefill Commerce Adapter:** Coordinates prepaid vouchers, gift cards, and utility top-ups. Displays transparently as "Not Configured" until valid merchant credentials are provided.
- **Zcash Settlement Adapter:** Prepares shielded zero-knowledge value transfers. Displays as "Cold / Isolated" until connected to a validated node.

---

## 5. Universal AI Provider Registry

Located in `src/server/providers/`:
- **`provider-registry.ts`**: Defines the `AIProviderAdapter` contract and capability discovery.
- **`gemini-adapter.ts`**: Uses official `@google/genai` SDK for Google Gemini models.
- **`bedrock-adapter.ts`**: Uses `@aws-sdk/client-bedrock-runtime` for Bedrock Converse/ConverseStream and OpenAI-compatible endpoint modes.
- **`openai-adapter.ts`**: Universal adapter for arbitrary OpenAI-compatible APIs.

