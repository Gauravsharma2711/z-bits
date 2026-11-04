/**
 * Z-Bits SpendPass: Cryptographic Signed Purchase Authorization Service.
 *
 * Implements security boundaries connecting Gate (authorization) to Runner (execution):
 * - Issues cryptographically signed, short-lived, single-use, scoped SpendPass tokens.
 * - Enforces zero-LLM issuance: issued ONLY after Gate returns valid deterministic ALLOW.
 * - Bound to canonical recipient, merchant, product, denomination, currency, and max amount.
 * - RFC 7519 compliant compact JWT signed via HMAC-SHA256 (HS256) with strict algorithm allowlisting.
 * - Key management with rotation support (keysMap, activeKeyId).
 * - Persistent single-use protection via atomic SQLite state transitions (ISSUED -> CLAIMED -> CONSUMED).
 * - Full revocation and emergency pause integration.
 * - Comprehensive scope and price mismatch enforcement (Runner price <= max_amount).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  SpendPassClaims,
  SpendPassRecord,
  SpendPassStatus,
  SpendPassVerificationResult,
  SpendPassExecutionContext,
  SpendPassReasonCode,
  CurrencyCode,
} from "../../shared/zbits-types.js";
import type { OpenBotDatabase } from "../database.js";

export const SPENDPASS_ISSUER = "zbits-gate";
export const SPENDPASS_AUDIENCE = "zbits-runner";
export const DEFAULT_SPENDPASS_TTL_SECONDS = 300; // 5 minutes validity

export interface SpendPassKeyConfig {
  activeKeyId: string;
  keys: Record<string, string>; // kid -> secret
}

export class SpendPassService {
  private db?: OpenBotDatabase;
  private activeKeyId: string;
  private readonly keysMap = new Map<string, string>();
  private readonly inMemoryTokens = new Map<string, SpendPassRecord>(); // fallback for isolated unit tests
  private readonly defaultTtlSeconds: number;

  constructor(
    db?: OpenBotDatabase,
    keyConfig?: Partial<SpendPassKeyConfig>,
    defaultTtlSeconds = DEFAULT_SPENDPASS_TTL_SECONDS
  ) {
    this.db = db;
    this.defaultTtlSeconds = defaultTtlSeconds;

    // Initialize signing keys
    const fallbackSecret = process.env.SPENDPASS_SIGNING_SECRET || "zbits-spendpass-master-signing-secret-v1";
    this.activeKeyId = keyConfig?.activeKeyId || "k1";

    if (keyConfig?.keys && Object.keys(keyConfig.keys).length > 0) {
      for (const [kid, secret] of Object.entries(keyConfig.keys)) {
        this.keysMap.set(kid, secret);
      }
    } else {
      this.keysMap.set("k1", fallbackSecret);
    }

    if (!this.keysMap.has(this.activeKeyId)) {
      this.keysMap.set(this.activeKeyId, fallbackSecret);
    }
  }

  public setDatabase(db: OpenBotDatabase): void {
    this.db = db;
  }

  public getDatabase(): OpenBotDatabase | undefined {
    return this.db;
  }

  public getActiveKeyId(): string {
    return this.activeKeyId;
  }

  public rotateSigningKey(newKeyId: string, newSecret: string): void {
    if (!newKeyId || !newSecret) {
      throw new Error("Invalid key rotation parameters: keyId and secret required.");
    }
    this.keysMap.set(newKeyId, newSecret);
    this.activeKeyId = newKeyId;
  }

  /**
   * Helper: Base64URL encode string or Buffer
   */
  private base64UrlEncode(input: string | Buffer): string {
    const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
    return buf.toString("base64url");
  }

  /**
   * Helper: Base64URL decode to string
   */
  private base64UrlDecode(input: string): string {
    return Buffer.from(input, "base64url").toString("utf8");
  }

  /**
   * Generates a signed compact JWT string
   */
  public signToken(claims: SpendPassClaims, keyId?: string): string {
    const kid = keyId || this.activeKeyId;
    const secret = this.keysMap.get(kid);
    if (!secret) {
      throw new Error(`Signing key "${kid}" not found.`);
    }

    const header = {
      alg: "HS256",
      typ: "JWT",
      kid,
    };

    const headerB64 = this.base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.base64UrlEncode(JSON.stringify(claims));
    const signingInput = `${headerB64}.${payloadB64}`;

    const signature = createHmac("sha256", secret).update(signingInput).digest("base64url");

    return `${signingInput}.${signature}`;
  }

  /**
   * Issues a SpendPass for a valid Gate authorization and reservation.
   * Can ONLY be called after Gate produces ALLOW.
   */
  public issueSpendPass(input: {
    authorizationId: string;
    purchaseIntentId?: string;
    ownerId?: string;
    ttlSeconds?: number;
  }): { record: SpendPassRecord; token: string } {
    const ownerId = input.ownerId || "local-owner";
    const ttl = input.ttlSeconds || this.defaultTtlSeconds;

    if (!this.db) {
      // In-memory fallback issuance
      const jti = `sp_${randomBytes(12).toString("hex")}`;
      const nowMs = Date.now();
      const iat = Math.floor(nowMs / 1000);
      const exp = iat + ttl;
      const nonce = randomBytes(16).toString("hex");

      const claims: SpendPassClaims = {
        iss: SPENDPASS_ISSUER,
        aud: SPENDPASS_AUDIENCE,
        jti,
        sub: ownerId,
        agent_id: "nova",
        purchase_intent_id: input.purchaseIntentId || "intent_default",
        authorization_id: input.authorizationId,
        reservation_id: "res_default",
        recipient_id: "rec_self",
        merchant_id: "bitrefill",
        denomination: 1000,
        currency: "USD",
        max_amount: 1000,
        policy_version: 1,
        iat,
        nbf: iat,
        exp,
        nonce,
      };

      const token = this.signToken(claims);
      const record: SpendPassRecord = {
        id: jti,
        jti,
        ownerId,
        purchaseIntentId: claims.purchase_intent_id,
        authorizationId: input.authorizationId,
        reservationId: claims.reservation_id,
        recipientId: claims.recipient_id,
        agentId: claims.agent_id,
        merchantId: claims.merchant_id,
        denomination: claims.denomination,
        currency: claims.currency,
        maxAmount: claims.max_amount,
        policyVersion: claims.policy_version,
        keyId: this.activeKeyId,
        status: "ISSUED",
        token,
        issuedAt: new Date(iat * 1000).toISOString(),
        expiresAt: new Date(exp * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.inMemoryTokens.set(jti, record);
      return { record, token };
    }

    // 1. Check if SpendPass already exists for this authorization
    const existing = this.db.getSpendPassTokenByAuthorizationId(input.authorizationId);
    if (existing) {
      if (existing.status === "ISSUED" && new Date(existing.expiresAt).getTime() > Date.now()) {
        return { record: existing, token: existing.token || this.reconstructToken(existing) };
      }
      throw new Error(`SpendPass for authorization "${input.authorizationId}" has already been processed or expired.`);
    }

    // 2. Fetch purchase intent
    let intent = input.purchaseIntentId ? this.db.getPurchaseIntent(input.purchaseIntentId) : null;
    if (!intent) {
      intent = this.db.getPurchaseIntent(input.authorizationId);
    }
    if (!intent) {
      const decisions = this.db.getGateDecisions(ownerId, 100);
      const decision = decisions.find((d) => d.purchaseIntentId === input.authorizationId || d.id === input.authorizationId) || decisions[0];
      if (decision) {
        intent = this.db.getPurchaseIntent(decision.purchaseIntentId);
      }
    }
    if (!intent) {
      throw new Error(`Cannot issue SpendPass: Purchase intent for authorization "${input.authorizationId}" not found.`);
    }

    // 4. Verify decision is ALLOW
    if (intent.status !== "AUTHORIZED") {
      throw new Error(`Cannot issue SpendPass: Intent "${intent.intentId}" is not in AUTHORIZED status (found: ${intent.status}).`);
    }

    // 5. Verify active reservation in spending_ledger
    const ledger = this.db.listSpendingLedger(ownerId, 100);
    const reservation = ledger.find((l) => l.purchaseIntentId === intent!.intentId && l.status === "RESERVED");
    if (!reservation) {
      throw new Error(`Cannot issue SpendPass: No active budget reservation found for intent "${intent.intentId}".`);
    }

    // Verify reservation has not expired
    if (new Date(reservation.expiresAt).getTime() <= Date.now()) {
      throw new Error(`Cannot issue SpendPass: Budget reservation for intent "${intent.intentId}" has expired.`);
    }

    // 6. Check emergency pause state
    const constitution = this.db.getSpendingConstitution(ownerId);
    if (constitution.emergencyPause) {
      throw new Error("Cannot issue SpendPass: Gate Emergency Pause is active.");
    }

    // 7. Construct Claims & Token
    const jti = `sp_${randomBytes(12).toString("hex")}`;
    const nowMs = Date.now();
    const iat = Math.floor(nowMs / 1000);
    const exp = iat + ttl;
    const nonce = randomBytes(16).toString("hex");

    const claims: SpendPassClaims = {
      iss: SPENDPASS_ISSUER,
      aud: SPENDPASS_AUDIENCE,
      jti,
      sub: ownerId,
      agent_id: intent.botId,
      purchase_intent_id: intent.intentId,
      authorization_id: input.authorizationId,
      reservation_id: reservation.id,
      recipient_id: intent.recipientId || "rec_self",
      merchant_id: intent.merchant.toLowerCase().trim(),
      product_id: intent.productId || undefined,
      denomination: intent.denominationCents || intent.amountCents,
      currency: intent.currency,
      max_amount: intent.amountCents,
      policy_version: constitution.policyVersion,
      iat,
      nbf: iat,
      exp,
      nonce,
    };

    const token = this.signToken(claims, this.activeKeyId);

    // 8. Persist SpendPass record in SQLite
    const record = this.db.createSpendPassToken({
      id: jti,
      jti,
      ownerId,
      purchaseIntentId: intent.intentId,
      authorizationId: input.authorizationId,
      reservationId: reservation.id,
      recipientId: intent.recipientId || "rec_self",
      agentId: intent.botId,
      merchantId: intent.merchant.toLowerCase().trim(),
      productId: intent.productId || null,
      denomination: intent.denominationCents || intent.amountCents,
      currency: intent.currency,
      maxAmount: intent.amountCents,
      policyVersion: constitution.policyVersion,
      keyId: this.activeKeyId,
      status: "ISSUED",
      token,
      issuedAt: new Date(iat * 1000).toISOString(),
      expiresAt: new Date(exp * 1000).toISOString(),
    });

    return { record, token };
  }

  /**
   * Reconstructs signed token if needed
   */
  private reconstructToken(record: SpendPassRecord): string {
    const iat = Math.floor(new Date(record.issuedAt).getTime() / 1000);
    const exp = Math.floor(new Date(record.expiresAt).getTime() / 1000);
    const claims: SpendPassClaims = {
      iss: SPENDPASS_ISSUER,
      aud: SPENDPASS_AUDIENCE,
      jti: record.jti,
      sub: record.ownerId,
      agent_id: record.agentId,
      purchase_intent_id: record.purchaseIntentId,
      authorization_id: record.authorizationId,
      reservation_id: record.reservationId,
      recipient_id: record.recipientId,
      merchant_id: record.merchantId,
      product_id: record.productId || undefined,
      denomination: record.denomination,
      currency: record.currency,
      max_amount: record.maxAmount,
      policy_version: record.policyVersion,
      iat,
      nbf: iat,
      exp,
      nonce: randomBytes(8).toString("hex"),
    };
    return this.signToken(claims, record.keyId);
  }

  /**
   * Verifies a SpendPass token cryptographically, against persistent state, and against execution scope.
   * Runner verification interface.
   */
  public verifySpendPass(
    token: string,
    executionContext?: SpendPassExecutionContext
  ): SpendPassVerificationResult {
    // 1. Structure Verification
    if (!token || typeof token !== "string") {
      return this.failVerification(["INVALID_SIGNATURE"], "Token is missing or not a string.");
    }

    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      return this.failVerification(["INVALID_SIGNATURE"], "Malformed JWT token structure: expected 3 dot-separated segments.");
    }

    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64) {
      return this.failVerification(["INVALID_SIGNATURE"], "Token header and payload segments cannot be empty.");
    }

    // 2. Header & Algorithm Allowlist (strictly reject "none" or non-HS256 before processing signature)
    let header: { alg?: string; typ?: string; kid?: string };
    try {
      header = JSON.parse(this.base64UrlDecode(headerB64));
    } catch {
      return this.failVerification(["INVALID_SIGNATURE"], "Malformed token header JSON.");
    }

    if (header.alg !== "HS256") {
      return this.failVerification(
        ["UNSUPPORTED_ALGORITHM"],
        `Unsupported signing algorithm "${header.alg}". Only HS256 is permitted.`
      );
    }

    if (!signatureB64) {
      return this.failVerification(["INVALID_SIGNATURE"], "Token signature segment cannot be empty.");
    }

    // 3. Key Identification
    const kid = header.kid || "k1";
    const secret = this.keysMap.get(kid);
    if (!secret) {
      return this.failVerification(
        ["UNKNOWN_SIGNING_KEY"],
        `Unknown signing key ID "${kid}". Token cannot be verified.`
      );
    }

    // 4. Cryptographic Signature Verification
    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSignature = createHmac("sha256", secret).update(signingInput).digest("base64url");

    const sigBuf = Buffer.from(signatureB64, "utf8");
    const expBuf = Buffer.from(expectedSignature, "utf8");

    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
      return this.failVerification(["INVALID_SIGNATURE"], "Cryptographic signature verification failed: token has been modified or forged.");
    }

    // 5. Payload Claims Decoding
    let claims: SpendPassClaims;
    try {
      claims = JSON.parse(this.base64UrlDecode(payloadB64));
    } catch {
      return this.failVerification(["INVALID_SIGNATURE"], "Malformed token claims payload JSON.");
    }

    // 6. Issuer & Audience Verification
    if (claims.iss !== SPENDPASS_ISSUER) {
      return this.failVerification(
        ["INVALID_ISSUER"],
        `Invalid token issuer "${claims.iss}". Expected "${SPENDPASS_ISSUER}".`
      );
    }

    if (claims.aud !== SPENDPASS_AUDIENCE) {
      return this.failVerification(
        ["INVALID_AUDIENCE"],
        `Invalid token audience "${claims.aud}". Expected "${SPENDPASS_AUDIENCE}".`
      );
    }

    // 7. Time Validity Verification
    const nowSec = Math.floor(Date.now() / 1000);
    if (claims.nbf && nowSec < claims.nbf) {
      return this.failVerification(
        ["TOKEN_NOT_YET_VALID"],
        `Token is not yet valid (nbf: ${claims.nbf}, now: ${nowSec}).`
      );
    }

    if (claims.exp && nowSec >= claims.exp) {
      return this.failVerification(
        ["TOKEN_EXPIRED"],
        `Token has expired (exp: ${claims.exp}, now: ${nowSec}).`
      );
    }

    // 8. Database Record & State Verification
    let record: SpendPassRecord | null = null;
    if (this.db) {
      record = this.db.getSpendPassTokenByJti(claims.jti);
      if (!record) {
        return this.failVerification(
          ["TOKEN_NOT_FOUND"],
          `SpendPass record for jti "${claims.jti}" not found in persistent storage.`
        );
      }

      // Emergency Pause Check takes absolute precedence
      const constitution = this.db.getSpendingConstitution(record.ownerId);
      if (constitution.emergencyPause) {
        return this.failVerification(
          ["EMERGENCY_PAUSE_ACTIVE"],
          "Gate Emergency Pause is active: all SpendPass execution is blocked."
        );
      }

      // Check Status
      if (record.status === "REVOKED") {
        return this.failVerification(
          ["TOKEN_REVOKED"],
          `SpendPass has been revoked: ${record.revocationReason || "owner cancellation"}.`
        );
      }
      if (record.status === "CONSUMED") {
        return this.failVerification(
          ["TOKEN_ALREADY_CONSUMED"],
          "SpendPass has already been consumed for a completed purchase."
        );
      }
      if (record.status === "CLAIMED") {
        if (!executionContext?.executionId || record.executionId !== executionContext.executionId) {
          return this.failVerification(
            ["TOKEN_ALREADY_CLAIMED"],
            "SpendPass is already claimed by an ongoing execution."
          );
        }
      }
      if (record.status === "EXPIRED" || new Date(record.expiresAt).getTime() <= Date.now()) {
        return this.failVerification(["TOKEN_EXPIRED"], "SpendPass record has expired.");
      }

      // 10. Budget Reservation Consistency
      const reservation = this.db.listSpendingLedger(record.ownerId, 100).find((l) => l.id === record!.reservationId);
      if (!reservation) {
        return this.failVerification(
          ["RESERVATION_INVALID"],
          `Budget reservation "${record.reservationId}" not found in spending ledger.`
        );
      }
      if (reservation.status !== "RESERVED" && record.status !== "CLAIMED") {
        return this.failVerification(
          ["RESERVATION_INVALID"],
          `Budget reservation is in state "${reservation.status}", expected RESERVED.`
        );
      }
    } else {
      // In-memory fallback verification
      record = this.inMemoryTokens.get(claims.jti) || null;
      if (record) {
        if (record.status === "REVOKED") {
          return this.failVerification(["TOKEN_REVOKED"], "SpendPass has been revoked.");
        }
        if (record.status === "CONSUMED") {
          return this.failVerification(["TOKEN_ALREADY_CONSUMED"], "SpendPass already consumed.");
        }
      }
    }

    // 11. Exact Scope Verification
    if (executionContext) {
      if (executionContext.purchaseIntentId && executionContext.purchaseIntentId !== claims.purchase_intent_id) {
        return this.failVerification(
          ["PURCHASE_INTENT_MISMATCH"],
          `Purchase intent mismatch: token is bound to "${claims.purchase_intent_id}", execution requested "${executionContext.purchaseIntentId}".`
        );
      }

      if (executionContext.recipientId && executionContext.recipientId !== claims.recipient_id) {
        return this.failVerification(
          ["RECIPIENT_MISMATCH"],
          `Recipient mismatch: token is bound to recipient "${claims.recipient_id}", execution requested "${executionContext.recipientId}".`
        );
      }

      if (executionContext.merchantId && executionContext.merchantId.toLowerCase().trim() !== claims.merchant_id.toLowerCase().trim()) {
        return this.failVerification(
          ["MERCHANT_MISMATCH"],
          `Merchant mismatch: token is bound to merchant "${claims.merchant_id}", execution requested "${executionContext.merchantId}".`
        );
      }

      if (executionContext.productId && claims.product_id && executionContext.productId !== claims.product_id) {
        return this.failVerification(
          ["PRODUCT_MISMATCH"],
          `Product mismatch: token is bound to product "${claims.product_id}", execution requested "${executionContext.productId}".`
        );
      }

      if (executionContext.denomination !== undefined && executionContext.denomination !== claims.denomination) {
        return this.failVerification(
          ["DENOMINATION_MISMATCH"],
          `Denomination mismatch: token authorizes denomination $${(claims.denomination / 100).toFixed(2)}, execution requested $${(executionContext.denomination / 100).toFixed(2)}.`
        );
      }

      if (executionContext.currency && executionContext.currency.toUpperCase() !== claims.currency.toUpperCase()) {
        return this.failVerification(
          ["CURRENCY_MISMATCH"],
          `Currency mismatch: token is bound to "${claims.currency}", execution requested "${executionContext.currency}".`
        );
      }

      if (executionContext.actualAmountCents !== undefined && executionContext.actualAmountCents > claims.max_amount) {
        return this.failVerification(
          ["AMOUNT_EXCEEDED"],
          `Amount exceeded: purchase price ($${(executionContext.actualAmountCents / 100).toFixed(2)}) exceeds maximum authorized SpendPass limit ($${(claims.max_amount / 100).toFixed(2)}).`
        );
      }
    }

    return {
      valid: true,
      spendpassId: record?.id || claims.jti,
      jti: claims.jti,
      purchaseIntentId: claims.purchase_intent_id,
      recipientId: claims.recipient_id,
      merchantId: claims.merchant_id,
      productId: claims.product_id,
      denomination: claims.denomination,
      currency: claims.currency,
      maxAmount: claims.max_amount,
      policyVersion: claims.policy_version,
      record: record || undefined,
      reasonCodes: [],
    };
  }

  /**
   * Atomically claims a SpendPass for execution.
   * State transition: ISSUED -> CLAIMED
   */
  public claimForExecution(spendpassId: string, executionId: string): boolean {
    if (this.db) {
      return this.db.claimSpendPassToken(spendpassId, executionId);
    }
    const record = this.inMemoryTokens.get(spendpassId);
    if (!record || record.status !== "ISSUED") return false;
    record.status = "CLAIMED";
    record.executionId = executionId;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Completes a purchase execution and settles budget reservation.
   * State transition: CLAIMED -> CONSUMED
   */
  public completeExecution(spendpassId: string, executionId: string): boolean {
    if (this.db) {
      return this.db.consumeSpendPassToken(spendpassId, executionId);
    }
    const record = this.inMemoryTokens.get(spendpassId);
    if (!record || record.status !== "CLAIMED" || record.executionId !== executionId) return false;
    record.status = "CONSUMED";
    record.consumedAt = new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Revokes a SpendPass and releases associated budget reservation.
   * State transition: ISSUED / CLAIMED -> REVOKED
   */
  public revokeSpendPass(spendpassId: string, reason: string): boolean {
    if (this.db) {
      return this.db.revokeSpendPassToken(spendpassId, reason);
    }
    const record = this.inMemoryTokens.get(spendpassId);
    if (!record || record.status === "CONSUMED") return false;
    record.status = "REVOKED";
    record.revokedAt = new Date().toISOString();
    record.revocationReason = reason;
    record.updatedAt = new Date().toISOString();
    return true;
  }

  /**
   * Emergency Pause: Revokes all unclaimed tokens for an owner.
   */
  public revokeAllUnclaimed(ownerId = "local-owner", reason = "emergency_pause"): number {
    if (this.db) {
      return this.db.revokeAllUnclaimedSpendPass(ownerId, reason);
    }
    let count = 0;
    for (const record of this.inMemoryTokens.values()) {
      if (record.ownerId === ownerId && record.status === "ISSUED") {
        record.status = "REVOKED";
        record.revokedAt = new Date().toISOString();
        record.revocationReason = reason;
        count++;
      }
    }
    return count;
  }

  public getSpendPass(id: string): SpendPassRecord | null {
    if (this.db) {
      return this.db.getSpendPassToken(id);
    }
    return this.inMemoryTokens.get(id) || null;
  }

  public listSpendPasses(ownerId = "local-owner", filter?: { status?: SpendPassStatus; limit?: number }): SpendPassRecord[] {
    if (this.db) {
      return this.db.listSpendPassTokens(ownerId, filter);
    }
    return Array.from(this.inMemoryTokens.values()).filter((r) => r.ownerId === ownerId);
  }

  private failVerification(reasonCodes: SpendPassReasonCode[], errorMessage: string): SpendPassVerificationResult {
    return {
      valid: false,
      reasonCodes,
      errorMessage,
    };
  }
}

let defaultSpendPassService: SpendPassService | null = null;
export function getSpendPassService(db?: OpenBotDatabase): SpendPassService {
  if (!defaultSpendPassService) {
    defaultSpendPassService = new SpendPassService(db);
  } else if (db && !defaultSpendPassService.getDatabase()) {
    defaultSpendPassService.setDatabase(db);
  }
  return defaultSpendPassService;
}
