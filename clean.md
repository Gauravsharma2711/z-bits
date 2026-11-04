# Z-Bits — Repository Cleanup and Rebranding Plan

**Base repository:** https://github.com/PrisacariuRobert/sidemates  
**Observed upstream version:** `0.42.0` (repository snapshot checked 4 November 2026)  
**Goal:** Make the product experience fully Z-Bits while retaining the agent runtime and all required legal notices.

## 1. Cleanup principles

This is a controlled fork/adaptation, not a blind repository purge.

- Remove or archive only what is unnecessary for the chosen Z-Bits web MVP.
- Preserve the existing agent runtime, tools, data layer, approvals, memory, provider routes, browser/computer capabilities, safety checks and tests.
- Do not delete files based only on names. Search imports, package scripts, build steps, tests, CI workflows and runtime references first.
- Prefer disabling an unused feature in the Z-Bits product surface over deleting a large, coupled subsystem.
- Do not remove the MIT license, third-party notices, upstream copyright or required attributions.
- Do not misrepresent the source. Replace old branding in the product UI, but add `UPSTREAM.md` identifying the Sidemates source, repository URL, MIT license and the scope of Z-Bits modifications.

## 2. Current upstream structure observed

The upstream root currently includes:

```text
.github/
deploy/
desktop/
docs/
mcp/
native/apple-ai/
public/
qa/prompt-eval/
scripts/
site/
skills/
src/
tests/fixtures/
verification/
.dockerignore
.env.example
.gitignore
CHANGELOG.md
CONTRIBUTING.md
LICENSE
README.md
SECURITY.md
THIRD_PARTY_NOTICES.md
first-result.md
index.html
package.json
package-lock.json
studio.html
TypeScript/Vite configuration files
```

The source README identifies `src/studio/` as the web studio, `src/server/` as the service for conversations/teammates/tools/approvals/scheduling, and `src/shared/` as shared types/behavior. It also identifies `site/`, `desktop/`, `deploy/`, `skills/` and `mcp/` as product areas. Confirm against the exact checked-out commit before cleanup.

## 3. Keep — do not remove

| Path/file | Why it stays |
|---|---|
| `src/studio/` | Main web studio and user-facing app. Rebrand and adapt; preserve working flows. |
| `src/server/` | Backend, agent execution, conversations, tools, approvals, scheduling and service APIs. |
| `src/shared/` | Shared types and contracts used across frontend/backend. |
| `skills/` | Existing agent skills may be loaded by the runtime; retain unless individually proven unused. |
| `mcp/` | Existing MCP interface/server may be part of supported agent capabilities. Keep for MVP unless dependency analysis proves it is optional. |
| `scripts/` | Build, verification, migration, diagnostics and packaging scripts. `npm run build` currently invokes `scripts/build-apple-ai.mjs`; do not delete without safely changing and testing the build contract. |
| `tests/` and `verification/` | Regression, fixture, security and release validation. Do not delete tests to get a green build. |
| `.github/` | CI and repository automation. Update branding/workflows, do not remove blindly. |
| `package.json`, lockfile and TS/Vite config | Application and build contract. Change only with tests and lockfile updates. |
| `.gitignore`, `.dockerignore` | Prevent secrets, local data and build artifacts from being committed or copied. Update carefully for Z-Bits paths. |
| `LICENSE` | Preserve MIT license and upstream copyright. |
| `THIRD_PARTY_NOTICES.md` | Preserve bundled dependency and third-party notices. |
| `SECURITY.md` | Retain security reporting instructions; update Z-Bits contact/product wording without weakening policy. |
| `CONTRIBUTING.md` | Retain useful contribution process; adapt fork-specific setup and expectations. |

## 4. Review and potentially exclude from the hackathon build

These are candidates for disabling, moving to optional packages or excluding from the MVP interface. They are **not automatic deletion instructions**.

| Path | Recommendation | Required check before removal |
|---|---|---|
| `desktop/` | Optional if the hackathon ships only a web app. | Check `npm run desktop`, packaging scripts, imports, CI and shared code. Keep the directory if it contains shared or required runtime logic. |
| `native/apple-ai/` | Optional for a web-only MVP. | `npm run build` currently calls `scripts/build-apple-ai.mjs`; change the build contract only deliberately and test it. |
| `site/` | Keep only if deploying a public marketing site or installer site. | Identify build references and links. It may be replaced with a small Z-Bits landing page, not necessarily deleted. |
| `deploy/` | Optional for local demo; potentially needed for public/always-on host. | Review deployment target, Docker files, private-runner references and environment requirements. Keep the minimal deployment path needed by judges. |
| `qa/prompt-eval/` | Optional for hackathon runtime, useful for agent quality checks. | Check CI and scripts; preserve tests relevant to critical agent behavior. |
| `tests/fixtures/` | Keep. Remove only fixture files proven obsolete. | Search references in tests and verification scripts. |
| `docs/` historical product docs | Move unrelated upstream roadmap/audit material into an `upstream-reference/` archive or retain in source history. | Do not delete security/architecture facts that Z-Bits depends on. Replace root product docs with Z-Bits docs. |
| `first-result.md` | Review; likely sample/demo output, not necessarily runtime. | Search for references in README, scripts, tests and UI before removing. |
| `CHANGELOG.md` | Do not rewrite as if Z-Bits authored upstream history. | Keep as upstream history or archive it under `upstream-reference/`; start a separate `ZBITS_CHANGELOG.md`. |

## 5. Remove only after proof of irrelevance

Potential removable material includes:

- Old screenshots, demo videos and promotional assets that only show Sidemates branding and are not required for tests/docs.
- Unused sample conversations, seeded demo records and example profiles that are not referenced by tests or onboarding.
- Duplicate or obsolete product landing pages after the new Z-Bits page is verified.
- Optional macOS installer/distribution assets if no desktop build is being shipped.
- Historical product comparison/marketing copy that is not part of runtime or required documentation.
- Unused provider-specific demo configuration, but never a live provider adapter merely because the hackathon currently tests one provider.
- Unused optional connector definitions only after checking tool registration, runtime manifests, test references and migration dependencies.

Never remove a capability simply because it is not in the first demo. Prefer hiding or disabling it in the Z-Bits UI while keeping the source capability intact.

## 6. Full user-facing rebrand checklist

Search for all old and legacy identity strings, including:

- `Sidemates`, `sidemates`
- `OpenBot`, `openbot`
- old tagline and product descriptions
- `sidemates.app`, `openbots.foundation`
- old logo, mascot, screenshots and favicon assets
- old app titles and metadata
- old website/install links
- old UI labels, onboarding, empty states, notifications and help text
- old product names in generated docs and examples

Update Z-Bits-owned surfaces:

- Main web studio title and metadata.
- Header, sidebar, navigation and dashboard.
- Onboarding and setup wizard.
- Agent list and agent display cards.
- Provider settings and integration pages.
- Approval and activity screens.
- Loading, error and empty states.
- Favicon, manifest, icons and logos.
- Landing page and public demo, if included.
- README, setup docs and environment examples.
- User-facing notification text and generated templates.

**Do not globally replace internal identifiers without a migration plan.**

## 7. Internal identifiers and compatibility: preserve or migrate deliberately

The upstream currently uses legacy identifiers such as `OPENBOT_*` environment variables and may use `.sidemates`/OpenBot-related data names, bundle IDs and protocol identifiers. These may be consumed by scripts, services, existing user data or clients.

For each identifier:

1. Search all source, tests, scripts, workflow files, deployment manifests and docs.
2. Classify it as UI text, internal API/configuration, persisted data, protocol/bundle identity or legal attribution.
3. Replace user-facing values with Z-Bits.
4. For configuration and persisted data, create a documented migration or compatibility alias. Do not strand existing user data.
5. Keep stable internal IDs where changing them would break the agent runtime.
6. Test both fresh setup and upgrade/import paths.

Examples requiring deliberate review:

- `OPENBOT_*` environment variables.
- Data-directory names and migration paths.
- `.sidemates` or `.openbot` file extensions.
- `app.openbot.mobile` and other bundle identifiers.
- Deep links, URL schemes, service-worker caches and local storage keys.
- OAuth callback URLs and registered application IDs.
- Installer/update metadata and release workflows.
- MCP server names and tool identifiers.

Do not change external OAuth callback registration, bundle IDs, data paths or URLs unless the corresponding external registration and migration are updated.

## 8. Legal and attribution requirements

A complete product rebrand does not mean removing upstream authorship or license obligations.

Required:

- Preserve `LICENSE` and its copyright notices.
- Preserve `THIRD_PARTY_NOTICES.md` and bundled dependency licenses.
- Add `UPSTREAM.md` with source URL, MIT license, date/revision used and high-level changed areas.
- Keep required notices in About, legal or repository documentation as appropriate.
- Clearly distinguish Z-Bits modifications from upstream code.

Do not delete licensing or attribution files to make the repository appear independently written. That is not product polish; it is a licensing problem.

## 9. Cleanup workflow for Antigravity

1. Record current branch, commit, dirty files and untracked files.
2. Create a clean backup branch or checkpoint commit before destructive work.
3. Run the upstream baseline: install dependencies, start app, run verification/build and record failures.
4. Build a dependency map for each cleanup candidate: imports, package scripts, CI, tests, runtime loading, documentation links and data migration.
5. Produce `CLEANUP_AUDIT.md` with `KEEP`, `REBRAND`, `HIDE_FOR_MVP`, `ARCHIVE` and `SAFE_TO_REMOVE` decisions.
6. Rebrand user-facing content first; preserve legal notices and stable IDs.
7. Disable optional features through configuration/navigation before considering code deletion.
8. Remove only proven dead code/assets and update tests/build scripts in the same change.
9. Run `npm run verify`, `npm run build` and the critical provider/agent flows.
10. Check for leftover branding and broken references.
11. Report every deleted, archived, retained and renamed item, with reason and validation evidence.

## 10. Useful inspection commands

Run from repository root (PowerShell examples):

```powershell
# Inspect tracked repository files
 git ls-files

# Find legacy names in tracked text files; review results before editing
 git grep -n -i -E "sidemates|openbot|sidemates\.app|openbots\.foundation"

# Check package scripts and references before deleting anything
 Get-Content package.json

# Inspect all references to a candidate path/name
 git grep -n "candidate-name-or-path"

# Run the repository's defined quality gate
 npm run verify
```

Use `git grep` results as an audit list, not a blind global replacement command. Exclude generated files, vendored code and legal notices from indiscriminate rebranding.

## 11. Definition of done

- The user-facing product consistently presents as Z-Bits.
- No old Sidemates/OpenBot product branding appears in ordinary product screens, onboarding, app metadata or Z-Bits-owned marketing/docs.
- Existing Bit/agent runtime IDs and behavior remain intact.
- All retained core paths still build and work.
- Optional paths are either clearly disabled or properly tested after removal.
- Environment variables/data paths/bundle identities have safe migrations or documented compatibility.
- `LICENSE`, `THIRD_PARTY_NOTICES.md` and upstream attribution remain intact.
- No credentials, private data or generated user data are committed.
- Cleanup audit identifies exactly what was kept, hidden, archived, removed and why.
- `npm run verify` and required end-to-end smoke tests pass, or any remaining failure is explicitly documented.
