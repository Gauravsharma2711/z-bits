/**
 * Z-Bits Maya — Concierge Bit Workflow Service
 *
 * Responsibilities:
 * 1. Understands natural language gifting, top-up, and purchase requests.
 * 2. Extracts recipient, product/category, denomination, currency, and instructions.
 * 3. Resolves recipient alias through Gate's canonical registry (rejects ambiguous LLM guessing).
 * 4. Discovers valid products and supported denomination packages via Runner.
 * 5. Generates a clear purchase proposal before intent creation.
 * 6. Builds a structured PurchaseIntent and submits it to Gate.
 * 7. Executes authorized purchases strictly through SpendPass and Runner.
 * 8. Tracks invoice and delivery status (Paid != Delivered).
 *
 * Security Invariants:
 * - Maya is a request source, NOT a financial authority.
 * - Never approves its own spending requests.
 * - Never modifies spending limits or policy.
 * - Never signs SpendPass tokens or accesses private signing keys.
 * - Never calls Bitrefill or merchant APIs directly.
 */

import { randomBytes } from "node:crypto";
import type {
  PurchaseIntent,
  CanonicalRecipient,
  MayaIntentExtraction,
  MayaPurchaseProposal,
  MayaWorkflowResult,
  CurrencyCode,
  GateDecisionOutcome,
} from "../../shared/zbits-types.js";
import { GateEngine, getGateEngine } from "../gate/gate-engine.js";
import { CommerceRunner, getCommerceRunner } from "../runner/commerce-runner.js";
import type { OpenBotDatabase } from "../database.js";

export class MayaWorkflowService {
  private gate: GateEngine;
  private runner: CommerceRunner;
  private db?: OpenBotDatabase;

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
   * 1. Natural Language Request Understanding & Entity Extraction
   */
  public async parseRequest(
    userMessage: string,
    ownerId = "local-owner"
  ): Promise<MayaIntentExtraction> {
    const text = userMessage.trim();
    const missingFields: string[] = [];

    // Currency & Amount extraction (e.g. "$50", "50 USD", "50 dollars", "€20", "20 eur")
    let denominationCents: number | undefined;
    let currency: CurrencyCode = "USD";

    const dollarMatch = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/i) ||
      text.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars?|usd)/i);
    const eurMatch = text.match(/€\s*(\d+(?:\.\d{1,2})?)/i) ||
      text.match(/(\d+(?:\.\d{1,2})?)\s*(?:euros?|eur)/i);

    if (dollarMatch) {
      denominationCents = Math.round(parseFloat(dollarMatch[1]) * 100);
      currency = "USD";
    } else if (eurMatch) {
      denominationCents = Math.round(parseFloat(eurMatch[1]) * 100);
      currency = "EUR";
    }

    if (!denominationCents) {
      missingFields.push("denomination");
    }

    // Recipient extraction
    let recipientAlias: string | undefined;
    let isAmbiguous = false;
    let canonicalRecipientId: string | undefined;

    // Common patterns: "buy [Recipient] a...", "for [Recipient]", "send [Recipient]..."
    const recipientPatterns = [
      /(?:buy|gift|send|get)\s+([A-Za-z0-9_\-\.]+)\s+(?:a|an|\$|\d+)/i,
      /(?:for|to)\s+([A-Za-z0-9_\-\.]+)/i,
      /(?:reward|top\s*up)\s+([A-Za-z0-9_\-\.]+)/i,
    ];

    for (const pat of recipientPatterns) {
      const match = text.match(pat);
      if (match && match[1]) {
        const candidate = match[1].trim();
        // Ignore noise words
        if (!["a", "an", "the", "me", "gift", "card", "voucher"].includes(candidate.toLowerCase())) {
          recipientAlias = candidate;
          break;
        }
      }
    }

    if (text.toLowerCase().includes("for myself") || text.toLowerCase().includes("to me") || text.toLowerCase().includes("for me")) {
      recipientAlias = "self";
    }

    if (!recipientAlias) {
      missingFields.push("recipient");
    } else {
      // Resolve through Gate's canonical registry
      const resolution = this.resolveRecipientSafely(recipientAlias, ownerId);
      if (resolution.status === "RESOLVED" && resolution.recipient) {
        canonicalRecipientId = resolution.recipient.id;
      } else if (resolution.status === "AMBIGUOUS") {
        isAmbiguous = true;
      } else {
        // Unresolved / unknown recipient alias
        isAmbiguous = true;
      }
    }

    // Product or category query extraction
    let productQuery: string | undefined;
    const productKeywords = ["steam", "amazon", "uber", "doordash", "apple", "google play", "netflix", "airbnb", "spotify"];
    for (const kw of productKeywords) {
      if (text.toLowerCase().includes(kw)) {
        productQuery = kw;
        break;
      }
    }
    if (!productQuery && (text.toLowerCase().includes("gift card") || text.toLowerCase().includes("voucher"))) {
      productQuery = "gift card";
    }

    if (!productQuery) {
      missingFields.push("product");
    }

    // Occasion extraction
    let occasion: string | undefined;
    const occasions = ["birthday", "anniversary", "christmas", "holiday", "congratulations", "bonus", "thank you"];
    for (const occ of occasions) {
      if (text.toLowerCase().includes(occ)) {
        occasion = occ;
        break;
      }
    }

    let clarificationPrompt: string | undefined;
    if (isAmbiguous) {
      clarificationPrompt = `I noticed the recipient "${recipientAlias}" is not uniquely registered or is ambiguous. Could you please specify their exact registered name or alias?`;
    } else if (missingFields.length > 0) {
      clarificationPrompt = `I'd love to help with that! Could you please specify the ${missingFields.join(" and ")}?`;
    }

    return {
      rawQuery: text,
      recipientAlias,
      canonicalRecipientId,
      productQuery,
      denominationCents,
      currency,
      maxAmountCents: denominationCents,
      occasion,
      isAmbiguous,
      missingFields,
      needsClarification: Boolean(isAmbiguous || missingFields.length > 0),
      clarificationPrompt,
    };
  }

  /**
   * 2. Product Discovery & Purchase Proposal Generation
   */
  public async createProposal(input: {
    recipientAlias: string;
    productQuery: string;
    denominationCents?: number;
    currency?: CurrencyCode;
    ownerId?: string;
  }): Promise<MayaPurchaseProposal> {
    const ownerId = input.ownerId || "local-owner";
    const currency = input.currency || "USD";

    // 1. Resolve recipient
    const resolution = this.resolveRecipientSafely(input.recipientAlias, ownerId);
    if (resolution.status !== "RESOLVED" || !resolution.recipient) {
      throw new Error(`Cannot generate proposal: recipient "${input.recipientAlias}" is ${resolution.status.toLowerCase()}.`);
    }
    const recipient = resolution.recipient;

    // 2. Discover products via Runner
    const products = await this.runner.searchProducts(input.productQuery);
    if (!products || products.length === 0) {
      throw new Error(`No available Bitrefill products matched query "${input.productQuery}".`);
    }

    // Select the best matching available product
    const selectedProduct = products.find((p) => p.isAvailable) || products[0];

    // Find requested denomination package or closest supported tier
    let chosenPackage = selectedProduct.packages.find((pkg) => pkg.value === input.denominationCents);
    if (!chosenPackage && selectedProduct.packages.length > 0) {
      if (input.denominationCents) {
        // Find nearest equal or greater package
        chosenPackage = selectedProduct.packages.find((pkg) => pkg.value >= input.denominationCents!) || selectedProduct.packages[0];
      } else {
        chosenPackage = selectedProduct.packages[0];
      }
    }

    if (!chosenPackage) {
      throw new Error(`Product "${selectedProduct.name}" does not offer supported package denominations.`);
    }

    // 3. Check if owner approval will be required
    const constitution = this.gate.getConstitution(ownerId);
    const requiresApproval = chosenPackage.price > constitution.requireApprovalAboveCents;

    return {
      proposalId: `prop_maya_${Date.now()}_${randomBytes(4).toString("hex")}`,
      recipientName: recipient.displayName,
      recipientId: recipient.id,
      productName: selectedProduct.name,
      productId: selectedProduct.id,
      denominationCents: chosenPackage.value,
      estimatedPriceCents: chosenPackage.price,
      currency,
      merchant: "bitrefill",
      requiresApproval,
      notes: requiresApproval
        ? `Order amount exceeds single-order threshold ($${(constitution.maxPerOrderCents / 100).toFixed(2)}) and will require your explicit approval.`
        : undefined,
    };
  }

  /**
   * 3. End-to-End Purchase Execution:
   * Builds PurchaseIntent -> Submits to Gate -> If ALLOW, triggers Runner -> Tracks Delivery
   */
  public async submitPurchase(input: {
    recipientAlias: string;
    productId: string;
    denominationCents: number;
    currency?: CurrencyCode;
    occasion?: string;
    instructions?: string;
    ownerId?: string;
    idempotencyKey?: string;
    pollTimeoutMs?: number;
  }): Promise<MayaWorkflowResult> {
    const ownerId = input.ownerId || "local-owner";
    const currency = input.currency || "USD";

    // 1. Resolve canonical recipient through Gate
    const resolution = this.resolveRecipientSafely(input.recipientAlias, ownerId);
    if (resolution.status !== "RESOLVED" || !resolution.recipient) {
      return {
        success: false,
        decision: "DENY",
        reasonCodes: [resolution.status === "AMBIGUOUS" ? "RECIPIENT_AMBIGUOUS" : "RECIPIENT_NOT_FOUND"],
        message: `Recipient "${input.recipientAlias}" could not be resolved to a registered canonical recipient.`,
      };
    }
    const canonicalRecipient = resolution.recipient;

    // 2. Retrieve product details
    const product = await this.runner.getProduct(input.productId);
    if (!product || !product.isAvailable) {
      return {
        success: false,
        decision: "DENY",
        reasonCodes: ["PRODUCT_UNAVAILABLE"],
        message: `Product "${input.productId}" is currently unavailable or out of stock.`,
      };
    }

    const pkg = product.packages.find((p) => p.value === input.denominationCents);
    if (!pkg) {
      return {
        success: false,
        decision: "DENY",
        reasonCodes: ["DENOMINATION_INVALID"],
        message: `Product "${product.name}" does not offer a $${(input.denominationCents / 100).toFixed(2)} denomination package.`,
      };
    }

    // 3. Build structured PurchaseIntent
    const intentId = `intent_maya_${Date.now()}_${randomBytes(6).toString("hex")}`;
    const idempotencyKey = input.idempotencyKey || `idem_maya_${Date.now()}_${randomBytes(6).toString("hex")}`;
    const rawIntent: Omit<PurchaseIntent, "intentDigest"> = {
      intentId,
      idempotencyKey,
      botId: "nova",
      personaName: "Maya",
      merchant: "bitrefill",
      recipient: canonicalRecipient.displayName,
      recipientId: canonicalRecipient.id,
      amountCents: pkg.price,
      currency,
      itemDescription: `${product.name} $${(pkg.value / 100).toFixed(2)}`,
      productId: product.id,
      denominationCents: pkg.value,
      createdAt: new Date().toISOString(),
    };

    const intentDigest = this.gate.calculateDigest(rawIntent);
    const purchaseIntent: PurchaseIntent = { ...rawIntent, intentDigest };

    // 4. Submit Intent to Gate (Deterministic Financial Engine)
    const gateEval = this.gate.evaluateIntent(purchaseIntent, ownerId);

    if (gateEval.decision === "DENY") {
      const reasons = gateEval.reasonCodes || [];
      return {
        success: false,
        decision: "DENY",
        intent: purchaseIntent,
        reasonCodes: reasons,
        message: `Purchase denied by Gate: ${reasons.join(", ")}`,
      };
    }

    if (gateEval.decision === "REQUIRE_APPROVAL") {
      const reasons = gateEval.reasonCodes || [];
      return {
        success: false,
        decision: "REQUIRE_APPROVAL",
        intent: purchaseIntent,
        approvalId: gateEval.approvalId,
        reasonCodes: reasons,
        message: `Purchase requires owner approval (Approval ID: ${gateEval.approvalId}).`,
      };
    }

    // 5. ALLOW Outcome: SpendPass Issued -> Dispatch to Runner
    const spendpassToken = gateEval.spendpassToken || gateEval.spendpass?.token;
    if (!spendpassToken) {
      return {
        success: false,
        decision: "DENY",
        intent: purchaseIntent,
        reasonCodes: ["SPENDPASS_GENERATION_FAILED"],
        message: "Gate approved purchase but SpendPass cryptographic token was not generated.",
      };
    }

    // 6. Execute via Runner
    const execResult = await this.runner.executeSpendPass({
      spendpassToken,
      productId: product.id,
      denominationCents: pkg.value,
      currency,
      recipientId: canonicalRecipient.id,
      actor: "nova",
      pollTimeoutMs: input.pollTimeoutMs,
    });

    return {
      success: execResult.success,
      decision: "ALLOW",
      intent: purchaseIntent,
      spendpassId: gateEval.spendpass?.id,
      executionId: execResult.executionId,
      execution: execResult.execution,
      executionResult: execResult,
      runnerResult: execResult,
      reasonCodes: execResult.reasonCodes,
      deliveryRef: execResult.deliveryRef,
      message: execResult.success
        ? `Purchase completed and verified delivered! Reference: ${execResult.deliveryRef}`
        : `Purchase execution ${execResult.status.toLowerCase()}: ${execResult.errorMessage || execResult.reasonCodes.join(", ")}`,
    };
  }

  /**
   * 4. Status Tracking Helper
   */
  public async getPurchaseStatus(executionId: string) {
    const execution = this.runner.getExecution(executionId);
    if (!execution) return null;
    const invoice = execution.invoiceId ? this.runner.getInvoice(execution.invoiceId) : null;
    return { execution, invoice };
  }
}

let defaultMayaWorkflow: MayaWorkflowService | null = null;
export function getMayaWorkflow(db?: OpenBotDatabase): MayaWorkflowService {
  if (!defaultMayaWorkflow) {
    defaultMayaWorkflow = new MayaWorkflowService(undefined, undefined, db);
  } else if (db) {
    defaultMayaWorkflow.setDatabase(db);
  }
  return defaultMayaWorkflow;
}
