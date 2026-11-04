import { type Pool, type PoolClient } from "pg";
import { createHash, randomBytes } from "node:crypto";
import type {
  SpendingConstitution,
  CanonicalRecipient,
  RecipientAlias,
  PurchaseIntent,
  SpendingLedgerEntry,
  GateApprovalRecord,
  GateDecisionRecord,
  GateReasonCode,
  GateDecisionOutcome,
  GateApprovalStatus,
  LedgerEntryStatus,
  CurrencyCode,
  SpendPassRecord,
  SpendPassStatus,
  RunnerExecutionRecord,
  RunnerExecutionStatus,
  MerchantInvoiceRecord,
  MerchantInvoiceStatus,
  BountyEvent,
  BountyStatus,
  ZcashShieldedRecord,
  ZcashTransactionStatus,
} from "../../shared/zbits-types.js";

const DEFAULT_OWNER = "local-owner";

export class PostgresZbitsRepository {
  constructor(private readonly pool: Pool) {}

  // ==========================================
  // 1. OWNERS & IDENTITY
  // ==========================================

  public async ensureOwner(id = DEFAULT_OWNER, name = "Local owner", email?: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO zbits_owners (id, name, email, account_status)
       VALUES ($1, $2, $3, 'ACTIVE')
       ON CONFLICT (id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [id, name, email || null]
    );
  }

  public async getOwner(id = DEFAULT_OWNER): Promise<{ id: string; name: string; email: string | null } | null> {
    const res = await this.pool.query("SELECT id, name, email FROM zbits_owners WHERE id = $1", [id]);
    if (!res.rows[0]) return null;
    return {
      id: String(res.rows[0].id),
      name: String(res.rows[0].name),
      email: res.rows[0].email ? String(res.rows[0].email) : null,
    };
  }

  // ==========================================
  // 2. SPENDING CONSTITUTION & POLICIES
  // ==========================================

  public async getSpendingConstitution(ownerId = DEFAULT_OWNER): Promise<SpendingConstitution> {
    await this.ensureOwner(ownerId);
    const res = await this.pool.query(
      "SELECT * FROM spending_constitution WHERE owner_id = $1 LIMIT 1",
      [ownerId]
    );

    if (res.rows.length === 0) {
      await this.pool.query(
        `INSERT INTO spending_constitution
         (id, owner_id, currency, max_per_order_cents, daily_limit_cents, monthly_limit_cents,
          require_approval_above_cents, allowed_categories, allowed_merchants, allowed_denominations,
          trusted_recipient_only, emergency_pause, policy_version)
         VALUES ($1, $2, 'USD', 5000, 15000, 50000, 2000,
                 '["food","streaming","digital_gift_cards","gaming","utilities","mobile"]'::jsonb,
                 '["bitrefill","steam","amazon_egift","uber_eats","doordash"]'::jsonb,
                 '[]'::jsonb, FALSE, FALSE, 1)
         ON CONFLICT (owner_id) DO NOTHING`,
        [`const_${ownerId}`, ownerId]
      );
      return this.getSpendingConstitution(ownerId);
    }

    const row = res.rows[0];
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      currency: String(row.currency || "USD") as CurrencyCode,
      maxPerOrderCents: Number(row.max_per_order_cents || 5000),
      dailyBudgetCents: Number(row.daily_limit_cents || 15000),
      monthlyBudgetCents: Number(row.monthly_limit_cents || 50000),
      requireApprovalAboveCents: Number(row.require_approval_above_cents || 2000),
      allowedCategories: Array.isArray(row.allowed_categories) ? row.allowed_categories : JSON.parse(row.allowed_categories || "[]"),
      allowedMerchants: Array.isArray(row.allowed_merchants) ? row.allowed_merchants : JSON.parse(row.allowed_merchants || "[]"),
      allowedDenominations: Array.isArray(row.allowed_denominations) ? row.allowed_denominations : JSON.parse(row.allowed_denominations || "[]"),
      trustedRecipientOnly: Boolean(row.trusted_recipient_only),
      emergencyPause: Boolean(row.emergency_pause),
      policyVersion: Number(row.policy_version || 1),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  public async updateSpendingConstitution(
    ownerId = DEFAULT_OWNER,
    patch: Partial<SpendingConstitution>
  ): Promise<SpendingConstitution> {
    const current = await this.getSpendingConstitution(ownerId);
    const updatedVersion = current.policyVersion + 1;

    const currency = patch.currency ?? current.currency;
    const maxPerOrderCents = patch.maxPerOrderCents ?? current.maxPerOrderCents;
    const dailyBudgetCents = patch.dailyBudgetCents ?? current.dailyBudgetCents;
    const monthlyBudgetCents = patch.monthlyBudgetCents ?? current.monthlyBudgetCents;
    const requireApprovalAboveCents = patch.requireApprovalAboveCents ?? current.requireApprovalAboveCents;
    const allowedCategories = JSON.stringify(patch.allowedCategories ?? current.allowedCategories);
    const allowedMerchants = JSON.stringify(patch.allowedMerchants ?? current.allowedMerchants);
    const allowedDenominations = JSON.stringify(patch.allowedDenominations ?? current.allowedDenominations);
    const trustedRecipientOnly = patch.trustedRecipientOnly ?? current.trustedRecipientOnly;
    const emergencyPause = patch.emergencyPause ?? current.emergencyPause;

    await this.pool.query(
      `UPDATE spending_constitution SET
        currency = $1,
        max_per_order_cents = $2,
        daily_limit_cents = $3,
        monthly_limit_cents = $4,
        require_approval_above_cents = $5,
        allowed_categories = $6::jsonb,
        allowed_merchants = $7::jsonb,
        allowed_denominations = $8::jsonb,
        trusted_recipient_only = $9,
        emergency_pause = $10,
        policy_version = $11,
        updated_at = CURRENT_TIMESTAMP
       WHERE owner_id = $12`,
      [
        currency,
        maxPerOrderCents,
        dailyBudgetCents,
        monthlyBudgetCents,
        requireApprovalAboveCents,
        allowedCategories,
        allowedMerchants,
        allowedDenominations,
        trustedRecipientOnly,
        emergencyPause,
        updatedVersion,
        ownerId,
      ]
    );

    return this.getSpendingConstitution(ownerId);
  }

  public async setEmergencyPause(ownerId = DEFAULT_OWNER, paused: boolean): Promise<SpendingConstitution> {
    return this.updateSpendingConstitution(ownerId, { emergencyPause: paused });
  }

  // ==========================================
  // 3. CANONICAL RECIPIENTS & ALIASES
  // ==========================================

  public normalizeAlias(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[\s\-_.]+/g, " ")
      .replace(/[^\w\s]/g, "");
  }

  public async createRecipient(
    ownerId = DEFAULT_OWNER,
    input: {
      id?: string;
      displayName: string;
      trusted?: boolean;
      recipientLimitCents?: number | null;
      aliases?: string[];
    }
  ): Promise<CanonicalRecipient> {
    await this.ensureOwner(ownerId);
    const id = input.id || `rec_${randomBytes(8).toString("hex")}`;
    const trusted = input.trusted !== undefined ? input.trusted : true;
    const recipientLimitCents = input.recipientLimitCents ?? null;

    const res = await this.pool.query(
      `INSERT INTO recipients (id, owner_id, display_name, status, trusted, recipient_limit_cents)
       VALUES ($1, $2, $3, 'ACTIVE', $4, $5)
       RETURNING *`,
      [id, ownerId, input.displayName, trusted, recipientLimitCents]
    );

    const row = res.rows[0];

    // Always register self-name alias
    await this.addRecipientAlias(ownerId, id, input.displayName, "user");

    // Register additional aliases
    if (input.aliases && input.aliases.length > 0) {
      for (const alias of input.aliases) {
        await this.addRecipientAlias(ownerId, id, alias, "user");
      }
    }

    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      displayName: String(row.display_name),
      status: String(row.status) as CanonicalRecipient["status"],
      trusted: Boolean(row.trusted),
      recipientLimitCents: row.recipient_limit_cents !== null ? Number(row.recipient_limit_cents) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  public async getRecipient(id: string, ownerId?: string): Promise<CanonicalRecipient | null> {
    const query = ownerId
      ? "SELECT * FROM recipients WHERE id = $1 AND owner_id = $2"
      : "SELECT * FROM recipients WHERE id = $1";
    const params = ownerId ? [id, ownerId] : [id];
    const res = await this.pool.query(query, params);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      displayName: String(row.display_name),
      status: String(row.status) as CanonicalRecipient["status"],
      trusted: Boolean(row.trusted),
      recipientLimitCents: row.recipient_limit_cents !== null ? Number(row.recipient_limit_cents) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  public async listRecipients(ownerId = DEFAULT_OWNER): Promise<CanonicalRecipient[]> {
    const res = await this.pool.query(
      "SELECT * FROM recipients WHERE owner_id = $1 ORDER BY created_at ASC",
      [ownerId]
    );

    return res.rows.map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      displayName: String(row.display_name),
      status: String(row.status) as CanonicalRecipient["status"],
      trusted: Boolean(row.trusted),
      recipientLimitCents: row.recipient_limit_cents !== null ? Number(row.recipient_limit_cents) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  }

  public async addRecipientAlias(
    ownerId = DEFAULT_OWNER,
    recipientId: string,
    alias: string,
    source: "user" | "agent" | "system" = "user"
  ): Promise<RecipientAlias> {
    const normalized = this.normalizeAlias(alias);
    const id = `alias_${randomBytes(6).toString("hex")}`;

    const res = await this.pool.query(
      `INSERT INTO recipient_aliases (id, owner_id, recipient_id, alias, normalized_alias, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (owner_id, normalized_alias)
       DO UPDATE SET recipient_id = EXCLUDED.recipient_id, alias = EXCLUDED.alias
       RETURNING *`,
      [id, ownerId, recipientId, alias.trim(), normalized, source]
    );

    const row = res.rows[0];
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      recipientId: String(row.recipient_id),
      alias: String(row.alias),
      normalizedAlias: String(row.normalized_alias),
      source: String(row.source) as RecipientAlias["source"],
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  public async resolveRecipientAlias(ownerId = DEFAULT_OWNER, rawRecipient: string): Promise<CanonicalRecipient | null> {
    const normalized = this.normalizeAlias(rawRecipient);

    // Direct recipient ID check
    if (rawRecipient.startsWith("rec_")) {
      const direct = await this.getRecipient(rawRecipient, ownerId);
      if (direct) return direct;
    }

    // Alias query
    const aliasRes = await this.pool.query(
      `SELECT r.* FROM recipient_aliases a
       JOIN recipients r ON a.recipient_id = r.id
       WHERE a.owner_id = $1 AND a.normalized_alias = $2`,
      [ownerId, normalized]
    );

    if (aliasRes.rows.length === 1) {
      const row = aliasRes.rows[0];
      return {
        id: String(row.id),
        ownerId: String(row.owner_id),
        displayName: String(row.display_name),
        status: String(row.status) as CanonicalRecipient["status"],
        trusted: Boolean(row.trusted),
        recipientLimitCents: row.recipient_limit_cents !== null ? Number(row.recipient_limit_cents) : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    } else if (aliasRes.rows.length > 1) {
      // Ambiguous alias maps to multiple recipients - fail closed
      return null;
    }

    // Direct display name fallback
    const nameRes = await this.pool.query(
      `SELECT * FROM recipients WHERE owner_id = $1 AND LOWER(display_name) = $2`,
      [ownerId, rawRecipient.trim().toLowerCase()]
    );

    if (nameRes.rows.length === 1) {
      const row = nameRes.rows[0];
      return {
        id: String(row.id),
        ownerId: String(row.owner_id),
        displayName: String(row.display_name),
        status: String(row.status) as CanonicalRecipient["status"],
        trusted: Boolean(row.trusted),
        recipientLimitCents: row.recipient_limit_cents !== null ? Number(row.recipient_limit_cents) : null,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    }

    return null;
  }

  // ==========================================
  // 4. PURCHASE INTENTS
  // ==========================================

  public async savePurchaseIntent(intent: PurchaseIntent, ownerId = DEFAULT_OWNER): Promise<void> {
    await this.ensureOwner(ownerId);
    const digest =
      intent.intentDigest ||
      createHash("sha256")
        .update(String(intent.idempotencyKey || intent.intentId))
        .digest("hex");

    await this.pool.query(
      `INSERT INTO purchase_intents
       (id, owner_id, agent_id, recipient_id, raw_recipient, merchant, product_id, category,
        denomination_cents, currency, estimated_total_cents, idempotency_key, intent_digest, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (owner_id, idempotency_key)
       DO UPDATE SET
         recipient_id = EXCLUDED.recipient_id,
         status = EXCLUDED.status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        intent.intentId,
        ownerId,
        intent.botId,
        intent.recipientId || null,
        intent.recipient,
        intent.merchant,
        intent.productId || null,
        intent.category || null,
        intent.denominationCents || intent.amountCents,
        intent.currency || "USD",
        intent.amountCents,
        intent.idempotencyKey,
        digest,
        intent.status || "PENDING",
      ]
    );
  }

  public async getPurchaseIntent(intentId: string): Promise<PurchaseIntent | null> {
    const res = await this.pool.query("SELECT * FROM purchase_intents WHERE id = $1", [intentId]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      intentId: String(row.id),
      idempotencyKey: String(row.idempotency_key),
      botId: String(row.agent_id),
      recipientId: row.recipient_id ? String(row.recipient_id) : undefined,
      recipient: String(row.raw_recipient),
      merchant: String(row.merchant),
      productId: row.product_id ? String(row.product_id) : undefined,
      category: row.category ? String(row.category) : undefined,
      denominationCents: Number(row.denomination_cents || row.estimated_total_cents),
      amountCents: Number(row.estimated_total_cents),
      currency: String(row.currency || "USD") as CurrencyCode,
      itemDescription: row.category ? `${row.merchant} ${row.category}` : String(row.merchant),
      createdAt: new Date(row.created_at).toISOString(),
      intentDigest: String(row.intent_digest),
      status: String(row.status) as PurchaseIntent["status"],
    };
  }

  public async getPurchaseIntentByIdempotencyKey(ownerId = DEFAULT_OWNER, key: string): Promise<PurchaseIntent | null> {
    const res = await this.pool.query(
      "SELECT * FROM purchase_intents WHERE owner_id = $1 AND idempotency_key = $2",
      [ownerId, key]
    );
    if (!res.rows[0]) return null;
    return this.getPurchaseIntent(String(res.rows[0].id));
  }

  public async updatePurchaseIntentStatus(intentId: string, status: PurchaseIntent["status"]): Promise<void> {
    await this.pool.query(
      "UPDATE purchase_intents SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status || "PENDING", intentId]
    );
  }

  // ==========================================
  // 5. BUDGET RESERVATIONS & SPENDING LEDGER
  // ==========================================

  public async calculateSpend(
    ownerId = DEFAULT_OWNER,
    recipientId?: string
  ): Promise<{ dailySpentCents: number; monthlySpentCents: number; recipientSpentCents: number }> {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();

    const res = await this.pool.query(
      `SELECT
        COALESCE(SUM(CASE WHEN created_at >= $3 THEN amount_cents ELSE 0 END), 0) AS daily_spent,
        COALESCE(SUM(CASE WHEN created_at >= $4 THEN amount_cents ELSE 0 END), 0) AS monthly_spent,
        COALESCE(SUM(CASE WHEN recipient_id = $2 THEN amount_cents ELSE 0 END), 0) AS recipient_spent
       FROM spending_ledger
       WHERE owner_id = $1
         AND (status = 'SETTLED' OR (status = 'RESERVED' AND expires_at > now()))`,
      [ownerId, recipientId || "", todayStart, monthStart]
    );

    const row = res.rows[0];
    return {
      dailySpentCents: Number(row?.daily_spent || 0),
      monthlySpentCents: Number(row?.monthly_spent || 0),
      recipientSpentCents: Number(row?.recipient_spent || 0),
    };
  }

  /**
   * Atomically reserves budget in PostgreSQL with row-level locking.
   */
  public async reserveBudget(input: {
    ownerId?: string;
    recipientId: string;
    purchaseIntentId: string;
    agentId: string;
    amountCents: number;
    currency?: CurrencyCode;
    ttlMinutes?: number;
  }): Promise<SpendingLedgerEntry> {
    const ownerId = input.ownerId || DEFAULT_OWNER;
    const id = `res_${randomBytes(8).toString("hex")}`;
    const ttlMinutes = input.ttlMinutes || 15;
    const currency = input.currency || "USD";
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Verify constitution and lock owner's row to prevent concurrent race condition
      const constRes = await client.query(
        "SELECT * FROM spending_constitution WHERE owner_id = $1 FOR UPDATE",
        [ownerId]
      );

      if (constRes.rows.length === 0) {
        throw new Error(`Spending constitution not configured for owner "${ownerId}".`);
      }

      const constitution = constRes.rows[0];
      if (constitution.emergency_pause) {
        throw new Error("Emergency pause is active: budget reservation blocked.");
      }

      // Check cumulative limits inside transaction
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();

      const spendRes = await client.query(
        `SELECT
          COALESCE(SUM(CASE WHEN created_at >= $3 THEN amount_cents ELSE 0 END), 0) AS daily_spent,
          COALESCE(SUM(CASE WHEN created_at >= $4 THEN amount_cents ELSE 0 END), 0) AS monthly_spent,
          COALESCE(SUM(CASE WHEN recipient_id = $2 THEN amount_cents ELSE 0 END), 0) AS recipient_spent
         FROM spending_ledger
         WHERE owner_id = $1
           AND (status = 'SETTLED' OR (status = 'RESERVED' AND expires_at > now()))`,
        [ownerId, input.recipientId, todayStart, monthStart]
      );

      const dailySpent = Number(spendRes.rows[0]?.daily_spent || 0);
      const monthlySpent = Number(spendRes.rows[0]?.monthly_spent || 0);

      if (dailySpent + input.amountCents > Number(constitution.daily_limit_cents)) {
        throw new Error("Budget reservation rejected: would exceed daily spending limit.");
      }
      if (monthlySpent + input.amountCents > Number(constitution.monthly_limit_cents)) {
        throw new Error("Budget reservation rejected: would exceed monthly spending limit.");
      }

      // Insert ledger entry
      const insertRes = await client.query(
        `INSERT INTO spending_ledger
         (id, owner_id, recipient_id, purchase_intent_id, agent_id, amount_cents, currency, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'RESERVED', $8)
         RETURNING *`,
        [id, ownerId, input.recipientId, input.purchaseIntentId, input.agentId, input.amountCents, currency, expiresAt]
      );

      await client.query(
        "UPDATE purchase_intents SET status = 'AUTHORIZED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [input.purchaseIntentId]
      );

      await client.query("COMMIT");

      const row = insertRes.rows[0];
      return {
        id: String(row.id),
        ownerId: String(row.owner_id),
        recipientId: String(row.recipient_id),
        purchaseIntentId: String(row.purchase_intent_id),
        agentId: String(row.agent_id),
        amountCents: Number(row.amount_cents),
        currency: String(row.currency || "USD") as CurrencyCode,
        status: "RESERVED",
        createdAt: new Date(row.created_at).toISOString(),
        settledAt: null,
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async settleBudget(intentId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `UPDATE spending_ledger
         SET status = 'SETTLED', settled_at = CURRENT_TIMESTAMP
         WHERE purchase_intent_id = $1 AND status = 'RESERVED'`,
        [intentId]
      );

      await client.query(
        "UPDATE purchase_intents SET status = 'SETTLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [intentId]
      );

      await client.query("COMMIT");
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async releaseBudget(intentId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const res = await client.query(
        `UPDATE spending_ledger
         SET status = 'RELEASED'
         WHERE purchase_intent_id = $1 AND status = 'RESERVED'`,
        [intentId]
      );

      await client.query(
        "UPDATE purchase_intents SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [intentId]
      );

      await client.query("COMMIT");
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async listSpendingLedger(ownerId = DEFAULT_OWNER, limit = 50): Promise<SpendingLedgerEntry[]> {
    const res = await this.pool.query(
      `SELECT * FROM spending_ledger
       WHERE owner_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [ownerId, limit]
    );

    return res.rows.map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      recipientId: String(row.recipient_id),
      purchaseIntentId: String(row.purchase_intent_id),
      agentId: String(row.agent_id),
      amountCents: Number(row.amount_cents),
      currency: String(row.currency || "USD") as CurrencyCode,
      status: String(row.status) as LedgerEntryStatus,
      createdAt: new Date(row.created_at).toISOString(),
      settledAt: row.settled_at ? new Date(row.settled_at).toISOString() : null,
      expiresAt: new Date(row.expires_at).toISOString(),
    }));
  }

  // ==========================================
  // 6. GATE APPROVALS & DECISIONS
  // ==========================================

  public async createGateApproval(
    ownerId = DEFAULT_OWNER,
    purchaseIntentId: string,
    reason: string,
    reasonCodes: GateReasonCode[]
  ): Promise<GateApprovalRecord> {
    const id = `appr_${randomBytes(8).toString("hex")}`;
    const res = await this.pool.query(
      `INSERT INTO gate_approvals (id, owner_id, purchase_intent_id, reason, reason_codes, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, 'PENDING')
       RETURNING *`,
      [id, ownerId, purchaseIntentId, reason, JSON.stringify(reasonCodes)]
    );

    const row = res.rows[0];
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      purchaseIntentId: String(row.purchase_intent_id),
      reason: String(row.reason),
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : JSON.parse(row.reason_codes || "[]"),
      status: "PENDING",
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: null,
      resolvedBy: null,
    };
  }

  public async getGateApproval(id: string): Promise<GateApprovalRecord | null> {
    const res = await this.pool.query("SELECT * FROM gate_approvals WHERE id = $1", [id]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      id: String(row.id),
      ownerId: String(row.owner_id),
      purchaseIntentId: String(row.purchase_intent_id),
      reason: String(row.reason),
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : JSON.parse(row.reason_codes || "[]"),
      status: String(row.status) as GateApprovalStatus,
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    };
  }

  public async listGateApprovals(ownerId = DEFAULT_OWNER, status?: GateApprovalStatus): Promise<GateApprovalRecord[]> {
    const query = status
      ? "SELECT * FROM gate_approvals WHERE owner_id = $1 AND status = $2 ORDER BY created_at DESC"
      : "SELECT * FROM gate_approvals WHERE owner_id = $1 ORDER BY created_at DESC";
    const params = status ? [ownerId, status] : [ownerId];
    const res = await this.pool.query(query, params);

    return res.rows.map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      purchaseIntentId: String(row.purchase_intent_id),
      reason: String(row.reason),
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : JSON.parse(row.reason_codes || "[]"),
      status: String(row.status) as GateApprovalStatus,
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    }));
  }

  public async resolveGateApproval(
    id: string,
    decision: "APPROVED" | "REJECTED",
    resolvedBy = "owner"
  ): Promise<GateApprovalRecord | null> {
    const existing = await this.getGateApproval(id);
    if (!existing || existing.status !== "PENDING") return null;

    const res = await this.pool.query(
      `UPDATE gate_approvals
       SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
       WHERE id = $3
       RETURNING *`,
      [decision, resolvedBy, id]
    );

    const row = res.rows[0];
    return {
      ...existing,
      status: decision,
      resolvedAt: new Date(row.resolved_at).toISOString(),
      resolvedBy,
    };
  }

  public async recordGateDecision(record: Omit<GateDecisionRecord, "id" | "createdAt">): Promise<GateDecisionRecord> {
    const id = `dec_${randomBytes(8).toString("hex")}`;
    const res = await this.pool.query(
      `INSERT INTO gate_decisions
       (id, owner_id, purchase_intent_id, decision, reason_codes, policy_version,
        remaining_daily_budget_cents, remaining_monthly_budget_cents, remaining_recipient_budget_cents)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        record.ownerId,
        record.purchaseIntentId,
        record.decision,
        JSON.stringify(record.reasonCodes),
        record.policyVersion,
        record.remainingDailyBudgetCents,
        record.remainingMonthlyBudgetCents,
        record.remainingRecipientBudgetCents ?? null,
      ]
    );

    const row = res.rows[0];
    return {
      id: String(row.id),
      ...record,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  // ==========================================
  // 7. SPENDPASS TOKENS (REPLAY PROTECTION)
  // ==========================================

  public async createSpendPassToken(input: {
    id: string;
    jti: string;
    ownerId: string;
    purchaseIntentId: string;
    authorizationId: string;
    reservationId: string;
    recipientId: string;
    agentId: string;
    merchantId: string;
    productId?: string | null;
    denomination: number;
    currency: string;
    maxAmount: number;
    policyVersion: number;
    keyId: string;
    status: SpendPassStatus;
    token: string;
    issuedAt: string;
    expiresAt: string;
  }): Promise<SpendPassRecord> {
    const res = await this.pool.query(
      `INSERT INTO spendpass_tokens
       (id, jti, owner_id, purchase_intent_id, authorization_id, reservation_id, recipient_id,
        agent_id, merchant_id, product_id, denomination, currency, max_amount, policy_version,
        key_id, status, token, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        input.id,
        input.jti,
        input.ownerId,
        input.purchaseIntentId,
        input.authorizationId,
        input.reservationId,
        input.recipientId,
        input.agentId,
        input.merchantId,
        input.productId || null,
        input.denomination,
        input.currency,
        input.maxAmount,
        input.policyVersion,
        input.keyId,
        input.status,
        input.token,
        input.issuedAt,
        input.expiresAt,
      ]
    );

    return this.mapSpendPassRow(res.rows[0]);
  }

  public async getSpendPassToken(id: string): Promise<SpendPassRecord | null> {
    const res = await this.pool.query("SELECT * FROM spendpass_tokens WHERE id = $1", [id]);
    if (!res.rows[0]) return null;
    return this.mapSpendPassRow(res.rows[0]);
  }

  public async getSpendPassTokenByJti(jti: string): Promise<SpendPassRecord | null> {
    const res = await this.pool.query("SELECT * FROM spendpass_tokens WHERE jti = $1", [jti]);
    if (!res.rows[0]) return null;
    return this.mapSpendPassRow(res.rows[0]);
  }

  /**
   * Atomically claims a SpendPass token for execution, preventing race conditions.
   */
  public async claimSpendPassForExecution(id: string, executionId: string): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      // Lock SpendPass row
      const tokenRes = await client.query(
        "SELECT * FROM spendpass_tokens WHERE id = $1 FOR UPDATE",
        [id]
      );

      if (tokenRes.rows.length === 0) {
        await client.query("ROLLBACK");
        return false;
      }

      const row = tokenRes.rows[0];

      // Must be currently ISSUED
      if (row.status !== "ISSUED") {
        await client.query("ROLLBACK");
        return false;
      }

      // Check expiration
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query(
          "UPDATE spendpass_tokens SET status = 'EXPIRED', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [id]
        );
        await client.query("COMMIT");
        return false;
      }

      // Check emergency pause
      const constRes = await client.query(
        "SELECT emergency_pause FROM spending_constitution WHERE owner_id = $1",
        [row.owner_id]
      );
      if (constRes.rows[0]?.emergency_pause) {
        await client.query(
          `UPDATE spendpass_tokens
           SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP,
               revocation_reason = 'emergency_pause', updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [id]
        );
        await client.query("COMMIT");
        return false;
      }

      // Atomically mark CLAIMED
      await client.query(
        `UPDATE spendpass_tokens
         SET status = 'CLAIMED', execution_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [executionId, id]
      );

      await client.query("COMMIT");
      return true;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  public async completeSpendPassExecution(id: string, executionId: string): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE spendpass_tokens
       SET status = 'CONSUMED', consumed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND (status = 'CLAIMED' OR status = 'ISSUED')`,
      [id]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async revokeSpendPass(id: string, reason = "owner_revocation"): Promise<boolean> {
    const res = await this.pool.query(
      `UPDATE spendpass_tokens
       SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP, revocation_reason = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status != 'CONSUMED'`,
      [reason, id]
    );
    return (res.rowCount ?? 0) > 0;
  }

  public async listSpendPassTokens(
    ownerId = DEFAULT_OWNER,
    filter?: { status?: SpendPassStatus; limit?: number }
  ): Promise<SpendPassRecord[]> {
    let query = "SELECT * FROM spendpass_tokens WHERE owner_id = $1";
    const params: (string | number)[] = [ownerId];

    if (filter?.status) {
      params.push(filter.status);
      query += ` AND status = $${params.length}`;
    }

    query += " ORDER BY issued_at DESC";
    params.push(filter?.limit || 50);
    query += ` LIMIT $${params.length}`;

    const res = await this.pool.query(query, params);
    return res.rows.map(this.mapSpendPassRow);
  }

  // ==========================================
  // 8. RUNNER EXECUTIONS & INVOICES
  // ==========================================

  public async recordRunnerExecution(record: RunnerExecutionRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO runner_executions
       (id, spendpass_id, purchase_intent_id, owner_id, merchant, status, actual_amount_cents,
        currency, invoice_id, merchant_invoice_id, error, reason_codes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         merchant_invoice_id = EXCLUDED.merchant_invoice_id,
         error = EXCLUDED.error,
         updated_at = CURRENT_TIMESTAMP`,
      [
        record.id,
        record.spendpassId,
        record.purchaseIntentId,
        record.ownerId,
        record.merchant,
        record.status,
        record.actualAmountCents,
        record.currency,
        record.invoiceId || null,
        record.merchantInvoiceId || null,
        record.error || null,
        JSON.stringify(record.reasonCodes),
      ]
    );
  }

  public async getRunnerExecution(id: string): Promise<RunnerExecutionRecord | null> {
    const res = await this.pool.query("SELECT * FROM runner_executions WHERE id = $1", [id]);
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      id: String(row.id),
      spendpassId: String(row.spendpass_id),
      purchaseIntentId: String(row.purchase_intent_id),
      ownerId: String(row.owner_id),
      merchant: String(row.merchant),
      status: String(row.status) as RunnerExecutionStatus,
      actualAmountCents: Number(row.actual_amount_cents),
      currency: String(row.currency || "USD") as CurrencyCode,
      invoiceId: row.invoice_id ? String(row.invoice_id) : undefined,
      merchantInvoiceId: row.merchant_invoice_id ? String(row.merchant_invoice_id) : undefined,
      error: row.error ? String(row.error) : undefined,
      reasonCodes: Array.isArray(row.reason_codes) ? row.reason_codes : JSON.parse(row.reason_codes || "[]"),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  public async recordRunnerInvoice(invoice: MerchantInvoiceRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO runner_invoices
       (id, execution_id, purchase_intent_id, spendpass_id, owner_id, merchant, merchant_invoice_id,
        merchant_order_id, product_id, denomination, currency, actual_amount_cents, status,
        merchant_status, delivery_ref, delivered_at, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
       ON CONFLICT (merchant_invoice_id) DO UPDATE SET
         status = EXCLUDED.status,
         merchant_status = EXCLUDED.merchant_status,
         delivery_ref = EXCLUDED.delivery_ref,
         delivered_at = EXCLUDED.delivered_at,
         updated_at = CURRENT_TIMESTAMP`,
      [
        invoice.id,
        invoice.executionId,
        invoice.purchaseIntentId,
        invoice.spendpassId,
        invoice.ownerId,
        invoice.merchant,
        invoice.merchantInvoiceId,
        invoice.merchantOrderId || null,
        invoice.productId,
        invoice.denomination,
        invoice.currency,
        invoice.actualAmountCents,
        invoice.status,
        invoice.merchantStatus,
        invoice.deliveryRef || null,
        invoice.deliveredAt ? new Date(invoice.deliveredAt) : null,
        invoice.errorMessage || null,
      ]
    );
  }

  public async getRunnerInvoice(merchantInvoiceId: string): Promise<MerchantInvoiceRecord | null> {
    const res = await this.pool.query(
      "SELECT * FROM runner_invoices WHERE merchant_invoice_id = $1",
      [merchantInvoiceId]
    );
    if (!res.rows[0]) return null;

    const row = res.rows[0];
    return {
      id: String(row.id),
      executionId: String(row.execution_id),
      purchaseIntentId: String(row.purchase_intent_id),
      spendpassId: String(row.spendpass_id),
      ownerId: String(row.owner_id),
      merchant: String(row.merchant),
      merchantInvoiceId: String(row.merchant_invoice_id),
      merchantOrderId: row.merchant_order_id ? String(row.merchant_order_id) : undefined,
      productId: String(row.product_id),
      denomination: Number(row.denomination),
      currency: String(row.currency || "USD") as CurrencyCode,
      actualAmountCents: Number(row.actual_amount_cents),
      status: String(row.status) as MerchantInvoiceStatus,
      merchantStatus: String(row.merchant_status),
      deliveryRef: row.delivery_ref ? String(row.delivery_ref) : undefined,
      deliveredAt: row.delivered_at ? new Date(row.delivered_at).toISOString() : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  // ==========================================
  // 9. APPEND-ONLY AUDIT LOGS
  // ==========================================

  public async recordAudit(
    ownerId = DEFAULT_OWNER,
    eventType: string,
    category: "info" | "warning" | "security_alert",
    actor: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const id = `aud_${randomBytes(8).toString("hex")}`;
    await this.pool.query(
      `INSERT INTO audit_logs (id, owner_id, event_type, category, actor, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [id, ownerId, eventType, category, actor, JSON.stringify(payload)]
    );
  }

  public async listAuditLogs(
    ownerId = DEFAULT_OWNER,
    limit = 100
  ): Promise<Array<{
    id: string;
    ownerId: string;
    eventType: string;
    category: string;
    actor: string;
    payload: Record<string, unknown>;
    createdAt: string;
  }>> {
    const res = await this.pool.query(
      "SELECT * FROM audit_logs WHERE owner_id = $1 ORDER BY created_at DESC LIMIT $2",
      [ownerId, limit]
    );

    return res.rows.map((row) => ({
      id: String(row.id),
      ownerId: String(row.owner_id),
      eventType: String(row.event_type),
      category: String(row.category),
      actor: String(row.actor),
      payload: typeof row.payload === "object" ? row.payload : JSON.parse(row.payload || "{}"),
      createdAt: new Date(row.created_at).toISOString(),
    }));
  }

  // ==========================================
  // 10. ZCASH PRIVACY TRANSACTIONS
  // ==========================================

  public async createZcashTransaction(record: {
    id: string;
    ownerId: string;
    network?: string;
    txid: string;
    fromAddress?: string | null;
    toAddress: string;
    amountZat: number;
    memoRef: string;
    blockHeight?: number | null;
    confirmations?: number;
    status?: ZcashTransactionStatus;
    explorerUrl: string;
    errorMessage?: string | null;
  }): Promise<ZcashShieldedRecord> {
    const res = await this.pool.query(
      `INSERT INTO zcash_transactions
       (id, owner_id, network, txid, from_address, to_address, amount_zat, memo_ref,
        block_height, confirmations, status, explorer_url, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (txid) DO UPDATE SET
         confirmations = EXCLUDED.confirmations,
         block_height = EXCLUDED.block_height,
         status = EXCLUDED.status,
         verified_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        record.id,
        record.ownerId,
        record.network || "testnet",
        record.txid.toLowerCase().trim(),
        record.fromAddress || null,
        record.toAddress,
        record.amountZat,
        record.memoRef,
        record.blockHeight || null,
        record.confirmations || 0,
        record.status || "SUBMITTED",
        record.explorerUrl,
        record.errorMessage || null,
      ]
    );

    return this.mapZcashRow(res.rows[0]);
  }

  public async getZcashTransaction(txid: string): Promise<ZcashShieldedRecord | null> {
    const res = await this.pool.query(
      "SELECT * FROM zcash_transactions WHERE txid = $1",
      [txid.toLowerCase().trim()]
    );
    if (!res.rows[0]) return null;
    return this.mapZcashRow(res.rows[0]);
  }

  public async listZcashTransactions(ownerId = DEFAULT_OWNER, limit = 50): Promise<ZcashShieldedRecord[]> {
    const res = await this.pool.query(
      "SELECT * FROM zcash_transactions WHERE owner_id = $1 ORDER BY submitted_at DESC LIMIT $2",
      [ownerId, limit]
    );
    return res.rows.map(this.mapZcashRow);
  }

  // ==========================================
  // HELPER MAPPERS
  // ==========================================

  private mapSpendPassRow(row: any): SpendPassRecord {
    return {
      id: String(row.id),
      jti: String(row.jti),
      ownerId: String(row.owner_id),
      purchaseIntentId: String(row.purchase_intent_id),
      authorizationId: String(row.authorization_id),
      reservationId: String(row.reservation_id),
      recipientId: String(row.recipient_id),
      agentId: String(row.agent_id),
      merchantId: String(row.merchant_id),
      productId: row.product_id ? String(row.product_id) : undefined,
      denomination: Number(row.denomination),
      currency: String(row.currency || "USD") as CurrencyCode,
      maxAmount: Number(row.max_amount),
      policyVersion: Number(row.policy_version),
      keyId: String(row.key_id || "k1"),
      status: String(row.status) as SpendPassStatus,
      executionId: row.execution_id ? String(row.execution_id) : undefined,
      revocationReason: row.revocation_reason ? String(row.revocation_reason) : undefined,
      token: row.token ? String(row.token) : undefined,
      issuedAt: new Date(row.issued_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null,
      revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapZcashRow(row: any): ZcashShieldedRecord {
    const amountZat = Number(row.amount_zat);
    return {
      id: String(row.id),
      txid: String(row.txid),
      ownerId: String(row.owner_id),
      toAddress: String(row.to_address),
      amountZat,
      amountZec: amountZat / 100_000_000,
      memoRef: String(row.memo_ref),
      status: String(row.status) as ZcashTransactionStatus,
      blockHeight: row.block_height !== null ? Number(row.block_height) : undefined,
      confirmations: Number(row.confirmations || 0),
      network: String(row.network || "testnet") as any,
      explorerUrl: String(row.explorer_url),
      submittedAt: new Date(row.submitted_at || row.created_at || Date.now()).toISOString(),
      verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : undefined,
    };
  }
}
