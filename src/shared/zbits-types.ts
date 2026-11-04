/**
 * Z-Bits Core Domain Types.
 *
 * Defines contracts for:
 * - Gate (Deterministic Financial Policy & Authorization Engine)
 * - Runner (Commerce & Settlement Execution System)
 * - Purchase Intents & Signed Authorizations
 * - Security & Audit Events
 * - Persona Display Profiles & Identity Aliases
 */

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CAD" | "TAZ" | "ZEC" | "SATS";

export interface BitDisplayProfile {
  internalBotId: string;
  personaId: "maya" | "bolt" | "sage" | string;
  displayName: string;
  title: string;
  tagline: string;
  responsibilities: string[];
  avatarMascot?: string;
  accentColor: string;
  suggestedPrompts: string[];
  assignedProviderId?: string | null;
  assignedModel?: string | null;
}

export interface SpendingPolicy {
  enabled: boolean;
  maxPerTransactionCents: number; // e.g. 5000 = $50.00
  dailyBudgetCents: number;       // e.g. 15000 = $150.00
  monthlyBudgetCents: number;     // e.g. 50000 = $500.00
  requireApprovalAboveCents: number; // e.g. 2500 = $25.00
  whitelistedRecipients: string[];
  whitelistedMerchants: string[];
  currency: CurrencyCode;
}

/**
 * Gate Phase 03: Spending Constitution
 * Deterministic rules set by owner, versioned, strictly enforced.
 */
export interface SpendingConstitution {
  id: string;
  ownerId: string;
  currency: CurrencyCode;
  maxPerOrderCents: number;
  dailyBudgetCents: number;
  monthlyBudgetCents: number;
  requireApprovalAboveCents: number;
  allowedCategories: string[];
  allowedMerchants: string[];
  allowedDenominations: number[]; // empty means any denomination allowed up to maxPerOrder
  trustedRecipientOnly: boolean;
  emergencyPause: boolean;
  policyVersion: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Gate Phase 03: Canonical Recipient Registry
 */
export interface CanonicalRecipient {
  id: string;
  ownerId: string;
  displayName: string;
  status: "ACTIVE" | "PENDING" | "BLOCKED";
  trusted: boolean;
  recipientLimitCents?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecipientAlias {
  id: string;
  ownerId: string;
  recipientId: string;
  alias: string;
  normalizedAlias: string;
  source: "user" | "agent" | "system";
  createdAt: string;
}

export interface PurchaseIntent {
  intentId: string;
  idempotencyKey: string;
  botId: string;
  personaName?: string;
  runId?: string;
  threadId?: string;
  merchant: string;
  recipient: string;
  amountCents: number;
  currency: CurrencyCode;
  itemDescription: string;
  createdAt: string;
  intentDigest: string; // SHA-256 hash of payload
  category?: string;
  productId?: string;
  denominationCents?: number;
  recipientId?: string;
  status?: "PENDING" | "AUTHORIZED" | "REJECTED" | "REQUIRES_APPROVAL" | "SETTLED" | "CANCELLED";
}

export type LedgerEntryStatus = "RESERVED" | "SETTLED" | "RELEASED";

export interface SpendingLedgerEntry {
  id: string;
  ownerId: string;
  recipientId: string;
  purchaseIntentId: string;
  agentId: string;
  amountCents: number;
  currency: CurrencyCode;
  status: LedgerEntryStatus;
  createdAt: string;
  settledAt?: string | null;
  expiresAt: string;
}

export type GateApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED";

export interface GateApprovalRecord {
  id: string;
  ownerId: string;
  purchaseIntentId: string;
  reason: string;
  reasonCodes: GateReasonCode[];
  status: GateApprovalStatus;
  createdAt: string;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
}

export type GateDecisionOutcome = "ALLOW" | "DENY" | "REQUIRE_APPROVAL";

export type GateReasonCode =
  | "ALLOWED_UNDER_THRESHOLD"
  | "ORDER_LIMIT_EXCEEDED"
  | "DAILY_LIMIT_EXCEEDED"
  | "MONTHLY_LIMIT_EXCEEDED"
  | "RECIPIENT_LIMIT_EXCEEDED"
  | "MERCHANT_NOT_ALLOWED"
  | "CATEGORY_NOT_ALLOWED"
  | "DENOMINATION_NOT_ALLOWED"
  | "RECIPIENT_UNTRUSTED"
  | "RECIPIENT_NOT_FOUND"
  | "ALIAS_AMBIGUOUS"
  | "POLICY_REQUIRES_APPROVAL"
  | "EMERGENCY_PAUSE_ACTIVE"
  | "IDEMPOTENCY_CONFLICT"
  | "DUPLICATE_REQUEST"
  | "AGENT_UNAUTHORIZED"
  | "POLICY_DISABLED";

export interface GateDecisionRecord {
  id: string;
  ownerId: string;
  purchaseIntentId: string;
  decision: GateDecisionOutcome;
  reasonCodes: GateReasonCode[];
  policyVersion: number;
  remainingDailyBudgetCents: number;
  remainingMonthlyBudgetCents: number;
  remainingRecipientBudgetCents?: number | null;
  createdAt: string;
}

export type GateDecisionReason =
  | "approved_under_threshold"
  | "awaiting_user_approval"
  | "exceeds_transaction_limit"
  | "exceeds_daily_budget"
  | "exceeds_monthly_budget"
  | "recipient_not_whitelisted"
  | "merchant_not_whitelisted"
  | "duplicate_intent_detected"
  | "policy_disabled"
  | GateReasonCode;

export interface GateEvaluationResult {
  allowed: boolean;
  requiresUserApproval: boolean;
  decision?: GateDecisionOutcome;
  reason: GateDecisionReason | string;
  reasonCodes?: GateReasonCode[];
  policyNotes: string;
  policyVersion?: number;
  canonicalRecipient?: CanonicalRecipient;
  reservation?: SpendingLedgerEntry;
  signedAuthorization?: SignedPurchaseAuthorization;
  approvalId?: string;
  remainingDailyBudgetCents?: number;
  remainingMonthlyBudgetCents?: number;
  remainingRecipientBudgetCents?: number | null;
}

export interface SignedPurchaseAuthorization {
  authorizationId: string;
  intentId: string;
  intentDigest: string;
  authorizedAmountCents: number;
  currency: CurrencyCode;
  authorizedAt: string;
  expiresAt: string;
  signature: string; // Cryptographic HMAC-SHA256 signature generated by server secret
}

export type AuditEventKind =
  | "gate_evaluated"
  | "purchase_intent_created"
  | "purchase_authorized"
  | "purchase_rejected"
  | "runner_dispatched"
  | "runner_execution_blocked"
  | "policy_updated"
  | "credential_accessed";

export type AuditSeverity = "info" | "warning" | "security_alert" | "critical";

export interface AuditEvent {
  id: string;
  timestamp: string;
  kind: AuditEventKind;
  severity: AuditSeverity;
  actor: string; // botId, userId, or 'system'
  details: Record<string, unknown>;
  ipAddress?: string;
}

export interface CommerceIntegrationStatus {
  id: "bitrefill" | "zcash" | string;
  name: string;
  enabled: boolean;
  status: "active" | "disabled" | "coming_soon" | "not_configured";
  description: string;
  notice: string;
}
