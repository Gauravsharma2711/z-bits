# Upstream Notices & Attribution

This software is an adapted fork and transformation of **Sidemates** (originally **OpenBot**).

## Original Upstream Project
- **Upstream Repository:** [https://github.com/PrisacariuRobert/sidemates](https://github.com/PrisacariuRobert/sidemates)
- **Original Authors:** Robert Prisacariu and contributors
- **Original License:** MIT License

---

## Original License Text

```text
MIT License

Copyright (c) 2024-2026 Robert Prisacariu and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Z-Bits Adaptations and Modifications
The underlying agent runtime, communication loops, memory, tools, and execution infrastructure have been preserved and extended with:
- **Product Identity:** Transformed into **Z-Bits** ("Your agents. Your rules. Your money.").
- **Persona Presentation Layer:** Extensible mapping layer exposing specialized Bits (**Maya**, **Bolt**, **Sage**) while preserving internal agent identifiers (`nova`, `pixel`, `scout`).
- **Universal AI Providers:** First-class integration with Google Gemini (`@google/genai`), AWS Bedrock Converse API (`@aws-sdk/client-bedrock-runtime`), Bedrock OpenAI-compatible endpoints, and arbitrary OpenAI-compatible API providers.
- **Deterministic Gate Engine:** Mathematical financial safety engine enforcing per-transaction caps, daily/monthly budgets, merchant whitelisting, duplicate intent prevention, and HMAC-SHA256 signature verification.
- **Runner Commerce Service:** Isolated execution layer for autonomous commerce (Bitrefill and Zcash adapters), separating financial credentials and private keys from LLM conversations.

