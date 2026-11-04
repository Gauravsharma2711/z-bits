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
  spendpass?: SpendPassRecord;
  spendpassToken?: string;
  approvalId?: string;
  remainingDailyBudgetCents?: number;
  remainingMonthlyBudgetCents?: number;
  remainingRecipientBudgetCents?: number | null;
}

export type SpendPassStatus = "ISSUED" | "CLAIMED" | "CONSUMED" | "REVOKED" | "EXPIRED" | "RECONCILIATION_REQUIRED";

export interface SpendPassClaims {
  iss: string; // "zbits-gate"
  aud: string; // "zbits-runner"
  jti: string; // unique token ID
  sub: string; // owner ID
  agent_id: string;
  purchase_intent_id: string;
  authorization_id: string;
  reservation_id: string;
  recipient_id: string;
  merchant_id: string;
  product_id?: string;
  denomination: number;
  currency: CurrencyCode;
  max_amount: number;
  policy_version: number;
  iat: number; // Unix seconds
  nbf: number; // Unix seconds
  exp: number; // Unix seconds
  nonce: string;
}

export interface SpendPassRecord {
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
  currency: CurrencyCode;
  maxAmount: number;
  policyVersion: number;
  keyId: string;
  status: SpendPassStatus;
  executionId?: string | null;
  revocationReason?: string | null;
  token?: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SpendPassReasonCode =
  | "INVALID_SIGNATURE"
  | "UNSUPPORTED_ALGORITHM"
  | "UNKNOWN_SIGNING_KEY"
  | "TOKEN_EXPIRED"
  | "TOKEN_NOT_YET_VALID"
  | "INVALID_ISSUER"
  | "INVALID_AUDIENCE"
  | "TOKEN_NOT_FOUND"
  | "TOKEN_REVOKED"
  | "TOKEN_ALREADY_CLAIMED"
  | "TOKEN_ALREADY_CONSUMED"
  | "RESERVATION_INVALID"
  | "PURCHASE_INTENT_MISMATCH"
  | "RECIPIENT_MISMATCH"
  | "MERCHANT_MISMATCH"
  | "PRODUCT_MISMATCH"
  | "DENOMINATION_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "AMOUNT_EXCEEDED"
  | "POLICY_VERSION_MISMATCH"
  | "EMERGENCY_PAUSE_ACTIVE"
  | "VERIFICATION_UNAVAILABLE";

export interface SpendPassExecutionContext {
  recipientId?: string;
  merchantId?: string;
  productId?: string;
  denomination?: number;
  currency?: CurrencyCode;
  actualAmountCents?: number;
  purchaseIntentId?: string;
  executionId?: string;
}

export interface SpendPassVerificationResult {
  valid: boolean;
  spendpassId?: string;
  jti?: string;
  purchaseIntentId?: string;
  recipientId?: string;
  merchantId?: string;
  productId?: string;
  denomination?: number;
  currency?: CurrencyCode;
  maxAmount?: number;
  policyVersion?: number;
  record?: SpendPassRecord;
  reasonCodes: SpendPassReasonCode[];
  errorMessage?: string;
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
  | "spendpass_issued"
  | "spendpass_claimed"
  | "spendpass_consumed"
  | "spendpass_revoked"
  | "spendpass_rejected"
  | "runner_dispatched"
  | "runner_execution_blocked"
  | "runner_purchase_initiated"
  | "runner_purchase_completed"
  | "runner_purchase_failed"
  | "runner_purchase_uncertain"
  | "runner_delivery_confirmed"
  | "runner_settlement_completed"
  | "bounty_event_created"
  | "bounty_event_validated"
  | "bounty_reward_initiated"
  | "bounty_reward_completed"
  | "bounty_reward_rejected"
  | "maya_intent_parsed"
  | "maya_proposal_generated"
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

// ==========================================
// RUNNER: EXECUTION, INVOICES & BITREFILL
// ==========================================

export type RunnerReasonCode =
  | "BITREFILL_CONFIGURATION_MISSING"
  | "BITREFILL_AUTH_FAILED"
  | "BITREFILL_UNAVAILABLE"
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_UNAVAILABLE"
  | "DENOMINATION_INVALID"
  | "PRICE_MISMATCH"
  | "PRICE_EXCEEDS_AUTHORIZATION"
  | "SPENDPASS_INVALID"
  | "SPENDPASS_EXPIRED"
  | "SPENDPASS_REVOKED"
  | "SPENDPASS_ALREADY_CLAIMED"
  | "RESERVATION_INVALID"
  | "EMERGENCY_PAUSE_ACTIVE"
  | "DUPLICATE_EXECUTION"
  | "MERCHANT_OUTCOME_UNCERTAIN"
  | "INVOICE_NOT_FOUND"
  | "DELIVERY_PENDING"
  | "DELIVERY_FAILED"
  | "SETTLEMENT_FAILED"
  | "RECONCILIATION_REQUIRED";

export interface BitrefillPackage {
  value: number; // minor units (cents)
  price: number; // minor units (cents)
  currency: CurrencyCode;
}

export interface BitrefillProduct {
  id: string;
  name: string;
  description?: string;
  country: string;
  currency: CurrencyCode;
  categories: string[];
  packages: BitrefillPackage[];
  range?: { min: number; max: number; step?: number };
  isAvailable: boolean;
  logoUrl?: string;
}

export type MerchantInvoiceStatus =
  | "CREATED"
  | "PENDING"
  | "PAID"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED"
  | "UNCERTAIN";

export interface MerchantInvoiceRecord {
  id: string;
  executionId: string;
  purchaseIntentId: string;
  spendpassId: string;
  ownerId: string;
  merchant: string;
  merchantInvoiceId: string;
  merchantOrderId?: string | null;
  productId: string;
  denomination: number;
  currency: CurrencyCode;
  actualAmountCents: number;
  status: MerchantInvoiceStatus;
  merchantStatus: string;
  deliveryRef?: string | null;
  deliveredAt?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunnerExecutionStatus =
  | "PENDING"
  | "IN_FLIGHT"
  | "COMPLETED"
  | "FAILED"
  | "UNCERTAIN";

export interface RunnerExecutionRecord {
  id: string;
  spendpassId: string;
  purchaseIntentId: string;
  ownerId: string;
  merchant: string;
  status: RunnerExecutionStatus;
  actualAmountCents: number;
  currency: CurrencyCode;
  invoiceId?: string | null;
  merchantInvoiceId?: string | null;
  error?: string | null;
  reasonCodes: (RunnerReasonCode | SpendPassReasonCode | string)[];
  createdAt: string;
  updatedAt: string;
}

export interface RunnerExecutionResult {
  success: boolean;
  executionId: string;
  status: RunnerExecutionStatus;
  merchantInvoiceId?: string;
  deliveryStatus?: string;
  deliveredAt?: string;
  deliveryRef?: string;
  actualAmountCents: number;
  currency: CurrencyCode;
  reasonCodes: (RunnerReasonCode | SpendPassReasonCode | string)[];
  errorMessage?: string;
  invoice?: MerchantInvoiceRecord;
  execution?: RunnerExecutionRecord;
}

// ==========================================
// PHASE 06: AGENT WORKFLOWS (MAYA & BOLT)
// ==========================================

export type BountySource = "manual" | "github_issue" | "github_pr" | "milestone";
export type BountyStatus = "PENDING" | "AUTHORIZED" | "EXECUTED" | "REJECTED" | "FAILED";

export interface BountyEvent {
  id: string;
  ownerId: string;
  contributorAlias: string;
  contributorId?: string | null;
  rewardAmountCents: number;
  currency: CurrencyCode;
  reason: string;
  source: BountySource;
  sourceRef?: string | null;
  idempotencyKey: string;
  purchaseIntentId?: string | null;
  executionId?: string | null;
  status: BountyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MayaIntentExtraction {
  rawQuery: string;
  recipientAlias?: string;
  canonicalRecipientId?: string;
  productQuery?: string;
  productId?: string;
  denominationCents?: number;
  currency: CurrencyCode;
  maxAmountCents?: number;
  occasion?: string;
  instructions?: string;
  isAmbiguous: boolean;
  missingFields: string[];
  needsClarification: boolean;
  clarificationPrompt?: string;
}

export interface MayaPurchaseProposal {
  proposalId: string;
  recipientName: string;
  recipientId: string;
  productName: string;
  productId: string;
  denominationCents: number;
  estimatedPriceCents: number;
  currency: CurrencyCode;
  merchant: string;
  requiresApproval: boolean;
  notes?: string;
}

export interface MayaWorkflowResult {
  success: boolean;
  decision: GateDecisionOutcome;
  intent?: PurchaseIntent;
  spendpassId?: string;
  executionId?: string;
  execution?: RunnerExecutionRecord;
  executionResult?: RunnerExecutionResult;
  runnerResult?: RunnerExecutionResult;
  reasonCodes: string[];
  message: string;
  deliveryRef?: string;
  approvalId?: string;
}

export interface BoltBountyValidation {
  valid: boolean;
  event?: BountyEvent;
  contributorName?: string;
  canonicalContributorId?: string;
  eligibleProducts?: BitrefillProduct[];
  reasonCodes: string[];
  errorMessage?: string;
}

export interface BoltWorkflowResult {
  success: boolean;
  bountyId: string;
  decision: GateDecisionOutcome;
  intent?: PurchaseIntent;
  spendpassId?: string;
  execution?: RunnerExecutionRecord;
  executionResult?: RunnerExecutionResult;
  runnerResult?: RunnerExecutionResult;
  reasonCodes: string[];
  message: string;
  deliveryRef?: string;
  approvalId?: string;
}

// ==========================================
// ZCASH: SHIELDED PRIVACY & TESTNET NU7
// ==========================================

export type ZcashNetwork = "testnet" | "mainnet";
export type ZcashTransactionStatus = "PENDING" | "SUBMITTED" | "CONFIRMED" | "FAILED";

export interface ZcashShieldedRecord {
  id: string;
  ownerId: string;
  network: ZcashNetwork;
  txid: string;
  fromAddress?: string;
  toAddress: string;
  amountZat: number;
  amountZec: number;
  memoRef: string; // STRICTLY OPAQUE REFERENCE e.g. "zbits:ord_a8f92b" - ZERO PII
  blockHeight?: number;
  confirmations: number;
  status: ZcashTransactionStatus;
  explorerUrl: string;
  submittedAt: string;
  verifiedAt?: string;
  errorMessage?: string;
}

export interface VizorCompatibilityReport {
  supported: boolean;
  network: "testnet" | "mainnet";
  signingMode: "air-gapped-pczt-qr" | "manual-wallet";
  apiSupported: boolean;
  daemonSupported: boolean;
  notes: string;
  workflowSteps: string[];
}

export interface ZcashNetworkStatus {
  network: ZcashNetwork;
  isOnline: boolean;
  lightwalletdEndpoint: string;
  blockHeight: number;
  networkUpgrade: string;
  supportedAddressTypes: string[];
  vizorCompatibility: VizorCompatibilityReport;
}

export interface PrivacyEvidenceReport {
  whatStaysPrivate: string[];
  whatIsRevealed: string[];
  whatIsTrusted: string[];
  whatToFixNext: string[];
}
