# Z-Bits Hackathon Submission Checklist

**Target Deadline:** November 5, 2026 at 00:00 IST  
**Platform:** Stadium Hackathon Portal  

---

## Pre-Submission Verification Checklist

### 1. Codebase & Git Repository
- [x] All 73 tests passing (PostgreSQL, Gate, SpendPass, Runner, Maya/Bolt, E2E Scenarios).
- [x] Clean production build (`npm run build` succeeds in 3.81s).
- [x] Zero hardcoded secrets, API keys, or private seed phrases in git history.
- [x] `.env.example` provides complete placeholder configuration.
- [x] MIT License and upstream Sidemates attribution preserved (`LICENSE`, `UPSTREAM.md`).
- [x] Branch `submission/final-delivery` merged to `main`.
- [ ] Push `main` to public GitHub repository.

### 2. Live Commerce & Bitrefill Track
- [x] Bitrefill REST API v2 client operational with Bearer authentication.
- [x] Live catalog discovery tested against live endpoint (50 products returned).
- [x] Masking algorithm verified (`maskSensitiveCode`).
- [x] `BITREFILL_EVIDENCE.md` and `BITREFILL_INTEGRATION.md` completed.
- [x] `FEEDBACK.md` completed with specific Bitrefill API and DevEx feedback.
- [x] Documented answers for: maximum agent limits, human approval thresholds, built vs reused.

### 3. Privacy & Zcash Track
- [x] Zcash NU7 Testnet integration verified with Unified Addresses (`utest1...`).
- [x] Shielded transaction evidence documented with block height and explorer link (`5e9b8f2d...`).
- [x] Zero-PII memo specification enforced (`zbits:ord_<hex>`).
- [x] Non-custodial user-signing workflow documented.
- [x] `PRIVACY_AND_TRUST.md` answers all 4 mandatory questions in full technical depth.
- [x] `30_DAY_ROADMAP.md` outlines concrete 4-week production plan.

### 4. Render Production Deployment
- [x] `render.yaml` Blueprint specifies `zbits-postgres` (PostgreSQL 16) and `z-bits` web service.
- [x] Readiness (`/api/readyz`) and liveness (`/api/healthz`) probes operational.
- [x] Database telemetry endpoint (`/api/db/status`) operational.
- [x] `RENDER_DEPLOYMENT.md` and `RENDER_DEPLOYMENT_REPORT.md` completed.
- [ ] Deploy Blueprint on Render Dashboard and verify public URL.

### 5. Media & Stadium Materials
- [x] `DEMO_SCRIPT.md` specifies second-by-second script for 2:45 video.
- [x] `SUBMISSION_CONTENT.md` provides all copy-paste fields for Stadium.
- [ ] Record 2:45 video following `DEMO_SCRIPT.md` and upload to YouTube/Loom.
- [ ] Paste repository URL, Render URL, and video link into Stadium portal.
- [ ] Click Submit before 00:00 IST!
