/**
 * Z-Bits Gate: Deterministic Financial Policy & Authorization Engine.
 *
 * Implements strict, mathematical safety boundaries for agent commerce:
 * - Deterministic policy enforcement (NEVER delegates financial decisions to LLMs)
 * - Spending Constitution (owner-level limits: per-order, daily, monthly, recipient)
 * - Canonical Recipient Registry & Alias Normalizer/Resolver (preventing fuzzy guesses)
 * - Shared cross-agent spending ledger & atomic 2-phase reservation hold
 * - Merchant, category, and denomination restrictions
 * - Idempotency & replay protection via stable keys and SHA-256 payload digests
 * - Owner-only approval workflows for thresholds and untrusted recipients
 * - Emergency Pause kill switch
 * - Cryptographic HMAC-SHA256 signing of purchase authorizations
 */

import { createHmac, createHash, randomUUID } from "node:crypto";
import type {
  SpendingPolicy,
  SpendingConstitution,
  CanonicalRecipient,
  RecipientAlias,
  PurchaseIntent,
  SpendingLedgerEntry,
  GateApprovalRecord,
  GateDecisionRecord,
  GateEvaluationResult,
  SignedPurchaseAuthorization,
  SpendPassRecord,
  SpendPassStatus,
  SpendPassVerificationResult,
  SpendPassExecutionContext,
  AuditEvent,
  GateReasonCode,
  CurrencyCode,
} from "../../shared/zbits-types.js";
import type { OpenBotDatabase } from "../database.js";
import { SpendPassService } from "./spendpass-service.js";

export const DEFAULT_SPENDING_POLICY: SpendingPolicy = {
  enabled: true,
  maxPerTransactionCents: 5000,    // $50.00 max single purchase
  dailyBudgetCents: 15000,         // $150.00 daily limit
  monthlyBudgetCents: 50000,       // $500.00 monthly limit
  requireApprovalAboveCents: 2000, // $20.00 requires user approval
  whitelistedRecipients: ["self", "authorized_contact", "gift_registry"],
  whitelistedMerchants: ["bitrefill", "steam", "amazon_egift", "uber_eats", "doordash"],
  currency: "USD",
};

export class GateEngine {
  private db?: OpenBotDatabase;
  private spendPassService: SpendPassService;
  private policy: SpendingPolicy;
  private readonly secretKey: string;
  private readonly processedIntents = new Map<string, { timestamp: number; digest: string; result?: GateEvaluationResult }>();
  private readonly dailySpendCents = new Map<string, number>(); // in-memory fallback
  private readonly monthlySpendCents = new Map<string, number>(); // in-memory fallback
  private readonly recipientSpendCents = new Map<string, number>(); // in-memory fallback
  private readonly inMemoryRecipients = new Map<string, CanonicalRecipient>();
  private readonly inMemoryAliases = new Map<string, string>(); // normalizedAlias -> recipientId
  private readonly inMemoryApprovals = new Map<string, GateApprovalRecord>();
  private readonly inMemoryLedger: SpendingLedgerEntry[] = [];
  private readonly auditLog: AuditEvent[] = [];

  constructor(
    dbOrPolicy?: OpenBotDatabase | SpendingPolicy,
    policyOrSecret?: SpendingPolicy | string,
    secretKey?: string
  ) {
    if (dbOrPolicy && "getSpendingConstitution" in dbOrPolicy) {
      this.db = dbOrPolicy;
      const initialPolicy = typeof policyOrSecret === "object" ? policyOrSecret : DEFAULT_SPENDING_POLICY;
      this.policy = { ...initialPolicy };
      this.secretKey = secretKey || process.env.GATE_SIGNING_SECRET || "zbits-gate-deterministic-secret-key-v1";
    } else {
      const initialPolicy = (dbOrPolicy as SpendingPolicy) || DEFAULT_SPENDING_POLICY;
      this.policy = { ...initialPolicy };
      this.secretKey = (typeof policyOrSecret === "string" ? policyOrSecret : secretKey) || process.env.GATE_SIGNING_SECRET || "zbits-gate-deterministic-secret-key-v1";
    }

    this.spendPassService = new SpendPassService(this.db);

    // Initialize in-memory recipient registry fallback
    const selfRec: CanonicalRecipient = {
      id: "rec_self",
      ownerId: "local-owner",
      displayName: "Myself",
      status: "ACTIVE",
      trusted: true,
      recipientLimitCents: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.inMemoryRecipients.set("rec_self", selfRec);
    this.inMemoryAliases.set("self", "rec_self");
    this.inMemoryAliases.set("myself", "rec_self");
  }

  public setDatabase(db: OpenBotDatabase): void {
    this.db = db;
    this.spendPassService.setDatabase(db);
  }

  public getDatabase(): OpenBotDatabase | undefined {
    return this.db;
  }

  public normalizeAlias(raw: string): string {
    if (this.db) {
      return this.db.normalizeAlias(raw);
    }
    return raw.trim().toLowerCase().replace(/[\s\-_.]+/g, " ");
  }

  public getConstitution(ownerId = "local-owner"): SpendingConstitution {
    if (this.db) {
      return this.db.getSpendingConstitution(ownerId);
    }
    return {
      id: "default",
      ownerId,
      currency: this.policy.currency,
      maxPerOrderCents: this.policy.maxPerTransactionCents,
      dailyBudgetCents: this.policy.dailyBudgetCents,
      monthlyBudgetCents: this.policy.monthlyBudgetCents,
      requireApprovalAboveCents: this.policy.requireApprovalAboveCents,
      allowedCategories: ["food", "streaming", "digital_gift_cards", "gaming", "utilities", "mobile"],
      allowedMerchants: [...this.policy.whitelistedMerchants],
      allowedDenominations: [],
      trustedRecipientOnly: false,
      emergencyPause: !this.policy.enabled,
      policyVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  public updateConstitution(ownerId = "local-owner", patch: Partial<SpendingConstitution>, actor = "user"): SpendingConstitution {
    let updated: SpendingConstitution;
    if (this.db) {
      updated = this.db.updateSpendingConstitution(ownerId, patch);
      this.policy = {
        enabled: !updated.emergencyPause,
        maxPerTransactionCents: updated.maxPerOrderCents,
        dailyBudgetCents: updated.dailyBudgetCents,
        monthlyBudgetCents: updated.monthlyBudgetCents,
        requireApprovalAboveCents: updated.requireApprovalAboveCents,
        whitelistedRecipients: this.policy.whitelistedRecipients,
        whitelistedMerchants: updated.allowedMerchants,
        currency: updated.currency,
      };
    } else {
      const current = this.getConstitution(ownerId);
      updated = {
        ...current,
        ...patch,
        policyVersion: current.policyVersion + 1,
        updatedAt: new Date().toISOString(),
      };
      this.policy = {
        enabled: !updated.emergencyPause,
        maxPerTransactionCents: updated.maxPerOrderCents,
        dailyBudgetCents: updated.dailyBudgetCents,
        monthlyBudgetCents: updated.monthlyBudgetCents,
        requireApprovalAboveCents: updated.requireApprovalAboveCents,
        whitelistedRecipients: this.policy.whitelistedRecipients,
        whitelistedMerchants: updated.allowedMerchants,
        currency: updated.currency,
      };
    }
    this.recordAudit("policy_updated", "info", actor, { patch, policyVersion: updated.policyVersion });
    return updated;
  }

  public getPolicy(): SpendingPolicy {
    if (this.db) {
      const constitution = this.db.getSpendingConstitution();
      return {
        enabled: !constitution.emergencyPause,
        maxPerTransactionCents: constitution.maxPerOrderCents,
        dailyBudgetCents: constitution.dailyBudgetCents,
        monthlyBudgetCents: constitution.monthlyBudgetCents,
        requireApprovalAboveCents: constitution.requireApprovalAboveCents,
        whitelistedRecipients: this.policy.whitelistedRecipients,
        whitelistedMerchants: constitution.allowedMerchants,
        currency: constitution.currency,
      };
    }
    return { ...this.policy };
  }

  public updatePolicy(patch: Partial<SpendingPolicy>, actor = "user"): void {
    if (this.db) {
      const constitutionPatch: Partial<SpendingConstitution> = {};
      if (patch.enabled !== undefined) constitutionPatch.emergencyPause = !patch.enabled;
      if (patch.maxPerTransactionCents !== undefined) constitutionPatch.maxPerOrderCents = patch.maxPerTransactionCents;
      if (patch.dailyBudgetCents !== undefined) constitutionPatch.dailyBudgetCents = patch.dailyBudgetCents;
      if (patch.monthlyBudgetCents !== undefined) constitutionPatch.monthlyBudgetCents = patch.monthlyBudgetCents;
      if (patch.requireApprovalAboveCents !== undefined) constitutionPatch.requireApprovalAboveCents = patch.requireApprovalAboveCents;
      if (patch.whitelistedMerchants !== undefined) constitutionPatch.allowedMerchants = patch.whitelistedMerchants;
      if (patch.currency !== undefined) constitutionPatch.currency = patch.currency;

      this.updateConstitution("local-owner", constitutionPatch, actor);
    } else {
      this.policy = { ...this.policy, ...patch };
      this.recordAudit("policy_updated", "info", actor, { patch });
    }
  }

  public setEmergencyPause(paused: boolean, ownerId = "local-owner", actor = "user"): boolean {
    this.updateConstitution(ownerId, { emergencyPause: paused }, actor);
    if (paused) {
      const revokedCount = this.spendPassService.revokeAllUnclaimed(ownerId, "emergency_pause");
      this.recordAudit("policy_updated", "warning", actor, { action: "emergency_pause_active", revokedSpendPasses: revokedCount });
    }
    return paused;
  }

  public calculateDigest(intent: Omit<PurchaseIntent, "intentDigest" | "intentId">): string {
    const payload = `${intent.idempotencyKey}:${intent.botId}:${intent.merchant}:${intent.recipient}:${intent.amountCents}:${intent.currency}:${intent.itemDescription}`;
    return createHash("sha256").update(payload).digest("hex");
  }

  public resolveRecipient(ownerId = "local-owner", rawRecipient: string): CanonicalRecipient | null {
    if (this.db) {
      return this.db.resolveRecipientAlias(ownerId, rawRecipient);
    }
    const normalized = this.normalizeAlias(rawRecipient);
    const recId = this.inMemoryAliases.get(normalized) || rawRecipient;
    return this.inMemoryRecipients.get(recId) || null;
  }

  public registerRecipient(ownerId = "local-owner", input: {
    id?: string;
    displayName: string;
    trusted?: boolean;
    recipientLimitCents?: number | null;
    status?: "ACTIVE" | "PENDING" | "BLOCKED";
  }): CanonicalRecipient {
    if (this.db) {
      return this.db.createRecipient(ownerId, input);
    }
    const id = input.id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const rec: CanonicalRecipient = {
      id,
      ownerId,
      displayName: input.displayName.trim(),
      status: input.status || "ACTIVE",
      trusted: input.trusted !== undefined ? input.trusted : true,
      recipientLimitCents: input.recipientLimitCents !== undefined ? input.recipientLimitCents : null,
      createdAt: now,
      updatedAt: now,
    };
    this.inMemoryRecipients.set(id, rec);
    this.inMemoryAliases.set(this.normalizeAlias(input.displayName), id);
    return rec;
  }

  public addAlias(ownerId = "local-owner", recipientId: string, alias: string, source: "user" | "agent" | "system" = "user"): RecipientAlias {
    if (this.db) {
      return this.db.addRecipientAlias(ownerId, recipientId, alias, source);
    }
    const normalized = this.normalizeAlias(alias);
    this.inMemoryAliases.set(normalized, recipientId);
    return {
      id: `alias_${Date.now()}`,
      ownerId,
      recipientId,
      alias: alias.trim(),
      normalizedAlias: normalized,
      source,
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Evaluates a purchase intent deterministically.
   * NEVER delegates decisions to LLM reasoning.
   */
  public evaluateIntent(intent: PurchaseIntent, ownerId = "local-owner"): GateEvaluationResult {
    const constitution = this.getConstitution(ownerId);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthStr = now.toISOString().slice(0, 7);

    // 1. Basic Parameter Integrity Checks
    if (intent.amountCents <= 0) {
      return this.deny(intent, ["ORDER_LIMIT_EXCEEDED"], "Order amount must be greater than zero.", constitution.policyVersion, ownerId);
    }
    if (!intent.recipient || !intent.recipient.trim()) {
      return this.deny(intent, ["RECIPIENT_NOT_FOUND"], "Recipient is required.", constitution.policyVersion, ownerId);
    }
    if (!intent.merchant || !intent.merchant.trim()) {
      return this.deny(intent, ["MERCHANT_NOT_ALLOWED"], "Merchant is required.", constitution.policyVersion, ownerId);
    }

    // 2. Emergency Pause & Policy Disabled Check
    if (constitution.emergencyPause || !this.policy.enabled) {
      const reasonCode: GateReasonCode = constitution.emergencyPause ? "EMERGENCY_PAUSE_ACTIVE" : "POLICY_DISABLED";
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: reasonCode });
      return this.deny(
        intent,
        [reasonCode],
        constitution.emergencyPause
          ? "Z-Bits Gate Emergency Pause is active. All financial transactions are suspended."
          : "Z-Bits Gate financial policy engine is currently disabled.",
        constitution.policyVersion,
        ownerId,
        constitution.emergencyPause ? "policy_disabled" : "policy_disabled"
      );
    }

    // 3. Idempotency & Duplicate Request Protection
    if (this.db) {
      const existing = this.db.getPurchaseIntentByIdempotencyKey(ownerId, intent.idempotencyKey);
      if (existing) {
        if (existing.intentDigest === intent.intentDigest) {
          this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "duplicate_intent_detected" });
          return this.deny(
            intent,
            ["DUPLICATE_REQUEST"],
            "Duplicate purchase intent detected. Request has already been evaluated.",
            constitution.policyVersion,
            ownerId,
            "duplicate_intent_detected"
          );
        } else {
          this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "idempotency_conflict" });
          return this.deny(
            intent,
            ["IDEMPOTENCY_CONFLICT"],
            "Idempotency conflict: A different request with the same idempotency key was previously processed.",
            constitution.policyVersion,
            ownerId,
            "duplicate_intent_detected"
          );
        }
      }
    } else {
      const existing = this.processedIntents.get(intent.idempotencyKey);
      if (existing) {
        if (existing.digest === intent.intentDigest) {
          this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "duplicate_intent_detected" });
          return this.deny(
            intent,
            ["DUPLICATE_REQUEST"],
            "Duplicate purchase intent detected. Request has already been evaluated.",
            constitution.policyVersion,
            ownerId,
            "duplicate_intent_detected"
          );
        } else {
          this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "idempotency_conflict" });
          return this.deny(
            intent,
            ["IDEMPOTENCY_CONFLICT"],
            "Idempotency conflict detected.",
            constitution.policyVersion,
            ownerId,
            "duplicate_intent_detected"
          );
        }
      }
    }

    // 4. Canonical Recipient Resolution & Trust Enforcement
    let canonicalRecipient = this.resolveRecipient(ownerId, intent.recipient);
    if (!canonicalRecipient) {
      if (constitution.trustedRecipientOnly) {
        return this.deny(
          intent,
          ["RECIPIENT_UNTRUSTED", "RECIPIENT_NOT_FOUND"],
          `Recipient "${intent.recipient}" is not registered in the trusted registry, and policy requires trusted recipients only.`,
          constitution.policyVersion,
          ownerId,
          "recipient_not_whitelisted"
        );
      }
      // If not trustedRecipientOnly, auto-register recipient as PENDING
      canonicalRecipient = this.registerRecipient(ownerId, {
        displayName: intent.recipient,
        trusted: false,
        status: "PENDING",
      });
    }

    // Check recipient status
    if (canonicalRecipient.status === "BLOCKED") {
      return this.deny(
        intent,
        ["RECIPIENT_UNTRUSTED"],
        `Recipient "${canonicalRecipient.displayName}" is currently blocked by the owner.`,
        constitution.policyVersion,
        ownerId,
        "recipient_not_whitelisted"
      );
    }
    if (constitution.trustedRecipientOnly && !canonicalRecipient.trusted) {
      return this.deny(
        intent,
        ["RECIPIENT_UNTRUSTED"],
        `Recipient "${canonicalRecipient.displayName}" is untrusted. Policy requires trusted recipients only.`,
        constitution.policyVersion,
        ownerId,
        "recipient_not_whitelisted"
      );
    }

    intent.recipientId = canonicalRecipient.id;

    // 5. Merchant Restrictions
    const merchantNorm = intent.merchant.toLowerCase().trim();
    if (constitution.allowedMerchants.length > 0 && !constitution.allowedMerchants.some((m) => m.toLowerCase().trim() === merchantNorm)) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "merchant_not_whitelisted" });
      return this.deny(
        intent,
        ["MERCHANT_NOT_ALLOWED"],
        `Merchant "${intent.merchant}" is not in the approved Gate merchant list.`,
        constitution.policyVersion,
        ownerId,
        "merchant_not_whitelisted"
      );
    }

    // 6. Category Restrictions
    if (intent.category && constitution.allowedCategories.length > 0) {
      const catNorm = intent.category.toLowerCase().trim();
      if (!constitution.allowedCategories.some((c) => c.toLowerCase().trim() === catNorm)) {
        return this.deny(
          intent,
          ["CATEGORY_NOT_ALLOWED"],
          `Category "${intent.category}" is not permitted under the owner spending constitution.`,
          constitution.policyVersion,
          ownerId,
          "policy_disabled"
        );
      }
    }

    // 7. Denomination Restrictions
    if (constitution.allowedDenominations.length > 0) {
      const denCents = intent.denominationCents || intent.amountCents;
      if (!constitution.allowedDenominations.includes(denCents)) {
        return this.deny(
          intent,
          ["DENOMINATION_NOT_ALLOWED"],
          `Denomination $${(denCents / 100).toFixed(2)} is not in the allowed denominations list.`,
          constitution.policyVersion,
          ownerId,
          "exceeds_transaction_limit"
        );
      }
    }

    // 8. Single Order / Per-Transaction Limit
    if (intent.amountCents > constitution.maxPerOrderCents) {
      this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "exceeds_transaction_limit" });
      return this.deny(
        intent,
        ["ORDER_LIMIT_EXCEEDED"],
        `Amount ($${(intent.amountCents / 100).toFixed(2)}) exceeds maximum per-transaction limit ($${(constitution.maxPerOrderCents / 100).toFixed(2)}).`,
        constitution.policyVersion,
        ownerId,
        "exceeds_transaction_limit"
      );
    }

    // 9. Cumulative Budgets & Cross-Agent Shared Ledger Accounting
    let currentDailySpent = 0;
    let currentMonthlySpent = 0;
    let currentRecipientSpent = 0;

    if (this.db) {
      const spend = this.db.calculateSpend(ownerId, canonicalRecipient.id);
      currentDailySpent = spend.dailySpentCents;
      currentMonthlySpent = spend.monthlySpentCents;
      currentRecipientSpent = spend.recipientSpentCents;
    } else {
      currentDailySpent = this.dailySpendCents.get(todayStr) || 0;
      currentMonthlySpent = this.monthlySpendCents.get(thisMonthStr) || 0;
      currentRecipientSpent = this.recipientSpendCents.get(canonicalRecipient.id) || 0;
    }

    // Recipient-level cap check across all agents
    if (canonicalRecipient.recipientLimitCents !== null && canonicalRecipient.recipientLimitCents !== undefined) {
      if (currentRecipientSpent + intent.amountCents > canonicalRecipient.recipientLimitCents) {
        this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "recipient_limit_exceeded" });
        return this.deny(
          intent,
          ["RECIPIENT_LIMIT_EXCEEDED"],
          `Purchase would exceed recipient cap for "${canonicalRecipient.displayName}". Used: $${(currentRecipientSpent / 100).toFixed(2)}, Limit: $${(canonicalRecipient.recipientLimitCents / 100).toFixed(2)}.`,
          constitution.policyVersion,
          ownerId,
          "exceeds_daily_budget"
        );
      }
    }

    // Daily budget check across all agents
    if (currentDailySpent + intent.amountCents > constitution.dailyBudgetCents) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "exceeds_daily_budget" });
      return this.deny(
        intent,
        ["DAILY_LIMIT_EXCEEDED"],
        `Purchase would exceed daily budget. Used: $${(currentDailySpent / 100).toFixed(2)}, Limit: $${(constitution.dailyBudgetCents / 100).toFixed(2)}.`,
        constitution.policyVersion,
        ownerId,
        "exceeds_daily_budget"
      );
    }

    // Monthly budget check across all agents
    if (currentMonthlySpent + intent.amountCents > constitution.monthlyBudgetCents) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "exceeds_monthly_budget" });
      return this.deny(
        intent,
        ["MONTHLY_LIMIT_EXCEEDED"],
        `Purchase would exceed monthly budget. Used: $${(currentMonthlySpent / 100).toFixed(2)}, Limit: $${(constitution.monthlyBudgetCents / 100).toFixed(2)}.`,
        constitution.policyVersion,
        ownerId,
        "exceeds_monthly_budget"
      );
    }

    // 10. User Approval Threshold & Untrusted Recipient Approval Check
    const requiresUntrustedApproval = !canonicalRecipient.trusted;
    const exceedsApprovalThreshold = intent.amountCents > constitution.requireApprovalAboveCents;

    if (exceedsApprovalThreshold || requiresUntrustedApproval) {
      const reasonCodes: GateReasonCode[] = [];
      if (exceedsApprovalThreshold) reasonCodes.push("POLICY_REQUIRES_APPROVAL");
      if (requiresUntrustedApproval) reasonCodes.push("RECIPIENT_UNTRUSTED");

      const notes = exceedsApprovalThreshold
        ? `Amount ($${(intent.amountCents / 100).toFixed(2)}) exceeds auto-approval threshold ($${(constitution.requireApprovalAboveCents / 100).toFixed(2)}). Explicit owner approval required.`
        : `Recipient "${canonicalRecipient.displayName}" is not yet verified as trusted. Explicit owner approval required.`;

      let approvalId = `appr_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      if (this.db) {
        this.db.savePurchaseIntent(intent, ownerId);
        const approval = this.db.createGateApproval(ownerId, intent.intentId, notes, reasonCodes);
        approvalId = approval.id;
        this.db.recordGateDecision({
          ownerId,
          purchaseIntentId: intent.intentId,
          decision: "REQUIRE_APPROVAL",
          reasonCodes,
          policyVersion: constitution.policyVersion,
          remainingDailyBudgetCents: constitution.dailyBudgetCents - currentDailySpent,
          remainingMonthlyBudgetCents: constitution.monthlyBudgetCents - currentMonthlySpent,
          remainingRecipientBudgetCents: canonicalRecipient.recipientLimitCents ? canonicalRecipient.recipientLimitCents - currentRecipientSpent : null,
        });
      } else {
        const approval: GateApprovalRecord = {
          id: approvalId,
          ownerId,
          purchaseIntentId: intent.intentId,
          reason: notes,
          reasonCodes,
          status: "PENDING",
          createdAt: new Date().toISOString(),
          resolvedAt: null,
          resolvedBy: null,
        };
        this.inMemoryApprovals.set(approvalId, approval);
      }

      this.recordAudit("gate_evaluated", "info", intent.botId, { intent, status: "awaiting_user_approval", approvalId });

      return {
        allowed: true,
        requiresUserApproval: true,
        decision: "REQUIRE_APPROVAL",
        reason: "awaiting_user_approval",
        reasonCodes,
        policyNotes: notes,
        policyVersion: constitution.policyVersion,
        canonicalRecipient,
        approvalId,
        remainingDailyBudgetCents: constitution.dailyBudgetCents - currentDailySpent,
        remainingMonthlyBudgetCents: constitution.monthlyBudgetCents - currentMonthlySpent,
        remainingRecipientBudgetCents: canonicalRecipient.recipientLimitCents ? canonicalRecipient.recipientLimitCents - currentRecipientSpent : null,
      };
    }

    // 11. Auto-Approved under threshold: Atomic Reservation & Cryptographic Signing
    let reservation: SpendingLedgerEntry | undefined;
    if (this.db) {
      this.db.savePurchaseIntent(intent, ownerId);
      this.db.updatePurchaseIntentStatus(intent.intentId, "AUTHORIZED");
      reservation = this.db.reserveBudget({
        ownerId,
        recipientId: canonicalRecipient.id,
        purchaseIntentId: intent.intentId,
        agentId: intent.botId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        ttlMinutes: 15,
      });

      this.db.recordGateDecision({
        ownerId,
        purchaseIntentId: intent.intentId,
        decision: "ALLOW",
        reasonCodes: ["ALLOWED_UNDER_THRESHOLD"],
        policyVersion: constitution.policyVersion,
        remainingDailyBudgetCents: constitution.dailyBudgetCents - (currentDailySpent + intent.amountCents),
        remainingMonthlyBudgetCents: constitution.monthlyBudgetCents - (currentMonthlySpent + intent.amountCents),
        remainingRecipientBudgetCents: canonicalRecipient.recipientLimitCents ? canonicalRecipient.recipientLimitCents - (currentRecipientSpent + intent.amountCents) : null,
      });
    } else {
      this.recordInMemorySpend(intent, canonicalRecipient.id, todayStr, thisMonthStr);
      reservation = {
        id: `res_${randomUUID().slice(0, 8)}`,
        ownerId,
        recipientId: canonicalRecipient.id,
        purchaseIntentId: intent.intentId,
        agentId: intent.botId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        status: "RESERVED",
        createdAt: new Date().toISOString(),
        settledAt: null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };
      this.inMemoryLedger.unshift(reservation);
    }

    const signedAuthorization = this.signAuthorization(intent);
    this.recordAudit("purchase_authorized", "info", intent.botId, { intent, signedAuthorization, reservationId: reservation?.id });

    let spendpassRecord: SpendPassRecord | undefined;
    let spendpassTokenStr: string | undefined;
    try {
      const sp = this.spendPassService.issueSpendPass({
        authorizationId: signedAuthorization.authorizationId,
        purchaseIntentId: intent.intentId,
        ownerId,
      });
      spendpassRecord = sp.record;
      spendpassTokenStr = sp.token;
    } catch (spErr: any) {
      console.warn("[GateEngine] SpendPass auto-issuance notice:", spErr?.message || spErr);
    }

    const result: GateEvaluationResult = {
      allowed: true,
      requiresUserApproval: false,
      decision: "ALLOW",
      reason: "approved_under_threshold",
      reasonCodes: ["ALLOWED_UNDER_THRESHOLD"],
      policyNotes: "Purchase approved within deterministic Gate thresholds.",
      policyVersion: constitution.policyVersion,
      canonicalRecipient,
      reservation,
      signedAuthorization,
      spendpass: spendpassRecord,
      spendpassToken: spendpassTokenStr,
      remainingDailyBudgetCents: constitution.dailyBudgetCents - (currentDailySpent + intent.amountCents),
      remainingMonthlyBudgetCents: constitution.monthlyBudgetCents - (currentMonthlySpent + intent.amountCents),
      remainingRecipientBudgetCents: canonicalRecipient.recipientLimitCents ? canonicalRecipient.recipientLimitCents - (currentRecipientSpent + intent.amountCents) : null,
    };

    this.processedIntents.set(intent.idempotencyKey, {
      timestamp: Date.now(),
      digest: intent.intentDigest,
      result,
    });

    return result;
  }

  /**
   * Resolves a pending Gate approval request with owner verification.
   */
  public resolveApproval(approvalId: string, decision: "APPROVED" | "REJECTED", resolvedBy = "owner"): GateEvaluationResult {
    if (this.db) {
      const resolved = this.db.resolveGateApproval(approvalId, decision, resolvedBy);
      if (!resolved) {
        throw new Error(`Gate approval "${approvalId}" not found or already resolved.`);
      }
      const intent = this.db.getPurchaseIntent(resolved.purchaseIntentId);
      if (!intent) {
        throw new Error(`Purchase intent "${resolved.purchaseIntentId}" not found for approval.`);
      }

      if (decision === "REJECTED") {
        this.db.updatePurchaseIntentStatus(intent.intentId, "REJECTED");
        this.recordAudit("purchase_rejected", "info", resolvedBy, { approvalId, intentId: intent.intentId, reason: "rejected_by_owner" });
        return {
          allowed: false,
          requiresUserApproval: false,
          decision: "DENY",
          reason: "rejected_by_owner",
          reasonCodes: ["POLICY_REQUIRES_APPROVAL"],
          policyNotes: `Owner rejected purchase intent: ${resolved.reason}`,
        };
      }

      // Re-evaluate against fresh constitution and budgets to prevent race condition
      const constitution = this.db.getSpendingConstitution(resolved.ownerId);
      const recipient = intent.recipientId ? this.db.getRecipient(intent.recipientId) : null;
      const spend = this.db.calculateSpend(resolved.ownerId, recipient?.id);

      if (spend.dailySpentCents + intent.amountCents > constitution.dailyBudgetCents) {
        throw new Error(`Cannot approve: daily budget has been exceeded while waiting for approval.`);
      }
      if (spend.monthlySpentCents + intent.amountCents > constitution.monthlyBudgetCents) {
        throw new Error(`Cannot approve: monthly budget has been exceeded while waiting for approval.`);
      }

      this.db.updatePurchaseIntentStatus(intent.intentId, "AUTHORIZED");
      const reservation = this.db.reserveBudget({
        ownerId: resolved.ownerId,
        recipientId: recipient?.id || "rec_self",
        purchaseIntentId: intent.intentId,
        agentId: intent.botId,
        amountCents: intent.amountCents,
        currency: intent.currency,
        ttlMinutes: 15,
      });

      this.db.recordGateDecision({
        ownerId: resolved.ownerId,
        purchaseIntentId: intent.intentId,
        decision: "ALLOW",
        reasonCodes: ["ALLOWED_UNDER_THRESHOLD"],
        policyVersion: constitution.policyVersion,
        remainingDailyBudgetCents: constitution.dailyBudgetCents - (spend.dailySpentCents + intent.amountCents),
        remainingMonthlyBudgetCents: constitution.monthlyBudgetCents - (spend.monthlySpentCents + intent.amountCents),
        remainingRecipientBudgetCents: recipient?.recipientLimitCents ? recipient.recipientLimitCents - intent.amountCents : null,
      });

      const signedAuthorization = this.signAuthorization(intent);
      this.recordAudit("purchase_authorized", "info", resolvedBy, { intent, signedAuthorization, approvedBy: resolvedBy });

      let spendpassRecord: SpendPassRecord | undefined;
      let spendpassTokenStr: string | undefined;
      try {
        const sp = this.spendPassService.issueSpendPass({
          authorizationId: signedAuthorization.authorizationId,
          purchaseIntentId: intent.intentId,
          ownerId: resolved.ownerId,
        });
        spendpassRecord = sp.record;
        spendpassTokenStr = sp.token;
      } catch (spErr: any) {
        console.warn("[GateEngine] SpendPass issuance in resolveApproval notice:", spErr?.message || spErr);
      }

      return {
        allowed: true,
        requiresUserApproval: false,
        decision: "ALLOW",
        reason: "approved_by_owner",
        reasonCodes: ["ALLOWED_UNDER_THRESHOLD"],
        policyNotes: "Purchase approved by owner.",
        policyVersion: constitution.policyVersion,
        canonicalRecipient: recipient || undefined,
        reservation,
        signedAuthorization,
        spendpass: spendpassRecord,
        spendpassToken: spendpassTokenStr,
      };
    } else {
      const approval = this.inMemoryApprovals.get(approvalId);
      if (!approval || approval.status !== "PENDING") {
        throw new Error(`Gate approval "${approvalId}" not found or already resolved.`);
      }
      approval.status = decision;
      approval.resolvedAt = new Date().toISOString();
      approval.resolvedBy = resolvedBy;

      return {
        allowed: decision === "APPROVED",
        requiresUserApproval: false,
        decision: decision === "APPROVED" ? "ALLOW" : "DENY",
        reason: decision === "APPROVED" ? "approved_by_owner" : "rejected_by_owner",
        reasonCodes: decision === "APPROVED" ? ["ALLOWED_UNDER_THRESHOLD"] : ["POLICY_REQUIRES_APPROVAL"],
        policyNotes: `Owner ${decision.toLowerCase()} request.`,
      };
    }
  }

  public authorizeWithApproval(intent: PurchaseIntent, approvedBy: string): SignedPurchaseAuthorization {
    const signedAuth = this.signAuthorization(intent);
    if (!this.db) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const thisMonthStr = new Date().toISOString().slice(0, 7);
      this.recordInMemorySpend(intent, intent.recipientId || "rec_self", todayStr, thisMonthStr);
    }
    this.recordAudit("purchase_authorized", "info", approvedBy, { intent, signedAuth, approvedBy });
    return signedAuth;
  }

  public verifySignature(auth: SignedPurchaseAuthorization): boolean {
    const expected = this.createSignatureString(auth.authorizationId, auth.intentId, auth.intentDigest, auth.authorizedAmountCents, auth.currency, auth.authorizedAt, auth.expiresAt);
    const calculated = createHmac("sha256", this.secretKey).update(expected).digest("hex");
    return auth.signature === calculated && Date.parse(auth.expiresAt) > Date.now();
  }

  // ==========================================
  // SPENDPASS TOKEN DELEGATIONS
  // ==========================================

  public getSpendPassService(): SpendPassService {
    return this.spendPassService;
  }

  public issueSpendPass(input: {
    authorizationId: string;
    purchaseIntentId?: string;
    ownerId?: string;
    ttlSeconds?: number;
  }): { record: SpendPassRecord; token: string } {
    return this.spendPassService.issueSpendPass(input);
  }

  public verifySpendPass(token: string, executionContext?: SpendPassExecutionContext): SpendPassVerificationResult {
    return this.spendPassService.verifySpendPass(token, executionContext);
  }

  public claimSpendPass(spendpassId: string, executionId: string): boolean {
    return this.spendPassService.claimForExecution(spendpassId, executionId);
  }

  public completeSpendPass(spendpassId: string, executionId: string): boolean {
    return this.spendPassService.completeExecution(spendpassId, executionId);
  }

  public revokeSpendPass(spendpassId: string, reason = "owner_revocation"): boolean {
    return this.spendPassService.revokeSpendPass(spendpassId, reason);
  }

  public listSpendPassTokens(ownerId?: string, filter?: { status?: SpendPassStatus; limit?: number }): SpendPassRecord[] {
    return this.spendPassService.listSpendPasses(ownerId, filter);
  }

  public getSpendPassToken(spendpassId: string): SpendPassRecord | null {
    return this.spendPassService.getSpendPass(spendpassId);
  }

  private signAuthorization(intent: PurchaseIntent): SignedPurchaseAuthorization {
    const authorizationId = `auth_${randomUUID().replace(/-/g, "")}`;
    const authorizedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15-minute validity window

    const payload = this.createSignatureString(authorizationId, intent.intentId, intent.intentDigest, intent.amountCents, intent.currency, authorizedAt, expiresAt);
    const signature = createHmac("sha256", this.secretKey).update(payload).digest("hex");

    this.processedIntents.set(intent.idempotencyKey, { timestamp: Date.now(), digest: intent.intentDigest });

    return {
      authorizationId,
      intentId: intent.intentId,
      intentDigest: intent.intentDigest,
      authorizedAmountCents: intent.amountCents,
      currency: intent.currency,
      authorizedAt,
      expiresAt,
      signature,
    };
  }

  private createSignatureString(authId: string, intentId: string, digest: string, amount: number, currency: string, at: string, expires: string): string {
    return `${authId}:${intentId}:${digest}:${amount}:${currency}:${at}:${expires}`;
  }

  private deny(
    intent: PurchaseIntent,
    reasonCodes: GateReasonCode[],
    notes: string,
    policyVersion: number,
    ownerId: string,
    legacyReason?: string
  ): GateEvaluationResult {
    const primaryReasonCode = reasonCodes[0] || "POLICY_DISABLED";
    const mappedLegacyReason = legacyReason || this.mapReasonCodeToLegacy(primaryReasonCode);

    if (this.db) {
      try {
        this.db.savePurchaseIntent({ ...intent, status: "REJECTED" }, ownerId);
        this.db.recordGateDecision({
          ownerId,
          purchaseIntentId: intent.intentId,
          decision: "DENY",
          reasonCodes,
          policyVersion,
          remainingDailyBudgetCents: 0,
          remainingMonthlyBudgetCents: 0,
        });
      } catch {
        // Save failed safely
      }
    }

    return {
      allowed: false,
      requiresUserApproval: false,
      decision: "DENY",
      reason: mappedLegacyReason,
      reasonCodes,
      policyNotes: notes,
      policyVersion,
    };
  }

  private mapReasonCodeToLegacy(code: GateReasonCode): string {
    switch (code) {
      case "ORDER_LIMIT_EXCEEDED": return "exceeds_transaction_limit";
      case "DAILY_LIMIT_EXCEEDED": return "exceeds_daily_budget";
      case "MONTHLY_LIMIT_EXCEEDED": return "exceeds_monthly_budget";
      case "RECIPIENT_LIMIT_EXCEEDED": return "exceeds_daily_budget";
      case "MERCHANT_NOT_ALLOWED": return "merchant_not_whitelisted";
      case "RECIPIENT_UNTRUSTED":
      case "RECIPIENT_NOT_FOUND": return "recipient_not_whitelisted";
      case "DUPLICATE_REQUEST":
      case "IDEMPOTENCY_CONFLICT": return "duplicate_intent_detected";
      case "EMERGENCY_PAUSE_ACTIVE":
      case "POLICY_DISABLED": return "policy_disabled";
      default: return code.toLowerCase();
    }
  }

  private recordInMemorySpend(intent: PurchaseIntent, recipientId: string, todayStr: string, thisMonthStr: string): void {
    const currentDaily = this.dailySpendCents.get(todayStr) || 0;
    this.dailySpendCents.set(todayStr, currentDaily + intent.amountCents);

    const currentMonthly = this.monthlySpendCents.get(thisMonthStr) || 0;
    this.monthlySpendCents.set(thisMonthStr, currentMonthly + intent.amountCents);

    const currentRec = this.recipientSpendCents.get(recipientId) || 0;
    this.recipientSpendCents.set(recipientId, currentRec + intent.amountCents);
  }

  private recordAudit(kind: AuditEvent["kind"], severity: AuditEvent["severity"], actor: string, details: Record<string, unknown>): void {
    this.auditLog.unshift({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind,
      severity,
      actor,
      details,
    });
    if (this.auditLog.length > 500) {
      this.auditLog.pop();
    }
  }

  public evaluate(intent: PurchaseIntent, ownerId = "local-owner"): GateEvaluationResult {
    return this.evaluateIntent(intent, ownerId);
  }

  public getAuditLog(limit?: number): AuditEvent[] {
    if (limit && limit > 0) return this.auditLog.slice(0, limit);
    return [...this.auditLog];
  }

  public getLedger(ownerId = "local-owner", limit = 50): SpendingLedgerEntry[] {
    if (this.db) {
      return this.db.listSpendingLedger(ownerId, limit);
    }
    return this.inMemoryLedger.slice(0, limit);
  }

  public getRecipients(ownerId = "local-owner"): CanonicalRecipient[] {
    if (this.db) {
      return this.db.listRecipients(ownerId);
    }
    return Array.from(this.inMemoryRecipients.values());
  }

  public getApprovals(ownerId = "local-owner"): GateApprovalRecord[] {
    if (this.db) {
      return this.db.listGateApprovals(ownerId);
    }
    return Array.from(this.inMemoryApprovals.values());
  }
}

let defaultGate: GateEngine | null = null;
export function getGateEngine(db?: OpenBotDatabase): GateEngine {
  if (!defaultGate) {
    defaultGate = new GateEngine(db);
  } else if (db && !defaultGate.getDatabase()) {
    defaultGate.setDatabase(db);
  }
  return defaultGate;
}
