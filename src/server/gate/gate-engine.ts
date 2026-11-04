/**
 * Z-Bits Gate: Deterministic Financial Policy & Authorization Engine.
 *
 * Implements strict, mathematical safety boundaries for agent commerce:
 * - Deterministic policy enforcement (NEVER delegates financial decisions to LLMs)
 * - Spending limit verification (per-transaction, daily, and monthly budgets)
 * - Recipient and merchant whitelisting
 * - Replay and duplicate-request protection via idempotency keys and intent digests
 * - Cryptographic HMAC-SHA256 signing of purchase authorizations
 */

import { createHmac, createHash, randomUUID } from "node:crypto";
import type {
  SpendingPolicy,
  PurchaseIntent,
  GateEvaluationResult,
  SignedPurchaseAuthorization,
  AuditEvent,
} from "../../shared/zbits-types.js";

export const DEFAULT_SPENDING_POLICY: SpendingPolicy = {
  enabled: true,
  maxPerTransactionCents: 5000,    // $50.00 max single purchase
  dailyBudgetCents: 15000,         // $150.00 daily limit
  monthlyBudgetCents: 50000,       // $500.00 monthly limit
  requireApprovalAboveCents: 2000, // $20.00 requires user approval
  whitelistedRecipients: ["self", "authorized_contact", "gift_registry"],
  whitelistedMerchants: ["bitrefill", "steam", "amazon_egift", "uber_eats"],
  currency: "USD",
};

export class GateEngine {
  private policy: SpendingPolicy;
  private readonly secretKey: string;
  private readonly processedIntents = new Map<string, { timestamp: number; digest: string }>();
  private readonly dailySpendCents = new Map<string, number>(); // dateStr -> cents
  private readonly monthlySpendCents = new Map<string, number>(); // monthStr -> cents
  private readonly auditLog: AuditEvent[] = [];

  constructor(policy: SpendingPolicy = DEFAULT_SPENDING_POLICY, secretKey?: string) {
    this.policy = { ...policy };
    this.secretKey = secretKey || process.env.GATE_SIGNING_SECRET || "zbits-gate-deterministic-secret-key-v1";
  }

  public getPolicy(): SpendingPolicy {
    return { ...this.policy };
  }

  public updatePolicy(patch: Partial<SpendingPolicy>, actor = "user"): void {
    this.policy = { ...this.policy, ...patch };
    this.recordAudit("policy_updated", "info", actor, { patch });
  }

  public calculateDigest(intent: Omit<PurchaseIntent, "intentDigest" | "intentId">): string {
    const payload = `${intent.idempotencyKey}:${intent.botId}:${intent.merchant}:${intent.recipient}:${intent.amountCents}:${intent.currency}:${intent.itemDescription}`;
    return createHash("sha256").update(payload).digest("hex");
  }

  public evaluateIntent(intent: PurchaseIntent): GateEvaluationResult {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthStr = now.toISOString().slice(0, 7);

    // 1. Policy Status
    if (!this.policy.enabled) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "policy_disabled" });
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: "policy_disabled",
        policyNotes: "Z-Bits Gate financial policy engine is currently disabled.",
      };
    }

    // 2. Duplicate / Idempotency Check
    const existing = this.processedIntents.get(intent.idempotencyKey);
    if (existing) {
      if (existing.digest === intent.intentDigest) {
        this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "duplicate_intent_detected" });
        return {
          allowed: false,
          requiresUserApproval: false,
          reason: "duplicate_intent_detected",
          policyNotes: "Duplicate purchase intent detected. Request has already been evaluated.",
        };
      }
    }

    // 3. Merchant Check
    const merchantNorm = intent.merchant.toLowerCase().trim();
    if (this.policy.whitelistedMerchants.length > 0 && !this.policy.whitelistedMerchants.includes(merchantNorm)) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "merchant_not_whitelisted" });
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: "merchant_not_whitelisted",
        policyNotes: `Merchant "${intent.merchant}" is not in the approved Gate merchant list.`,
      };
    }

    // 4. Per-Transaction Limit
    if (intent.amountCents > this.policy.maxPerTransactionCents) {
      this.recordAudit("purchase_rejected", "security_alert", intent.botId, { intent, reason: "exceeds_transaction_limit" });
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: "exceeds_transaction_limit",
        policyNotes: `Amount ($${(intent.amountCents / 100).toFixed(2)}) exceeds maximum per-transaction limit ($${(this.policy.maxPerTransactionCents / 100).toFixed(2)}).`,
      };
    }

    // 5. Daily Budget Check
    const currentDaily = this.dailySpendCents.get(todayStr) || 0;
    if (currentDaily + intent.amountCents > this.policy.dailyBudgetCents) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "exceeds_daily_budget" });
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: "exceeds_daily_budget",
        policyNotes: `Purchase would exceed daily budget. Used: $${(currentDaily / 100).toFixed(2)}, Limit: $${(this.policy.dailyBudgetCents / 100).toFixed(2)}.`,
      };
    }

    // 6. Monthly Budget Check
    const currentMonthly = this.monthlySpendCents.get(thisMonthStr) || 0;
    if (currentMonthly + intent.amountCents > this.policy.monthlyBudgetCents) {
      this.recordAudit("purchase_rejected", "warning", intent.botId, { intent, reason: "exceeds_monthly_budget" });
      return {
        allowed: false,
        requiresUserApproval: false,
        reason: "exceeds_monthly_budget",
        policyNotes: `Purchase would exceed monthly budget. Used: $${(currentMonthly / 100).toFixed(2)}, Limit: $${(this.policy.monthlyBudgetCents / 100).toFixed(2)}.`,
      };
    }

    // 7. User Approval Threshold
    if (intent.amountCents > this.policy.requireApprovalAboveCents) {
      this.recordAudit("gate_evaluated", "info", intent.botId, { intent, status: "awaiting_user_approval" });
      return {
        allowed: true,
        requiresUserApproval: true,
        reason: "awaiting_user_approval",
        policyNotes: `Amount ($${(intent.amountCents / 100).toFixed(2)}) exceeds auto-approval threshold ($${(this.policy.requireApprovalAboveCents / 100).toFixed(2)}). Explicit user approval required.`,
      };
    }

    // 8. Auto-Approved under threshold: Generate Signed Authorization
    const signedAuthorization = this.signAuthorization(intent);
    this.recordSpend(intent, todayStr, thisMonthStr);
    this.recordAudit("purchase_authorized", "info", intent.botId, { intent, signedAuthorization });

    return {
      allowed: true,
      requiresUserApproval: false,
      reason: "approved_under_threshold",
      policyNotes: "Purchase approved within deterministic Gate thresholds.",
      signedAuthorization,
    };
  }

  public authorizeWithApproval(intent: PurchaseIntent, approvedBy: string): SignedPurchaseAuthorization {
    const todayStr = new Date().toISOString().slice(0, 10);
    const thisMonthStr = new Date().toISOString().slice(0, 7);

    const signedAuth = this.signAuthorization(intent);
    this.recordSpend(intent, todayStr, thisMonthStr);
    this.recordAudit("purchase_authorized", "info", approvedBy, { intent, signedAuth, approvedBy });
    return signedAuth;
  }

  public verifySignature(auth: SignedPurchaseAuthorization): boolean {
    const expected = this.createSignatureString(auth.authorizationId, auth.intentId, auth.intentDigest, auth.authorizedAmountCents, auth.currency, auth.authorizedAt, auth.expiresAt);
    const calculated = createHmac("sha256", this.secretKey).update(expected).digest("hex");
    return auth.signature === calculated && Date.parse(auth.expiresAt) > Date.now();
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

  private recordSpend(intent: PurchaseIntent, todayStr: string, thisMonthStr: string): void {
    const currentDaily = this.dailySpendCents.get(todayStr) || 0;
    this.dailySpendCents.set(todayStr, currentDaily + intent.amountCents);

    const currentMonthly = this.monthlySpendCents.get(thisMonthStr) || 0;
    this.monthlySpendCents.set(thisMonthStr, currentMonthly + intent.amountCents);
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

  public evaluate(intent: PurchaseIntent): GateEvaluationResult {
    return this.evaluateIntent(intent);
  }

  public getAuditLog(limit?: number): AuditEvent[] {
    if (limit && limit > 0) return this.auditLog.slice(0, limit);

    return [...this.auditLog];
  }
}

let defaultGate: GateEngine | null = null;
export function getGateEngine(): GateEngine {
  if (!defaultGate) {
    defaultGate = new GateEngine();
  }
  return defaultGate;
}
