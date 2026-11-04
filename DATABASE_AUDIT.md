# Z-Bits Database & Infrastructure Audit Report

**Product:** Z-Bits (*"Your agents. Your rules. Your money."*)  
**Phase:** Database Implementation & Render PostgreSQL Setup  
**Date:** 4 November 2026  
**Auditor Roles:** Principal Backend Engineer, Database Architect, DevOps Engineer, Security Engineer  
**Status:** COMPLETE & VERIFIED

---

## 1. Executive Summary

Z-Bits is an open-source personal AI-agent platform built on the Sidemates / OpenBot runtime. The core differentiator of Z-Bits is **recipient-aware, cross-agent spending under one shared financial constitution**, enforced by **Gate** (deterministic financial authorization) and executed by **Runner** (Bitrefill and Zcash settlement).

This audit examines the existing database architecture, data access patterns, migration lifecycle, and deployment infrastructure in preparation for a production-ready PostgreSQL integration on **Render Managed PostgreSQL** (`DATABASE_URL`).

---

## 2. Technical Stack & Infrastructure Inventory

| Component | Current State in Repository | Production Target (Render) |
| :--- | :--- | :--- |
| **Backend Language & Runtime** | Node.js v22.14.0 / TypeScript v7.0.2 (`tsx` execution) | Node.js v22+ on Linux (Render Web Service) |
| **Web Server Framework** | Express v5.2.1 (`src/server/index.ts`) | Express v5.2.1 |
| **Primary Database Engine** | Node native `node:sqlite` (`DatabaseSync`) | **Render Managed PostgreSQL 16+** (`pg` connection pool) |
| **ORM / Query Layer** | Direct parameterized SQL statements (`db.prepare()`) via `OpenBotDatabase` class | Native PostgreSQL Client (`pg.Pool`) with parameterized queries & transaction safety; dual-engine abstraction |
| **Schema Migration Framework** | Embedded procedural DDL inside `OpenBotDatabase.migrate()` | Version-controlled SQL / TS migrations (`migrations/`) with migration runner & lock tracking |
| **Owner & Identity Model** | `users` table with primary key `local-owner` (`DEFAULT_OWNER`) | Multi-tenant capable `owners` / `users` with strict foreign-key isolation |
| **Secret Storage** | AES-256-GCM via `SecretVault` (`src/server/vault.ts`) storing encrypted blobs | AES-256-GCM `SecretVault` backed by environment variable `MASTER_KEY` / `VAULT_SECRET` |
| **Container & Cloud Deployment** | Minimal `Dockerfile` and `docker-compose.yml` in `deploy/private-runner/`, sample `deploy/relay/render.yaml` | Production root `render.yaml` Blueprint (Managed PostgreSQL + Web Service) + root `docker-compose.yml` |

---

## 3. Existing Database Schema & Entity Relationships

The current database logic lives in `src/server/database.ts` (6,460+ lines) within the monolithic class `OpenBotDatabase`.

### 3.1 Upstream Sidemates Core Tables (30+ tables)
These tables manage conversational agent workflows and must be preserved without disruption:
- `users`: User identity (`id`, `name`, `created_at`).
- `bots`: Agent definitions (`id`, `name`, `role`, `instructions`, `provider`, `model`).
- `threads`, `messages`, `attachments`, `message_reactions`: Conversational graph.
- `runs`, `approvals`, `approved_actions`: Agent run execution lifecycle.
- `memories`, `memory_embeddings`: Long-term agent memory.
- `taught_workflows`, `workflow_versions`: Browser automation skills.
- `routines`, `automation_events`, `automation_alerts`: Scheduled and event-driven automations.
- `code_projects`, `code_task_workspaces`, `code_task_reviews`: Workspace and code check tracking.

### 3.2 Z-Bits Financial Engine Tables (Lines 1254–1463 in `database.ts`)
The Z-Bits financial subsystem consists of 12 dedicated tables:
1. `spending_constitution`: Per-order limit, daily limit, monthly limit, approval threshold, allowed categories, allowed merchants, allowed denominations, emergency pause flag, and policy version.
2. `recipients`: Canonical recipient registry (`rec_...`), display name, trust level (`trusted`), custom spending cap (`recipient_limit_cents`), active status.
3. `recipient_aliases`: Normalized alias mapping (`alias`, `normalized_alias`, `source`) resolving to canonical `recipient_id`.
4. `purchase_intents`: Typed intents from Maya, Bolt, etc. (`owner_id`, `agent_id`, `recipient_id`, `merchant`, `product_id`, `category`, `denomination_cents`, `currency`, `idempotency_key`, `intent_digest`, `status`).
5. `spending_ledger`: Atomic 2-phase reservations and settlements (`id`, `owner_id`, `recipient_id`, `purchase_intent_id`, `agent_id`, `amount_cents`, `status`, `expires_at`, `settled_at`).
6. `gate_approvals`: Human-in-the-loop pending approval records (`reason`, `reason_codes_json`, `status`, `resolved_at`, `resolved_by`).
7. `gate_decisions`: Immutable authorization decision audit records.
8. `spendpass_tokens`: Cryptographic JWT single-use tokens (`jti`, `authorization_id`, `reservation_id`, `max_amount`, `status`, `token`, `expires_at`, `consumed_at`, `revoked_at`).
9. `runner_executions`: Purchase execution records with Bitrefill / merchant (`status`, `actual_amount_cents`, `merchant_invoice_id`, `reason_codes_json`).
10. `runner_invoices`: Detailed merchant invoice and delivery tracking (`merchant_invoice_id`, `status`, `merchant_status`, `delivery_ref` masked PIN, `delivered_at`).
11. `bounty_events`: Contributor bounty rewards intake and execution idempotency.
12. `zcash_transactions`: Zcash NU7 testnet shielded transaction proofs (`txid`, `amount_zat`, `memo_ref`, `status`, `block_height`, `confirmations`, `explorer_url`).
13. `audit_logs`: Append-only security and operational audit trail.

---

## 4. Architectural Analysis & Transition to PostgreSQL

### 4.1 Why PostgreSQL on Render?
1. **Container Ephemerality:** On Render Web Services, the container filesystem is ephemeral unless an expensive single-instance persistent disk is attached. An SQLite database in the container container root would be deleted on every redeploy, zeroing out budgets, recipient histories, and SpendPass replay state.
2. **ACID Concurrency & Row-Level Locking:** High-frequency concurrent requests from multiple autonomous agents (Maya + Bolt) require true row-level locks (`SELECT ... FOR UPDATE`) and ACID transaction isolation to guarantee that two simultaneous requests cannot double-spend a recipient's remaining budget.
3. **Managed High Availability:** Render Managed PostgreSQL provides automated point-in-time recovery, managed backups, connection pooling, and health monitoring.

### 4.2 Preservation Strategy (Dual-Engine / Seamless Adapter)
- **Zero Breakage of Existing Agent Runtime:** Upstream agent code, conversational threads, and MCP tools expect `OpenBotDatabase`.
- **Z-Bits Storage Architecture:** We will introduce a robust, production-grade PostgreSQL data access layer (`src/server/db/postgres-pool.ts` and `src/server/db/postgres-zbits-repository.ts`) with version-controlled migrations (`src/server/db/migrations/`).
- **Unified Service Integration:** When `DATABASE_URL` is configured (as provided by Render Managed PostgreSQL or local Docker PostgreSQL), the platform initializes connection pooling, verifies connectivity, executes pending migrations, and binds Gate, SpendPass, Runner, and the Z-Bits API routes to PostgreSQL.
- **Fail-Closed Principle:** If PostgreSQL is unreachable or drops mid-transaction, Gate fails closed immediately, rejecting all spending requests rather than falling back to stale or uncommitted state.

---

## 5. Required Deliverables & Implementation Plan

1. **PostgreSQL Driver & Pool Management:** Install `pg` and `@types/pg`; implement connection pool with health checks, timeout handling, and SSL support for Render.
2. **Version-Controlled Migrations:** Create idempotent SQL migration scripts (`001_initial_zbits_schema.sql`, etc.) with a migration engine that tracks applied versions in a `schema_migrations` table.
3. **PostgreSQL Data Access Layer:** Implement complete typed CRUD operations for all 10 requirement areas (Owners, Recipients, Aliases, Constitution, Purchase Intents, Shared Ledger, SpendPass, Orders, Audit Logs, Zcash).
4. **Row-Level Locking for Budget Reservations:** Implement `SELECT ... FOR UPDATE` within PostgreSQL transactions for atomic cross-agent budget reservation.
5. **Render Blueprint (`render.yaml`):** Create the blueprint defining the Managed PostgreSQL database (`zbits-postgres`) and the web service (`zbits-web`) with automatic `DATABASE_URL` binding, health checks, and build/start commands.
6. **Local Development Setup:** Create `docker-compose.yml` for local PostgreSQL, updated `.env.example`, migration commands, and reset scripts.
7. **Comprehensive Test Suite:** Implement automated tests for all 17 mandatory testing scenarios using a test database.
8. **Authoritative Documentation:** Produce `DATABASE_ARCHITECTURE.md`, `RENDER_DEPLOYMENT.md`, and `DATABASE_IMPLEMENTATION_REPORT.md`.

