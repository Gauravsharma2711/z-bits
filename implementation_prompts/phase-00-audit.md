# Phase 00 Execution Prompt — Z-Bits Post-Rebranding Technical Audit

## 1. Mandatory Documentation Reading
Before inspecting code or executing commands, read:
1. `brain.md`
2. `prd.md`
3. `flow.md`
4. `clean.md`
5. `hackathon_rules.md`
6. `submission_guidelines.md`

## 2. Objective
Perform a complete, non-destructive technical audit of the cloned and rebranded Z-Bits repository. Establish exact working condition, identify reproducible bugs, evaluate AI provider routes, assess agent runtime preservation, verify database schemas, and generate baseline documentation.

## 3. Actual Technical Context
- Base: Sidemates `v0.42.0` on Node.js `v22.20.0`, Express 5, React 19, Vite 8, `node:sqlite`.
- Workspace: Standalone local directory; Git repository may not be initialized locally.
- Rebranding: Applied to `index.html`, `studio.html`, `Studio.tsx`, and `ZbitsOverview.tsx`.
- Gaps: Windows `spawn` bug prevents CLI discovery in `providers.ts`; Gate and Runner are skeletons requiring SQLite-backed canonical recipients, shared ledger, SpendPass nonces, and real Bitrefill/Zcash integrations.

## 4. User Responsibilities
- Review the audit findings in `CURRENT_STATE.md` and `GAP_ANALYSIS.md`.
- Provide AI provider credentials (`GEMINI_API_KEY`, etc.) when ready for Phase 02.
- Configure remote GitHub repository credentials if remote synchronization is desired.

## 5. Agent Responsibilities
- Execute read-only and verification commands (`npm run check`, `npm run build`, `npm test`).
- Never delete existing files, tests, or internal identifiers.
- Produce `CURRENT_STATE.md`, `GAP_ANALYSIS.md`, and `IMPLEMENTATION_PHASES.md`.
- Stop and request user review before beginning implementation phases.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [x] All 6 authoritative documents read and verified.
- [x] Git/workspace state documented accurately.
- [x] Rebranding verified and categorized.
- [x] Frontend, backend, database, and runtime architecture mapped.
- [x] Provider adapters tested and exact Windows `spawn` bug diagnosed.
- [x] `CURRENT_STATE.md` created with Mermaid architecture diagram.
- [x] `GAP_ANALYSIS.md` created with complete requirement matrix.
- [x] `IMPLEMENTATION_PHASES.md` created with clear dependencies.
- [x] Independent phase prompts generated in `implementation_prompts/`.

## 8. Regression Checks
- `npm run check` (TypeScript compilation) must pass with 0 errors.
- `npm run check:acceptance` must pass with 0 errors.
- `npm run build` must build client chunks without errors.
- Existing unit tests (`src/shared/**/*.test.ts`) must pass.

## 9. Git Workflow
### Local-Only Git Mode
- Preserve all existing files and user changes.
- Do not reset, clean, or discard the working tree.
- Do not force-push or create assumed remote repositories.
### Automatic GitHub Mode
- Only activate after user explicitly configures authenticated remote repository URL and target branch.
- Never push secrets, `.env`, or `.openbot` database files.

## 10. Handoff Instructions
Phase 00 is complete. Present the technical audit summary to the user and wait for explicit approval before proceeding to Phase 01 (Application Stability).

