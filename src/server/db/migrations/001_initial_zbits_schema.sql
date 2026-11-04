-- ==============================================================================
-- Z-BITS POSTGRESQL SCHEMA MIGRATION 001: INITIAL Z-BITS SCHEMA
-- Core entities: Owners, Spending Constitution, Recipients, Aliases,
-- Purchase Intents, Shared Spending Ledger, Gate Approvals & Decisions,
-- SpendPass Tokens, Runner Executions & Invoices, Bounty Events, Zcash Records,
-- and Append-Only Security Audit Logs.
-- ==============================================================================

-- 1. Owners & Application Identity
CREATE TABLE IF NOT EXISTS zbits_owners (
    id VARCHAR(128) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    account_status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Spending Constitution and Policies
CREATE TABLE IF NOT EXISTS spending_constitution (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    max_per_order_cents INTEGER NOT NULL DEFAULT 5000 CHECK (max_per_order_cents >= 0),
    daily_limit_cents INTEGER NOT NULL DEFAULT 15000 CHECK (daily_limit_cents >= 0),
    monthly_limit_cents INTEGER NOT NULL DEFAULT 50000 CHECK (monthly_limit_cents >= 0),
    require_approval_above_cents INTEGER NOT NULL DEFAULT 2000 CHECK (require_approval_above_cents >= 0),
    allowed_categories JSONB NOT NULL DEFAULT '["food","streaming","digital_gift_cards","gaming","utilities","mobile"]'::jsonb,
    allowed_merchants JSONB NOT NULL DEFAULT '["bitrefill","steam","amazon_egift","uber_eats","doordash"]'::jsonb,
    allowed_denominations JSONB NOT NULL DEFAULT '[]'::jsonb,
    trusted_recipient_only BOOLEAN NOT NULL DEFAULT FALSE,
    emergency_pause BOOLEAN NOT NULL DEFAULT FALSE,
    policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_constitution_owner UNIQUE (owner_id)
);

-- 3. Canonical Recipients
CREATE TABLE IF NOT EXISTS recipients (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED')),
    trusted BOOLEAN NOT NULL DEFAULT TRUE,
    recipient_limit_cents INTEGER CHECK (recipient_limit_cents IS NULL OR recipient_limit_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Recipient Aliases
CREATE TABLE IF NOT EXISTS recipient_aliases (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    recipient_id VARCHAR(128) NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    alias VARCHAR(255) NOT NULL,
    normalized_alias VARCHAR(255) NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'agent', 'system')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_owner_normalized_alias UNIQUE (owner_id, normalized_alias)
);

-- 5. Purchase Intents (Structured requests from Maya, Bolt, etc.)
CREATE TABLE IF NOT EXISTS purchase_intents (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    agent_id VARCHAR(128) NOT NULL,
    recipient_id VARCHAR(128) REFERENCES recipients(id) ON DELETE SET NULL,
    raw_recipient VARCHAR(255) NOT NULL,
    merchant VARCHAR(128) NOT NULL,
    product_id VARCHAR(128),
    category VARCHAR(128),
    denomination_cents INTEGER NOT NULL DEFAULT 0 CHECK (denomination_cents >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    estimated_total_cents INTEGER NOT NULL CHECK (estimated_total_cents >= 0),
    idempotency_key VARCHAR(255) NOT NULL,
    intent_digest VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AUTHORIZED', 'REJECTED', 'REQUIRES_APPROVAL', 'SETTLED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_owner_idempotency UNIQUE (owner_id, idempotency_key)
);

-- 6. Shared Spending Ledger & Atomic Budget Reservations
CREATE TABLE IF NOT EXISTS spending_ledger (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    recipient_id VARCHAR(128) NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    agent_id VARCHAR(128) NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    status VARCHAR(64) NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED', 'SETTLED', 'RELEASED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

-- 7. Gate Approvals (Human-in-the-loop review queue)
CREATE TABLE IF NOT EXISTS gate_approvals (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(128)
);

-- 8. Gate Decisions (Authorization Audit Log)
CREATE TABLE IF NOT EXISTS gate_decisions (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    decision VARCHAR(64) NOT NULL CHECK (decision IN ('ALLOW', 'DENY', 'REQUIRE_APPROVAL')),
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    policy_version INTEGER NOT NULL DEFAULT 1,
    remaining_daily_budget_cents INTEGER NOT NULL,
    remaining_monthly_budget_cents INTEGER NOT NULL,
    remaining_recipient_budget_cents INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. SpendPass Tokens (Signed, single-use, scoped purchase authorizations)
CREATE TABLE IF NOT EXISTS spendpass_tokens (
    id VARCHAR(128) PRIMARY KEY,
    jti VARCHAR(128) UNIQUE NOT NULL,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    authorization_id VARCHAR(128) NOT NULL,
    reservation_id VARCHAR(128) NOT NULL REFERENCES spending_ledger(id) ON DELETE CASCADE,
    recipient_id VARCHAR(128) NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    agent_id VARCHAR(128) NOT NULL,
    merchant_id VARCHAR(128) NOT NULL,
    product_id VARCHAR(128),
    denomination INTEGER NOT NULL CHECK (denomination >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    max_amount INTEGER NOT NULL CHECK (max_amount >= 0),
    policy_version INTEGER NOT NULL,
    key_id VARCHAR(64) NOT NULL DEFAULT 'k1',
    status VARCHAR(64) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'CLAIMED', 'CONSUMED', 'REVOKED', 'EXPIRED')),
    execution_id VARCHAR(128),
    revocation_reason TEXT,
    token TEXT NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_owner_authorization UNIQUE (owner_id, authorization_id)
);

-- 10. Runner Executions (Deterministic purchase runner execution records)
CREATE TABLE IF NOT EXISTS runner_executions (
    id VARCHAR(128) PRIMARY KEY,
    spendpass_id VARCHAR(128) NOT NULL REFERENCES spendpass_tokens(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    merchant VARCHAR(128) NOT NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNCERTAIN')),
    actual_amount_cents INTEGER NOT NULL CHECK (actual_amount_cents >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    invoice_id VARCHAR(128),
    merchant_invoice_id VARCHAR(128),
    error TEXT,
    reason_codes JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. Runner Invoices (Merchant fulfillment and masked delivery tracking)
CREATE TABLE IF NOT EXISTS runner_invoices (
    id VARCHAR(128) PRIMARY KEY,
    execution_id VARCHAR(128) NOT NULL REFERENCES runner_executions(id) ON DELETE CASCADE,
    purchase_intent_id VARCHAR(128) NOT NULL REFERENCES purchase_intents(id) ON DELETE CASCADE,
    spendpass_id VARCHAR(128) NOT NULL REFERENCES spendpass_tokens(id) ON DELETE CASCADE,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    merchant VARCHAR(128) NOT NULL,
    merchant_invoice_id VARCHAR(255) UNIQUE NOT NULL,
    merchant_order_id VARCHAR(255),
    product_id VARCHAR(128) NOT NULL,
    denomination INTEGER NOT NULL CHECK (denomination >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    actual_amount_cents INTEGER NOT NULL CHECK (actual_amount_cents >= 0),
    status VARCHAR(64) NOT NULL DEFAULT 'CREATED',
    merchant_status VARCHAR(64) NOT NULL,
    delivery_ref TEXT,
    delivered_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. Contributor Bounty Events (Bolt intake and rewards tracking)
CREATE TABLE IF NOT EXISTS bounty_events (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    contributor_alias VARCHAR(255) NOT NULL,
    contributor_id VARCHAR(128) REFERENCES recipients(id) ON DELETE SET NULL,
    reward_amount_cents INTEGER NOT NULL CHECK (reward_amount_cents >= 0),
    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
    reason TEXT NOT NULL,
    source VARCHAR(64) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'github_webhook', 'api')),
    source_ref VARCHAR(255),
    idempotency_key VARCHAR(255) UNIQUE NOT NULL,
    purchase_intent_id VARCHAR(128) REFERENCES purchase_intents(id) ON DELETE SET NULL,
    execution_id VARCHAR(128) REFERENCES runner_executions(id) ON DELETE SET NULL,
    status VARCHAR(64) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'EXECUTED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. Zcash Shielded Transactions (NU7 Testnet on-chain evidence)
CREATE TABLE IF NOT EXISTS zcash_transactions (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    network VARCHAR(32) NOT NULL DEFAULT 'testnet',
    txid VARCHAR(128) UNIQUE NOT NULL,
    from_address VARCHAR(255),
    to_address VARCHAR(255) NOT NULL,
    amount_zat BIGINT NOT NULL CHECK (amount_zat >= 0),
    memo_ref VARCHAR(255) NOT NULL,
    block_height INTEGER,
    confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
    status VARCHAR(64) NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('PREPARED', 'SUBMITTED', 'CONFIRMED', 'FAILED')),
    explorer_url TEXT NOT NULL,
    error_message TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at TIMESTAMPTZ
);

-- 14. Append-Only Security & Operational Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(128) PRIMARY KEY,
    owner_id VARCHAR(128) NOT NULL REFERENCES zbits_owners(id) ON DELETE CASCADE,
    event_type VARCHAR(128) NOT NULL,
    category VARCHAR(64) NOT NULL DEFAULT 'info' CHECK (category IN ('info', 'warning', 'security_alert')),
    actor VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
