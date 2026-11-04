/**
 * Z-Bits Bolt — Bounty Bit Workflow Service
 *
 * Responsibilities:
 * 1. Accepts and records contributor bounty and reward events.
 * 2. Validates contributor identity and resolves to canonical Gate recipient.
 * 3. Enforces event deduplication and stable idempotency keys.
 * 4. Discovers eligible reward payout products (digital gift cards, vouchers).
 * 5. Builds structured reward PurchaseIntents and submits to Gate.
 * 6. Shares the EXACT same spending constitution and recipient ledger as Maya.
 * 7. Dispatches authorized rewards through SpendPass and Runner.
 * 8. Tracks execution and verified delivery status.
 *
 * Security Invariants:
 * - Bolt is a request source, NOT a financial authority.
 * - Bolt shares the single owner-level financial constitution with all other Bits.
 * - Never approves its own bounty payouts.
 * - Never modifies spending limits or policy.
 * - Never signs SpendPass tokens or accesses private signing keys.
 * - Never calls Bitrefill or merchant APIs directly.
 */

import { randomBytes } from "node:crypto";
import type {
  BountyEvent,
  BountySource,
  CanonicalRecipient,
  PurchaseIntent,
  BoltBountyValidation,
  BoltWorkflowResult,
  CurrencyCode,
} from "../../shared/zbits-types.js";
import { GateEngine, getGateEngine } from "../gate/gate-engine.js";
import { CommerceRunner, getCommerceRunner } from "../runner/commerce-runner.js";
import type { OpenBotDatabase } from "../database.js";

export class BoltWorkflowService {
  private gate: GateEngine;
  private runner: CommerceRunner;
  private db?: OpenBotDatabase;

  // In-memory fallback tracking for isolated unit test runs
  private readonly inMemoryBounties = new Map<string, BountyEvent>();

  constructor(gate?: GateEngine, runner?: CommerceRunner, db?: OpenBotDatabase) {
    this.gate = gate || getGateEngine(db);
    this.runner = runner || getCommerceRunner(db);
    this.db = db;
  }

  public setDatabase(db: OpenBotDatabase): void {
    this.db = db;
    this.gate.setDatabase(db);
    this.runner.setDatabase(db);
  }

  public resolveRecipientSafely(alias: string, ownerId = "local-owner"): {
    status: "RESOLVED" | "AMBIGUOUS" | "NOT_FOUND";
    recipient?: CanonicalRecipient;
    ambiguousMatches?: CanonicalRecipient[];
  } {
    const direct = this.gate.resolveRecipient(ownerId, alias);
    if (direct) {
      return { status: "RESOLVED", recipient: direct };
    }
    const all = this.gate.getRecipients(ownerId);
    const normalized = alias.trim().toLowerCase();
    const matches = all.filter((r: CanonicalRecipient) => r.displayName.toLowerCase().includes(normalized));
    if (matches.length > 1) {
      return { status: "AMBIGUOUS", ambiguousMatches: matches };
    } else if (matches.length === 1) {
      return { status: "RESOLVED", recipient: matches[0] };
    }
    return { status: "NOT_FOUND" };
  }

  /**
   * 1. Register / Intake a Bounty Event with Idempotency Protection
   */
  public createBountyEvent(input: {
    contributorAlias: string;
    rewardAmountCents: number;
    reason: string;
    currency?: CurrencyCode;
    source?: BountySource;
    sourceRef?: string;
    idempotencyKey?: string;
    ownerId?: string;
  }): BountyEvent {
    const ownerId = input.ownerId || "local-owner";
    const currency = input.currency || "USD";
    const source = input.source || "manual";
    const idempotencyKey = input.idempotencyKey || `bounty_key_${Date.now()}_${randomBytes(6).toString("hex")}`;

    if (input.rewardAmountCents <= 0) {
      throw new Error("Reward amount must be a positive integer in cents.");
    }

    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error("Bounty reason must be provided.");
    }

    // 1. Check for duplicate submission via idempotency key
    const existing = this.getBountyByIdempotencyKey(idempotencyKey);
    if (existing) {
      // If payload matches, return existing record (idempotent replay)
      if (
        existing.contributorAlias.toLowerCase() === input.contributorAlias.toLowerCase() &&
        existing.rewardAmountCents === input.rewardAmountCents
      ) {
        return existing;
      }
      throw new Error(`Idempotency conflict: Key "${idempotencyKey}" already used with different parameters.`);
    }

    // 2. Resolve contributor through Gate canonical recipient registry
    const resolution = this.resolveRecipientSafely(input.contributorAlias, ownerId);
    const contributorId = resolution.status === "RESOLVED" && resolution.recipient
      ? resolution.recipient.id
      : null;

    const eventId = `bounty_${Date.now()}_${randomBytes(6).toString("hex")}`;
    const newEvent: BountyEvent = {
      id: eventId,
      ownerId,
      contributorAlias: input.contributorAlias,
      contributorId,
      rewardAmountCents: input.rewardAmountCents,
      currency,
      reason: input.reason,
      source,
      sourceRef: input.sourceRef || null,
      idempotencyKey,
      status: "PENDING",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (this.db) {
      return this.db.createBountyEvent(newEvent);
    }
    this.inMemoryBounties.set(newEvent.id, newEvent);
    return newEvent;
  }

  /**
   * 2. Validate Bounty Event
   */
  public async validateBountyEvent(
    bountyIdOrKey: string,
    ownerId = "local-owner"
  ): Promise<BoltBountyValidation> {
    const event = this.getBounty(bountyIdOrKey) || this.getBountyByIdempotencyKey(bountyIdOrKey);
    if (!event) {
      return {
        valid: false,
        reasonCodes: ["BOUNTY_NOT_FOUND"],
        errorMessage: `Bounty event "${bountyIdOrKey}" does not exist.`,
      };
    }

    if (event.ownerId !== ownerId) {
      return {
        valid: false,
        reasonCodes: ["UNAUTHORIZED_OWNER"],
        errorMessage: "Bounty event belongs to a different owner context.",
      };
    }

    if (event.status === "EXECUTED") {
      return {
        valid: false,
        event,
        reasonCodes: ["BOUNTY_ALREADY_EXECUTED"],
        errorMessage: "Bounty reward has already been executed and completed.",
      };
    }

    // Resolve contributor alias
    const resolution = this.resolveRecipientSafely(event.contributorAlias, ownerId);
    if (resolution.status !== "RESOLVED" || !resolution.recipient) {
      return {
        valid: false,
        event,
        reasonCodes: [resolution.status === "AMBIGUOUS" ? "CONTRIBUTOR_AMBIGUOUS" : "CONTRIBUTOR_UNRESOLVED"],
        errorMessage: `Contributor alias "${event.contributorAlias}" is ${resolution.status.toLowerCase()}. Register alias before payout.`,
      };
    }

    // Update contributor ID if newly resolved
    if (!event.contributorId) {
      event.contributorId = resolution.recipient.id;
      this.updateBounty(event.id, { contributorId: resolution.recipient.id });
    }

    // Find eligible reward products
    const eligibleProducts = await this.runner.searchProducts("gift card");

    return {
      valid: true,
      event,
      contributorName: resolution.recipient.displayName,
      canonicalContributorId: resolution.recipient.id,
      eligibleProducts,
      reasonCodes: ["VALID"],
    };
  }

  /**
   * 3. Process & Submit Bounty Reward to Gate & Runner
   */
  public async processReward(input: {
    bountyId: string;
    productId?: string;
    ownerId?: string;
    pollTimeoutMs?: number;
  }): Promise<BoltWorkflowResult> {
    const ownerId = input.ownerId || "local-owner";

    // 1. Validate the event
    const validation = await this.validateBountyEvent(input.bountyId, ownerId);
    if (!validation.valid || !validation.event || !validation.canonicalContributorId) {
      return {
        success: false,
        bountyId: input.bountyId,
        decision: "DENY",
        reasonCodes: validation.reasonCodes,
        message: validation.errorMessage || "Bounty validation failed.",
      };
    }

    const event = validation.event;
    const contributorId = validation.canonicalContributorId;
    const contributorName = validation.contributorName || event.contributorAlias;

    // 2. Resolve reward product & package
    const productId = input.productId || "steam-usa";
    const product = await this.runner.getProduct(productId);
    if (!product || !product.isAvailable) {
      return {
        success: false,
        bountyId: event.id,
        decision: "DENY",
        reasonCodes: ["PRODUCT_UNAVAILABLE"],
        message: `Reward product "${productId}" is unavailable or out of stock.`,
      };
    }

    const matchedPkg = product.packages.find((p) => p.value === event.rewardAmountCents);
    if (!matchedPkg) {
      return {
        success: false,
        bountyId: event.id,
        decision: "DENY",
        reasonCodes: ["DENOMINATION_UNAVAILABLE"],
        message: `Product "${product.name}" does not support exact reward package $${(event.rewardAmountCents / 100).toFixed(2)}.`,
      };
    }

    // 3. Build structured reward PurchaseIntent
    const intentId = `intent_bolt_${Date.now()}_${randomBytes(6).toString("hex")}`;
    const rawIntent: Omit<PurchaseIntent, "intentDigest"> = {
      intentId,
      idempotencyKey: `idem_bolt_${event.idempotencyKey}`,
      botId: "pixel",
      personaName: "Bolt",
      merchant: "bitrefill",
      recipient: contributorName,
      recipientId: contributorId,
      amountCents: matchedPkg.price,
      currency: event.currency,
      itemDescription: `Bounty Reward: ${event.reason}`,
      productId: product.id,
      denominationCents: matchedPkg.value,
      createdAt: new Date().toISOString(),
    };

    const intentDigest = this.gate.calculateDigest(rawIntent);
    const intent: PurchaseIntent = { ...rawIntent, intentDigest };

    // 4. Submit to Gate (Shared Financial Authority)
    const gateEval = this.gate.evaluateIntent(intent, ownerId);

    if (gateEval.decision === "DENY") {
      const reasons = gateEval.reasonCodes || [];
      this.updateBounty(event.id, {
        status: "REJECTED",
        purchaseIntentId: intentId,
      });

      return {
        success: false,
        bountyId: event.id,
        decision: "DENY",
        intent,
        reasonCodes: reasons,
        message: `Bounty reward denied by Gate: ${reasons.join(", ")}`,
      };
    }

    if (gateEval.decision === "REQUIRE_APPROVAL") {
      const reasons = gateEval.reasonCodes || [];
      this.updateBounty(event.id, {
        status: "AUTHORIZED",
        purchaseIntentId: intentId,
      });

      return {
        success: false,
        bountyId: event.id,
        decision: "REQUIRE_APPROVAL",
        intent,
        approvalId: gateEval.approvalId,
        reasonCodes: reasons,
        message: `Bounty reward requires owner approval (Approval ID: ${gateEval.approvalId}).`,
      };
    }

    // 5. ALLOW Outcome: SpendPass Issued -> Dispatch to Runner
    const spendpassToken = gateEval.spendpassToken || gateEval.spendpass?.token;
    if (!spendpassToken) {
      return {
        success: false,
        bountyId: event.id,
        decision: "DENY",
        intent,
        reasonCodes: ["SPENDPASS_GENERATION_FAILED"],
        message: "Gate approved bounty but SpendPass cryptographic token was not generated.",
      };
    }

    // 6. Execute purchase via Runner
    const execResult = await this.runner.executeSpendPass({
      spendpassToken,
      productId: product.id,
      denominationCents: matchedPkg.value,
      currency: event.currency,
      recipientId: contributorId,
      actor: "pixel",
      pollTimeoutMs: input.pollTimeoutMs,
    });

    if (execResult.success) {
      this.updateBounty(event.id, {
        status: "EXECUTED",
        purchaseIntentId: intentId,
        executionId: execResult.executionId,
      });
    } else {
      this.updateBounty(event.id, {
        status: "FAILED",
        purchaseIntentId: intentId,
        executionId: execResult.executionId,
      });
    }

    return {
      success: execResult.success,
      bountyId: event.id,
      decision: "ALLOW",
      intent,
      spendpassId: gateEval.spendpass?.id,
      execution: execResult.execution,
      executionResult: execResult,
      runnerResult: execResult,
      reasonCodes: execResult.reasonCodes,
      deliveryRef: execResult.deliveryRef,
      message: execResult.success
        ? `Bounty reward disbursed and verified delivered! Reference: ${execResult.deliveryRef}`
        : `Bounty execution ${execResult.status.toLowerCase()}: ${execResult.errorMessage || execResult.reasonCodes.join(", ")}`,
    };
  }

  /**
   * Helper Methods
   */
  public getBounty(id: string): BountyEvent | null {
    if (this.db) {
      return this.db.getBountyEvent(id);
    }
    return this.inMemoryBounties.get(id) || null;
  }

  public getBountyByIdempotencyKey(key: string): BountyEvent | null {
    if (this.db) {
      return this.db.getBountyEventByIdempotencyKey(key);
    }
    for (const b of this.inMemoryBounties.values()) {
      if (b.idempotencyKey === key) return b;
    }
    return null;
  }

  public listBounties(ownerId = "local-owner", limit = 50): BountyEvent[] {
    if (this.db) {
      return this.db.listBountyEvents(ownerId, limit);
    }
    return Array.from(this.inMemoryBounties.values()).slice(0, limit);
  }

  private updateBounty(id: string, patch: Partial<BountyEvent>): BountyEvent | null {
    if (this.db) {
      return this.db.updateBountyEvent(id, patch);
    }
    const existing = this.inMemoryBounties.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.inMemoryBounties.set(id, updated);
    return updated;
  }
}

let defaultBoltWorkflow: BoltWorkflowService | null = null;
export function getBoltWorkflow(db?: OpenBotDatabase): BoltWorkflowService {
  if (!defaultBoltWorkflow) {
    defaultBoltWorkflow = new BoltWorkflowService(undefined, undefined, db);
  } else if (db) {
    defaultBoltWorkflow.setDatabase(db);
  }
  return defaultBoltWorkflow;
}
