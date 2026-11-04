<h1 align="center">Z-Bits</h1>

<p align="center">
  <strong>Your agents. Your rules. Your money.</strong><br />
  A free, open-source personal AI agent platform that gives you a team of specialized AI agents called Bits.<br />
  Autonomous execution, multi-provider AI intelligence, and a deterministic financial Gate.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#the-bits-team">The Bits Team</a> ·
  <a href="#universal-ai-providers">Universal AI</a> ·
  <a href="#deterministic-gate--runner">Gate & Runner</a> ·
  <a href="PROVIDER_SETUP.md">Provider Setup</a> ·
  <a href="ZBITS_ARCHITECTURE.md">Architecture</a> ·
  <a href="SECURITY.md">Security</a> ·
  <a href="UPSTREAM_NOTICES.md">Upstream Notices</a>
</p>

<p align="center">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg" />
  <img alt="Node: 20+" src="https://img.shields.io/badge/node-20%2B-green.svg" />
  <img alt="Status: active" src="https://img.shields.io/badge/status-active-indigo.svg" />
</p>

---

## What is Z-Bits?

Hosted agent services lock you into a single proprietary model and rent you access to computing time. **Z-Bits** runs locally or on your own private infrastructure, giving you full sovereignty over your agents, instructions, memories, and budget.

- **Universal AI Providers:** Connect **Google Gemini** (via `@google/genai`), **AWS Bedrock** (native Converse API via `@aws-sdk/client-bedrock-runtime` or OpenAI endpoint), generic **OpenAI-compatible** APIs (Groq, Together AI, DeepSeek, vLLM, Ollama), or local inference.
- **The Bits Team:** Work with specialized Bits designed for real responsibilities:
  - **Maya (Concierge Bit):** Everyday tasks, synthesis, travel planning, gifting, and personal commerce inquiries.
  - **Bolt (Bounty Bit):** Repository events, test verification, bug fixes, branch management, and code auditing.
  - **Sage (Occasion Bit):** Milestones, birthdays, calendar synchronization, and routine follow-ups.
- **Deterministic Financial Gate:** Language models hallucinate and cannot be trusted with financial boundaries. In Z-Bits, all commerce requests pass through a mathematical **Gate** policy that enforces strict per-transaction caps, daily/monthly budgets, and merchant whitelists before generating a cryptographically signed HMAC-SHA256 authorization token.
- **Runner Execution Service:** Commercial execution (such as Bitrefill voucher purchasing and Zcash shielded settlements) occurs in an isolated server environment. Sensitive payment tokens, merchant secrets, and private keys are never exposed to AI models or client browsers.
- **Honest Capability Model:** Works smoothly on desktop and mobile web browsers. Platform-specific features (such as Mac Apple Intelligence or native automation) are cleanly detected and clearly reported rather than showing fake or broken controls.

---

## The Bits Team

Z-Bits introduces an extensible presentation mapping layer that provides tailored personas while preserving the proven underlying agent runtime:

| Persona | Title | Preserved Internal ID | Key Responsibilities |
|---|---|---|---|
| **Maya** | Concierge Bit | `nova` | General assistance, deep research, vendor comparisons, gift recommendations |
| **Bolt** | Bounty Bit | `pixel` | Repository maintenance, code reviews, bug investigations, developer workflows |
| **Sage** | Occasion Bit | `scout` | Calendar awareness, milestone tracking, birthday reminders, routine check-ins |

*Note: All underlying database schemas, conversation threads, memory systems, and tool registries continue to operate seamlessly on the internal agent identifiers without disruption.*

---

## Universal AI Providers

Z-Bits connects to multiple AI providers without vendor lock-in:

1. **Google Gemini:** Official native `@google/genai` SDK integration with Gemini 2.5 Flash, Gemini 2.5 Pro, and Gemini 2.0 Flash.
2. **AWS Bedrock:** Native AWS Bedrock Converse API (`@aws-sdk/client-bedrock-runtime`) supporting Claude 3.5 Sonnet, Claude 3.5 Haiku, Amazon Nova Pro, Llama 3.3, and Mistral, plus Bedrock's OpenAI-compatible endpoint route.
3. **Generic OpenAI-Compatible:** Seamless connection to Groq, Together AI, OpenRouter, DeepSeek, local Ollama, and LM Studio.
4. **Preserved Integrations:** Existing working pathways for Claude Code, OpenCode Go, and OpenAI API keys remain fully supported.

For step-by-step setup instructions, see [PROVIDER_SETUP.md](PROVIDER_SETUP.md).

---

## Deterministic Gate & Runner

The long-term vision of Z-Bits is **autonomous personal commerce** with absolute safety.

```text
[Bit Request: Intent] 
       │
       ▼
[Z-Bits Gate Policy Engine]
  ├─ Mathematical limit verification (Daily/Monthly budget, per-tx cap)
  ├─ Merchant whitelist validation
  ├─ Duplicate / idempotency check
  └─ HMAC-SHA256 Cryptographic Authorization
       │
       ▼
[Runner Execution Layer (Server-Side Isolation)]
  ├─ Bitrefill Commerce Adapter (Disabled until real API keys connected)
  ├─ Zcash Shielded Settlement (Isolated from LLMs)
  └─ Zero API key or wallet exposure to conversational models
```

### Gate Safeguards
- **Per-Transaction Cap:** Restricts the maximum value of any individual purchase.
- **Daily & Monthly Budgets:** Prevents cumulative overspending.
- **Approval Thresholds:** High-value transactions automatically pause for explicit human review.
- **Emergency Kill Switch:** A single toggle immediately rejects all pending and future agent transactions globally.

---

## Quick Start

### Prerequisites
- Node.js `v20.0.0` or later (tested on Node `v22.20.0`)
- npm `10+`

### Installation

```bash
# Clone the repository
git clone https://github.com/Gauravsharma2711/side-bits.git
cd side-bits

# Install dependencies cleanly
npm ci

# Configure environment variables
cp .env.example .env
```

### Running the Application

```bash
# Start development server (Web Studio + Backend)
npm run dev

# Or build and run in production mode
npm run build
npm start
```

Open your browser at `http://127.0.0.1:4310` to open **Z-Bits Studio**.

### Verification & Testing

```bash
# Type check TypeScript codebase
npm run check

# Run Z-Bits test suites (Personas, Gate Engine, Universal Providers)
npx tsx --test src/shared/zbits-personas.test.ts src/server/gate/gate-engine.test.ts src/server/providers/provider-adapters.test.ts
```

---

## Documentation

- [PROVIDER_SETUP.md](PROVIDER_SETUP.md) — Comprehensive guide to setting up Gemini, AWS Bedrock, and OpenAI-compatible providers.
- [ZBITS_ARCHITECTURE.md](ZBITS_ARCHITECTURE.md) — Complete architecture specification, Persona mapping, Gate engine, and Runner service.
- [SECURITY.md](SECURITY.md) — Security boundary guarantees, credential isolation, and emergency procedures.
- [UPSTREAM_NOTICES.md](UPSTREAM_NOTICES.md) — Attribution and licensing notice for the upstream Sidemates / OpenBot project.

---

## License & Attribution

Z-Bits is released under the **MIT License**.

This project is an adapted fork and transformation of **Sidemates** (originally **OpenBot**), created by Robert Prisacariu and contributors. All original copyright notices, license terms, and required attributions are preserved in accordance with the MIT License. See [UPSTREAM_NOTICES.md](UPSTREAM_NOTICES.md) for complete details.
