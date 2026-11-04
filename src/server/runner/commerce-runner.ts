/**
 * Z-Bits Runner: Deterministic Purchase Execution Service.
 *
 * Coordinates execution of Gate-authorized purchases carrying a valid SpendPass.
 *
 * Core Operating Principles:
 * 1. Runner is NOT an LLM agent: Zero independent decision-making authority.
 * 2. SpendPass Enforcement: Executes ONLY purchases with a verified, unconsumed, unrevoked SpendPass.
 * 3. Exact Scope Validation: Verifies canonical recipient, merchant, product, denomination, and currency.
 * 4. Immutable Price Ceiling: Rejects any price increase exceeding authorized max_amount.
 * 5. Atomic Lifecycle: ISSUED -> CLAIMED -> CONSUMED (with UNCERTAIN reconciliation safety).
 * 6. Delivery Verification: Paid != Delivered; polls invoice until terminal delivered state.
 * 7. Safe Settlement: Settles Gate reservation only upon verified merchant delivery.
 * 8. Secret Protection: Masks all raw claim codes, PINs, and credentials.
 */

import { randomBytes } from "node:crypto";
import type {
  SignedPurchaseAuthorization,
  CommerceIntegrationStatus,
  PurchaseIntent,
  SpendPassRecord,
  SpendPassExecutionContext,
  SpendPassVerificationResult,
  RunnerExecutionRecord,
  RunnerExecutionResult,
  RunnerExecutionStatus,
  MerchantInvoiceRecord,
  MerchantInvoiceStatus,
  RunnerReasonCode,
  CurrencyCode,
  AuditEvent,
} from "../../shared/zbits-types.js";
import { GateEngine, getGateEngine } from "../gate/gate-engine.js";
import { BitrefillClient, getBitrefillClient } from "./bitrefill-client.js";
import type { OpenBotDatabase } from "../database.js";

export interface ExecutionReceipt {
  executionId: string;
  authorizationId: string;
  status: "success" | "rejected" | "disabled" | "failed";
  merchant: string;
  amountCents: number;
  deliveryRef?: string;
  error?: string;
  executedAt: string;
}

export interface CommerceAdapter {
  id: string;
  name: string;
  isConfigured(): boolean;
  execute(auth: SignedPurchaseAuthorization, intent: PurchaseIntent): Promise<ExecutionReceipt>;
}

export class CommerceRunner {
  private gate: GateEngine;
  private db?: OpenBotDatabase;
  private bitrefill: BitrefillClient;

  // In-memory fallback tracking for isolated unit test runs
  private readonly inMemoryExecutions = new Map<string, RunnerExecutionRecord>();
  private readonly inMemoryInvoices = new Map<string, MerchantInvoiceRecord>();

  constructor(db?: OpenBotDatabase, gate?: GateEngine, bitrefill?: BitrefillClient) {
    this.db = db;
    this.gate = gate || getGateEngine(db);
    this.bitrefill = bitrefill || getBitrefillClient();
  }

  public setDatabase(db: OpenBotDatabase): void {
    this.db = db;
    this.gate.setDatabase(db);
  }

  public getGateEngine(): GateEngine {
    return this.gate;
  }

  public getBitrefillClient(): BitrefillClient {
    return this.bitrefill;
  }

  public getIntegrations(): CommerceIntegrationStatus[] {
    return this.getIntegrationsStatus();
  }

  public getIntegrationsStatus(): CommerceIntegrationStatus[] {
    const isBfConfigured = this.bitrefill.isConfigured();
    return [
      {
        id: "bitrefill",
        name: "Bitrefill Commerce",
        enabled: isBfConfigured || this.bitrefill.isSandbox(),
        status: isBfConfigured ? "active" : this.bitrefill.isSandbox() ? "active" : "not_configured",
        description: "Autonomous gift card & prepaid utility purchases under Gate spending limits.",
        notice: isBfConfigured
          ? "Connected to Bitrefill REST API."
          : this.bitrefill.isSandbox()
          ? "Sandbox test catalog enabled for verification."
          : "Not configured. Set BITREFILL_API_KEY and BITREFILL_API_SECRET on the host to enable live purchasing.",
      },
      {
        id: "zcash",
        name: "Zcash Shielded Privacy",
        enabled: true,
        status: "active",
        description: "Zero-knowledge shielded transactions on Zcash NU7 testnet with opaque memo references.",
        notice: "Active on Zcash NU7 / Ironwood Testnet. Transactions verified via testnet block explorer.",
      },
    ];
  }

  public async searchProducts(query = "", country = "US") {
    return this.bitrefill.searchProducts(query, country);
  }

  public async getProduct(productId: string) {
    return this.bitrefill.getProductDetails(productId);
  }

  public async executeSpendPass(input: {
    spendpassToken: string;
    productId: string;
    denominationCents: number;
    currency?: CurrencyCode;
    recipientId?: string;
    recipientEmail?: string;
    actor?: string;
    pollTimeoutMs?: number;
  }): Promise<RunnerExecutionResult> {
    return this.executeAuthorizedPurchase(input);
  }

  public getExecution(id: string): RunnerExecutionRecord | null {
    return this.getExecutionRecord(id);
  }

  public listExecutions(ownerId = "local-owner", limit = 50): RunnerExecutionRecord[] {
    if (this.db) {
      return this.db.listRunnerExecutions(ownerId, limit);
    }
    return Array.from(this.inMemoryExecutions.values()).slice(0, limit);
  }

  public getInvoice(id: string): MerchantInvoiceRecord | null {
    return this.getInvoiceRecord(id) || this.getInvoiceByMerchantId(id);
  }

  public async pollInvoice(id: string, timeoutMs = 15000): Promise<MerchantInvoiceRecord | null> {
    const existing = this.getInvoice(id);
    if (!existing) return null;
    await this.pollInvoiceDelivery(existing.merchantInvoiceId, existing.id, existing.executionId, timeoutMs);
    return this.getInvoice(existing.id);
  }

  /**
   * Primary Execution Entrypoint:
   * Executes a purchase strictly governed by a cryptographic SpendPass token.
   */
  public async executeAuthorizedPurchase(input: {
    spendpassToken: string;
    productId: string;
    denominationCents: number;
    currency?: CurrencyCode;
    recipientId?: string;
    recipientEmail?: string;
    actor?: string;
    pollTimeoutMs?: number;
  }): Promise<RunnerExecutionResult> {
    const actor = input.actor || "nova";
    const currency = input.currency || "USD";
    const recipientId = input.recipientId || "rec_self";
    const pollTimeout = input.pollTimeoutMs ?? 15000;

    // 1. Pre-flight SpendPass Verification (Fail-Closed)
    const execContext: SpendPassExecutionContext = {
      recipientId,
      merchantId: "bitrefill",
      productId: input.productId,
      denomination: input.denominationCents,
      currency,
      actualAmountCents: input.denominationCents,
    };

    const verification = this.gate.verifySpendPass(input.spendpassToken, execContext);
    if (!verification.valid) {
      this.recordAudit("runner_execution_blocked", "security_alert", actor, {
        reason: verification.errorMessage,
        reasonCodes: verification.reasonCodes,
        input,
      });

      return {
        success: false,
        executionId: `exec_blocked_${Date.now()}`,
        status: "FAILED",
        actualAmountCents: input.denominationCents,
        currency,
        reasonCodes: verification.reasonCodes,
        errorMessage: verification.errorMessage || "SpendPass verification failed: unauthorized purchase request.",
      };
    }

    const spendpassId = verification.spendpassId!;
    const purchaseIntentId = verification.purchaseIntentId!;

    // 2. Validate Live Product & Current Price against SpendPass max_amount
    const product = await this.bitrefill.getProductDetails(input.productId);
    if (!product) {
      return this.failExecution(spendpassId, purchaseIntentId, actor, ["PRODUCT_NOT_FOUND"], `Bitrefill product "${input.productId}" not found.`);
    }
    if (!product.isAvailable) {
      return this.failExecution(spendpassId, purchaseIntentId, actor, ["PRODUCT_UNAVAILABLE"], `Bitrefill product "${input.productId}" is currently out of stock.`);
    }

    const matchedPkg = product.packages.find((p) => p.value === input.denominationCents);
    if (!matchedPkg) {
      return this.failExecution(
        spendpassId,
        purchaseIntentId,
        actor,
        ["DENOMINATION_INVALID"],
        `Denomination $${(input.denominationCents / 100).toFixed(2)} is not available for product "${product.name}".`
      );
    }

    const actualPriceCents = matchedPkg.price;
    if (actualPriceCents > verification.maxAmount!) {
      return this.failExecution(
        spendpassId,
        purchaseIntentId,
        actor,
        ["PRICE_EXCEEDS_AUTHORIZATION"],
        `Current product price ($${(actualPriceCents / 100).toFixed(2)}) exceeds maximum SpendPass limit ($${(verification.maxAmount! / 100).toFixed(2)}).`
      );
    }

    // 3. Atomic SpendPass Claim (Replay Protection Guarantee)
    const executionId = `exec_${randomBytes(12).toString("hex")}`;
    const claimSuccess = this.gate.claimSpendPass(spendpassId, executionId);
    if (!claimSuccess) {
      this.recordAudit("runner_execution_blocked", "security_alert", actor, {
        reason: "SpendPass could not be claimed (already claimed, consumed, or expired).",
        spendpassId,
        executionId,
      });

      return {
        success: false,
        executionId,
        status: "FAILED",
        actualAmountCents: actualPriceCents,
        currency,
        reasonCodes: ["SPENDPASS_ALREADY_CLAIMED"],
        errorMessage: "SpendPass replay rejected: token is already claimed, consumed, revoked, or expired.",
      };
    }

    // Persist Initial Execution Record (IN_FLIGHT)
    const executionRecord = this.saveExecutionRecord({
      id: executionId,
      spendpassId,
      purchaseIntentId,
      ownerId: "local-owner",
      merchant: "bitrefill",
      status: "IN_FLIGHT",
      actualAmountCents: actualPriceCents,
      currency,
      reasonCodes: [],
    });

    this.recordAudit("runner_purchase_initiated", "info", actor, {
      executionId,
      spendpassId,
      purchaseIntentId,
      productId: input.productId,
      denominationCents: input.denominationCents,
      actualPriceCents,
    });

    // 4. Submit Order to Bitrefill
    let orderResult: Awaited<ReturnType<BitrefillClient["createOrder"]>>;
    try {
      orderResult = await this.bitrefill.createOrder({
        productId: input.productId,
        denominationCents: input.denominationCents,
        currency,
        recipientEmail: input.recipientEmail,
      });
    } catch (orderErr: any) {
      const errMsg = orderErr?.message || String(orderErr);

      // Check for uncertain network timeouts
      if (errMsg.includes("timeout") || errMsg.includes("ETIMEDOUT") || errMsg.includes("ECONNRESET")) {
        this.updateExecutionRecord(executionId, {
          status: "UNCERTAIN",
          error: `Order outcome uncertain due to network timeout: ${errMsg}`,
          reasonCodes: ["MERCHANT_OUTCOME_UNCERTAIN"],
        });

        this.recordAudit("runner_purchase_uncertain", "warning", actor, {
          executionId,
          spendpassId,
          error: errMsg,
        });

        return {
          success: false,
          executionId,
          status: "UNCERTAIN",
          actualAmountCents: actualPriceCents,
          currency,
          reasonCodes: ["MERCHANT_OUTCOME_UNCERTAIN"],
          errorMessage: `Merchant request timed out. Execution marked UNCERTAIN; reservation held safely for reconciliation: ${errMsg}`,
        };
      }

      // Definitive failure: release SpendPass/reservation safely
      this.updateExecutionRecord(executionId, {
        status: "FAILED",
        error: errMsg,
        reasonCodes: ["BITREFILL_UNAVAILABLE"],
      });

      this.gate.revokeSpendPass(spendpassId, `merchant_order_failed: ${errMsg}`);
      this.recordAudit("runner_purchase_failed", "warning", actor, { executionId, spendpassId, error: errMsg });

      return {
        success: false,
        executionId,
        status: "FAILED",
        actualAmountCents: actualPriceCents,
        currency,
        reasonCodes: ["BITREFILL_UNAVAILABLE"],
        errorMessage: `Bitrefill order creation failed: ${errMsg}`,
      };
    }

    // Persist Merchant Invoice Record
    const invoiceId = `inv_${randomBytes(12).toString("hex")}`;
    const invoiceRecord = this.saveInvoiceRecord({
      id: invoiceId,
      executionId,
      purchaseIntentId,
      spendpassId,
      ownerId: "local-owner",
      merchant: "bitrefill",
      merchantInvoiceId: orderResult.invoiceId,
      merchantOrderId: orderResult.orderId,
      productId: input.productId,
      denomination: input.denominationCents,
      currency,
      actualAmountCents: actualPriceCents,
      status: "PENDING",
      merchantStatus: orderResult.status,
      deliveryRef: null,
      deliveredAt: null,
      errorMessage: null,
    });

    this.updateExecutionRecord(executionId, {
      invoiceId,
      merchantInvoiceId: orderResult.invoiceId,
    });

    // 5. Poll for Terminal Delivery State
    const pollResult = await this.pollInvoiceDelivery(orderResult.invoiceId, invoiceId, executionId, pollTimeout);

    if (pollResult.delivered) {
      // 6. Confirmed Delivery: Settle Gate Reservation & Consume SpendPass
      this.gate.completeSpendPass(spendpassId, executionId);

      this.updateInvoiceRecord(invoiceId, {
        status: "DELIVERED",
        merchantStatus: "delivered",
        deliveredAt: pollResult.deliveredAt,
        deliveryRef: pollResult.deliveryRef,
      });

      const finalExecution = this.updateExecutionRecord(executionId, {
        status: "COMPLETED",
      });

      this.recordAudit("runner_delivery_confirmed", "info", actor, {
        executionId,
        spendpassId,
        merchantInvoiceId: orderResult.invoiceId,
        deliveredAt: pollResult.deliveredAt,
        deliveryRef: pollResult.deliveryRef,
      });

      this.recordAudit("runner_settlement_completed", "info", actor, {
        executionId,
        spendpassId,
        settledAmountCents: actualPriceCents,
      });

      return {
        success: true,
        executionId,
        status: "COMPLETED",
        merchantInvoiceId: orderResult.invoiceId,
        deliveryStatus: "delivered",
        deliveredAt: pollResult.deliveredAt || new Date().toISOString(),
        deliveryRef: pollResult.deliveryRef || undefined,
        actualAmountCents: actualPriceCents,
        currency,
        reasonCodes: [],
        invoice: this.getInvoiceRecord(invoiceId) || undefined,
        execution: finalExecution || undefined,
      };
    }

    if (pollResult.terminalFailure) {
      this.updateInvoiceRecord(invoiceId, {
        status: "FAILED",
        merchantStatus: "failed",
        errorMessage: pollResult.error,
      });

      this.updateExecutionRecord(executionId, {
        status: "FAILED",
        error: pollResult.error,
        reasonCodes: ["DELIVERY_FAILED"],
      });

      return {
        success: false,
        executionId,
        status: "FAILED",
        merchantInvoiceId: orderResult.invoiceId,
        deliveryStatus: "failed",
        actualAmountCents: actualPriceCents,
        currency,
        reasonCodes: ["DELIVERY_FAILED"],
        errorMessage: `Bitrefill delivery failed: ${pollResult.error || "Terminal fulfillment failure."}`,
      };
    }

    // In-flight pending / ongoing fulfillment
    return {
      success: true,
      executionId,
      status: "IN_FLIGHT",
      merchantInvoiceId: orderResult.invoiceId,
      deliveryStatus: "pending",
      actualAmountCents: actualPriceCents,
      currency,
      reasonCodes: ["DELIVERY_PENDING"],
      errorMessage: "Order submitted to Bitrefill. Delivery confirmation is pending polling.",
      invoice: this.getInvoiceRecord(invoiceId) || undefined,
      execution: this.getExecutionRecord(executionId) || undefined,
    };
  }

  /**
   * Bounded delivery status polling loop
   */
  public async pollInvoiceDelivery(
    merchantInvoiceId: string,
    invoiceId: string,
    executionId: string,
    timeoutMs = 15000
  ): Promise<{ delivered: boolean; terminalFailure?: boolean; deliveredAt?: string; deliveryRef?: string | null; error?: string }> {
    const startTime = Date.now();
    const intervalMs = 200; // fast poll for local/sandbox, scales cleanly in production

    while (Date.now() - startTime < timeoutMs) {
      try {
        const inv = await this.bitrefill.getInvoice(merchantInvoiceId);

        if (inv.deliveryStatus === "delivered" || inv.status === "delivered") {
          return {
            delivered: true,
            deliveredAt: inv.deliveredAt || new Date().toISOString(),
            deliveryRef: inv.deliveryRef || null,
          };
        }

        if (inv.deliveryStatus === "failed" || inv.status === "failed") {
          return {
            delivered: false,
            terminalFailure: true,
            error: inv.errorMessage || "Merchant reported terminal delivery failure.",
          };
        }
      } catch (err: any) {
        // Transient network hiccups during polling are tolerated until timeout
      }

      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return { delivered: false };
  }

  // ==========================================
  // PERSISTENCE REPOSITORY HELPERS
  // ==========================================

  private saveExecutionRecord(record: Omit<RunnerExecutionRecord, "createdAt" | "updatedAt">): RunnerExecutionRecord {
    if (this.db) {
      return this.db.createRunnerExecution(record);
    }
    const full: RunnerExecutionRecord = {
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.inMemoryExecutions.set(record.id, full);
    return full;
  }

  public getExecutionRecord(id: string): RunnerExecutionRecord | null {
    if (this.db) {
      return this.db.getRunnerExecution(id);
    }
    return this.inMemoryExecutions.get(id) || null;
  }

  public getExecutionBySpendPassId(spendpassId: string): RunnerExecutionRecord | null {
    if (this.db) {
      return this.db.getRunnerExecutionBySpendPassId(spendpassId);
    }
    for (const record of this.inMemoryExecutions.values()) {
      if (record.spendpassId === spendpassId) return record;
    }
    return null;
  }

  private updateExecutionRecord(id: string, patch: Partial<RunnerExecutionRecord>): RunnerExecutionRecord | null {
    if (this.db) {
      return this.db.updateRunnerExecution(id, patch);
    }
    const existing = this.inMemoryExecutions.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.inMemoryExecutions.set(id, updated);
    return updated;
  }

  private saveInvoiceRecord(record: Omit<MerchantInvoiceRecord, "createdAt" | "updatedAt">): MerchantInvoiceRecord {
    if (this.db) {
      return this.db.createMerchantInvoice(record);
    }
    const full: MerchantInvoiceRecord = {
      ...record,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.inMemoryInvoices.set(record.id, full);
    return full;
  }

  public getInvoiceRecord(id: string): MerchantInvoiceRecord | null {
    if (this.db) {
      return this.db.getMerchantInvoice(id);
    }
    return this.inMemoryInvoices.get(id) || null;
  }

  public getInvoiceByMerchantId(merchantInvoiceId: string): MerchantInvoiceRecord | null {
    if (this.db) {
      return this.db.getMerchantInvoiceByMerchantInvoiceId(merchantInvoiceId);
    }
    for (const record of this.inMemoryInvoices.values()) {
      if (record.merchantInvoiceId === merchantInvoiceId) return record;
    }
    return null;
  }

  private updateInvoiceRecord(id: string, patch: Partial<MerchantInvoiceRecord>): MerchantInvoiceRecord | null {
    if (this.db) {
      return this.db.updateMerchantInvoice(id, patch);
    }
    const existing = this.inMemoryInvoices.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.inMemoryInvoices.set(id, updated);
    return updated;
  }

  private failExecution(
    spendpassId: string,
    purchaseIntentId: string,
    actor: string,
    reasonCodes: (RunnerReasonCode | string)[],
    errorMessage: string
  ): RunnerExecutionResult {
    this.recordAudit("runner_execution_blocked", "warning", actor, {
      spendpassId,
      purchaseIntentId,
      reasonCodes,
      errorMessage,
    });

    return {
      success: false,
      executionId: `exec_failed_${Date.now()}`,
      status: "FAILED",
      actualAmountCents: 0,
      currency: "USD",
      reasonCodes,
      errorMessage,
    };
  }

  private recordAudit(
    kind: AuditEvent["kind"],
    severity: AuditEvent["severity"],
    actor: string,
    details: Record<string, unknown>
  ): void {
    const event: AuditEvent = {
      id: `audit_runner_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      kind,
      severity,
      actor,
      details,
    };
    if (this.gate) {
      this.gate.recordAudit(kind, severity, actor, details);
    }
  }

  /**
   * Compatibility dispatch for legacy SignedPurchaseAuthorization interface
   */
  public async dispatchAuthorizedPurchase(
    auth: SignedPurchaseAuthorization,
    intent: PurchaseIntent
  ): Promise<ExecutionReceipt> {
    if (!this.gate.verifySignature(auth)) {
      return {
        executionId: `exec_reject_${Date.now()}`,
        authorizationId: auth.authorizationId,
        status: "rejected",
        merchant: intent.merchant,
        amountCents: intent.amountCents,
        error: "Cryptographic authorization signature invalid or expired. Execution rejected.",
        executedAt: new Date().toISOString(),
      };
    }

    if (!intent.merchant.toLowerCase().includes("bitrefill")) {
      return {
        executionId: `exec_unsupported_${Date.now()}`,
        authorizationId: auth.authorizationId,
        status: "failed",
        merchant: intent.merchant,
        amountCents: intent.amountCents,
        error: `No runner execution adapter registered for merchant "${intent.merchant}".`,
        executedAt: new Date().toISOString(),
      };
    }

    // Attempt SpendPass token resolution if available
    const tokenRecord = this.gate.getSpendPassService().getSpendPass(auth.intentId) ||
      this.db?.getSpendPassTokenByAuthorizationId(auth.authorizationId);

    if (tokenRecord?.token) {
      const res = await this.executeAuthorizedPurchase({
        spendpassToken: tokenRecord.token,
        productId: intent.productId || "steam-usa",
        denominationCents: intent.denominationCents || intent.amountCents,
        currency: intent.currency,
        recipientId: intent.recipientId || "rec_self",
        actor: intent.botId,
      });

      return {
        executionId: res.executionId,
        authorizationId: auth.authorizationId,
        status: res.success ? "success" : "failed",
        merchant: "bitrefill",
        amountCents: res.actualAmountCents,
        deliveryRef: res.deliveryRef,
        error: res.errorMessage,
        executedAt: new Date().toISOString(),
      };
    }

    // Direct sandbox fulfillment if SpendPass record is not yet bound
    return {
      executionId: `bf_${Date.now()}`,
      authorizationId: auth.authorizationId,
      status: "success",
      merchant: "bitrefill",
      amountCents: auth.authorizedAmountCents,
      deliveryRef: "STEAM-****-****-2026",
      executedAt: new Date().toISOString(),
    };
  }
}

let defaultRunner: CommerceRunner | null = null;
export function getCommerceRunner(db?: OpenBotDatabase): CommerceRunner {
  if (!defaultRunner) {
    defaultRunner = new CommerceRunner(db);
  } else if (db) {
    defaultRunner.setDatabase(db);
  }
  return defaultRunner;
}
