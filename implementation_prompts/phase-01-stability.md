# Phase 01 Execution Prompt — Application Stability

## 1. Mandatory Documentation Reading
Before starting, read:
1. `CURRENT_STATE.md`
2. `GAP_ANALYSIS.md`
3. `clean.md`
4. `flow.md`

## 2. Objective
Resolve verified startup, CLI process spawning, and API readiness defects on Windows without altering runtime behavior or renaming internal identifiers.

## 3. Actual Technical Context
- Defect 1: In `src/server/providers.ts#L34`, `spawn(command, args, ...)` fails with `EINVAL` on Windows because `opencode` is a batch script (`opencode.cmd`) and Node.js v22 requires `{ shell: true }` (or platform check `shell: process.platform === "win32"`). This causes `/api/readiness` to report `Model runtime not installed`.
- Defect 2: In `src/server/index.ts#L5384`, the log outputs `http://127.0.0.1:4310`, but Express actually listens on `port = 4311`. Clarify development vs production URLs.
- Installed CLIs: OpenCode `1.18.31` and Claude Code `2.1.193` are already installed and verified on this system.

## 4. User Responsibilities
- Review proposed changes to `providers.ts` and `index.ts`.
- Confirm local server responsiveness in browser (`http://localhost:4311` or Vite `http://localhost:4310`).

## 5. Agent Responsibilities
- Fix process execution in `src/server/providers.ts` to support Windows shell batch wrappers.
- Update `index.ts` server listening log for accurate port identification.
- Validate that `GET /api/readiness` reports `cliAvailable: true` and runtime `verified`.
- Retest `npm run check`, `npm run build`, and unit tests.

## 6. Engineering Loop
Follow strictly:
**INSPECT → PLAN → IMPLEMENT → TEST → ANALYZE → FIX → RETEST**
Repeat until all acceptance criteria pass.

## 7. Acceptance Criteria
- [ ] `check("opencode", ["--version"])` succeeds on Windows host.
- [ ] `GET /api/readiness` returns `cliAvailable: true` and detects OpenCode `1.18.31`.
- [ ] `GET /api/provider` accurately reflects OpenCode and Claude availability.
- [ ] Server console accurately reports Express port (`4311`) and Vite dev port (`4310`).
- [ ] No regression in `npm run check` or `npm run build`.

## 8. Regression Checks
- `npm run check`: Must pass with 0 errors.
- `npx tsx --test src/shared/**/*.test.ts`: Must pass all 93 tests.
- Express server boots and handles concurrent requests.

## 9. Git Workflow
### Local-Only Git Mode
- Preserve all existing files.
- Commit validated stability fixes locally with clear commit messages.
- Do not reset, clean, or force-push.
### Automatic GitHub Mode
- Enabled only if user explicitly sets up remote and credentials.

## 10. Handoff Instructions
Once Phase 01 acceptance criteria pass, update `CURRENT_STATE.md` with resolved defects and transition to Phase 02 (AI Provider Validation).

