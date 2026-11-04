# Phase 02 Execution Prompt — AI Provider Validation

## 1. Mandatory Documentation Reading
Before starting, read:
1. `brain.md` (Section 9: AI provider principles)
2. `prd.md` (Section 11: Provider strategy)
3. `PROVIDER_SETUP.md`
4. `CURRENT_STATE.md`

## 2. Objective
Validate live connectivity and model execution for supported AI providers (Google Gemini, AWS Bedrock, OpenAI-compatible) using secure server-side credentials, without breaking existing Claude Code or OpenCode Go execution pathways.

## 3. Actual Technical Context
- Direct adapters exist in `src/server/providers/`:
  - `gemini-adapter.ts` (`@google/genai` SDK)
  - `bedrock-adapter.ts` (`@aws-sdk/client-bedrock-runtime` Converse API)
  - `openai-adapter.ts` (Universal OpenAI-compatible endpoint)
- Adapters are connected to probe testing via `src/server/provider-test.ts`.
- Security rule: Provider API keys and AWS credentials must never be passed to frontend browser scripts or logged in cleartext.

## 4. User Responsibilities
- Supply at least one real API key (e.g. Google Gemini API key from Google AI Studio, or AWS credentials) in server environment or via the Studio UI.

## 5. Agent Responsibilities
- Wire live probe testing in `provider-test.ts` to verify active model access and measure round-trip latency.
- Ensure that `GET /api/provider/:id/test` and `POST /api/provider/:id/test` return honest receipts (`tested: true` only when a live model responds).
- Test fallback handling for rate limits (HTTP 429) and invalid keys (HTTP 401/403).
- Do not mark a provider as connected based solely on saved credentials.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] At least one AI provider (e.g., Google Gemini) connects and executes a live probe test successfully.
- [ ] Round-trip latency and active model list are recorded in database extension records.
- [ ] Bad keys or network failures return plain-text, safe error explanations without crashing the server.
- [ ] Provider secrets remain strictly in `SecretVault` / server environment.

## 8. Regression Checks
- `npx tsx --test src/server/providers/provider-adapters.test.ts` passes.
- Existing provider catalog generation in `src/server/providers.ts` remains functional.

## 9. Git Workflow
### Local-Only Git Mode
- Commit validated provider adapters and probe tests locally.
- Do not commit `.env` or files containing live API keys.
### Automatic GitHub Mode
- Enabled only with user remote authentication.

## 10. Handoff Instructions
Once Phase 02 passes, document verified provider status in `CURRENT_STATE.md` and transition to Phase 03 (Gate: Recipient Registry & Shared Ledger).

