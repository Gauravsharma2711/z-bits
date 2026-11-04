# Z-Bits Security Policy & Guardrails

Z-Bits is designed around the core principle: **"Your agents. Your rules. Your money."**

Autonomous agents with access to tools, browsers, and commerce require strict, non-negotiable security boundaries.

---

## 1. The Separation of Brain and Wallet

In Z-Bits:
- **Conversational AI Bits** are the "Brain" — creative, autonomous, capable of research and formulation.
- **The Gate & Runner** are the "Wallet" — deterministic, mathematical, and cryptographic.

### Core Security Rules
1. **No LLM Decision on Money:** A language model is never permitted to authorize, increase, or bypass financial transactions.
2. **Deterministic Mathematical Verification:** Limits, daily budgets, and merchant whitelists are enforced through server-side mathematical equality and inequality checks.
3. **Cryptographic Signing (HMAC-SHA256):** Every approved transaction must possess a cryptographically valid, non-expired authorization token signed by the server's private secret.
4. **Idempotency Protection:** Double execution or replayed requests are mathematically rejected.
5. **Emergency Kill-Switch:** Users can deactivate autonomous commerce at any moment with a single toggle in **Spending & Rules**.

---

## 2. Credential Isolation

- **Zero Client Exposure:** API keys (Gemini, Bedrock, Anthropic, OpenAI, Bitrefill) are stored strictly server-side on the host machine.
- **No Transmission to Frontend:** Credentials are never passed in API response payloads to browser JavaScript, DOM, cookies, or localStorage.
- **Log Sanitization:** Sensitive authorization headers, signing keys, and secrets are redacted from stdout and diagnostic logs.

---

## 3. Platform Capabilities & Transparent Status

Z-Bits adheres strictly to an honest capability model:
- **Web vs. Desktop:** Mac-specific capabilities (e.g. Apple Intelligence, Mac Mail reading) are disabled and reported as unavailable when running on Windows, Linux, or in universal web mode.
- **Unconfigured Integrations:** Adapters such as Bitrefill and Zcash clearly report their unconfigured status. Fake transactions or simulated confirmations are strictly prohibited.

---

## 4. Reporting Security Issues

If you discover a vulnerability in Z-Bits Gate, Runner, or agent sandbox mechanisms, please report it privately to the maintainers rather than creating a public issue.
