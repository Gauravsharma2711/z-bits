-- ==============================================================================
-- Z-BITS POSTGRESQL SCHEMA MIGRATION 002: INDEXES AND CONSTRAINTS
-- Optimizes cross-agent query performance, recipient lookups,
-- ledger aggregations, idempotency checks, and owner isolation.
-- ==============================================================================

-- Recipient & Alias Indexes
CREATE INDEX IF NOT EXISTS idx_recipients_owner ON recipients(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipients_status ON recipients(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_aliases_owner_rec ON recipient_aliases(owner_id, recipient_id);
CREATE INDEX IF NOT EXISTS idx_aliases_lookup ON recipient_aliases(owner_id, normalized_alias);

-- Purchase Intent Indexes
CREATE INDEX IF NOT EXISTS idx_purchase_intents_owner ON purchase_intents(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_recipient ON purchase_intents(recipient_id);
CREATE INDEX IF NOT EXISTS idx_purchase_intents_status ON purchase_intents(owner_id, status);

-- Spending Ledger Indexes (Critical for fast cumulative spend calculations)
CREATE INDEX IF NOT EXISTS idx_ledger_owner_created ON spending_ledger(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_recipient_status ON spending_ledger(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_owner_recipient_status ON spending_ledger(owner_id, recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_intent ON spending_ledger(purchase_intent_id);

-- Gate Approvals & Decisions Indexes
CREATE INDEX IF NOT EXISTS idx_approvals_owner_status ON gate_approvals(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_owner ON gate_decisions(owner_id, created_at DESC);

-- SpendPass Token Indexes
CREATE INDEX IF NOT EXISTS idx_spendpass_owner ON spendpass_tokens(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_spendpass_jti ON spendpass_tokens(jti);
CREATE INDEX IF NOT EXISTS idx_spendpass_intent ON spendpass_tokens(purchase_intent_id);
CREATE INDEX IF NOT EXISTS idx_spendpass_reservation ON spendpass_tokens(reservation_id);

-- Runner Executions & Invoices Indexes
CREATE INDEX IF NOT EXISTS idx_runner_exec_owner ON runner_executions(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runner_exec_status ON runner_executions(status);
CREATE INDEX IF NOT EXISTS idx_runner_inv_owner ON runner_invoices(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runner_inv_merchant_id ON runner_invoices(merchant_invoice_id);

-- Bounty Events Indexes
CREATE INDEX IF NOT EXISTS idx_bounty_owner ON bounty_events(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_contributor ON bounty_events(contributor_id);
CREATE INDEX IF NOT EXISTS idx_bounty_idempotency ON bounty_events(idempotency_key);

-- Zcash Transactions Indexes
CREATE INDEX IF NOT EXISTS idx_zcash_tx_owner ON zcash_transactions(owner_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_zcash_tx_txid ON zcash_transactions(txid);

-- Audit Logs Indexes
CREATE INDEX IF NOT EXISTS idx_audit_owner_time ON audit_logs(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_category ON audit_logs(category, created_at DESC);

