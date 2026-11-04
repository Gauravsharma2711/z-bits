import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHmac } from "node:crypto";
import { GateEngine, DEFAULT_SPENDING_POLICY } from "./gate-engine.js";
import { SpendPassService } from "./spendpass-service.js";
import { OpenBotDatabase } from "../database.js";
import type { PurchaseIntent, SpendPassClaims } from "../../shared/zbits-types.js";

function setupTestEnv() {
  const root = mkdtempSync(path.join(tmpdir(), "gate-spendpass-test-"));
  const db = new OpenBotDatabase(root);
  const gate = new GateEngine(db, undefined, "test-gate-secret-key-67890");
  const spendPassService = gate.getSpendPassService();
  return { root, db, gate, spendPassService };
}

function makeIntent(gate: GateEngine, overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  const raw: Omit<PurchaseIntent, "intentDigest"> = {
    intentId: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    idempotencyKey: `idem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    botId: "nova",
    personaName: "Maya",
    merchant: "bitrefill",
    recipient: "self",
    amountCents: 1500, // $15.00
    currency: "USD",
    itemDescription: "Steam digital voucher",
    productId: "steam_15",
    denominationCents: 1500,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  return { ...raw, intentDigest: gate.calculateDigest(raw) };
}

test("SpendPass Suite 1: Issuance & Gate Integration", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, { amountCents: 1500 });
    const evalResult = gate.evaluateIntent(intent);

    assert.equal(evalResult.allowed, true);
    assert.equal(evalResult.decision, "ALLOW");
    assert.ok(evalResult.signedAuthorization);
    assert.ok(evalResult.reservation);

    // SpendPass automatically issued upon ALLOW
    assert.ok(evalResult.spendpass);
    assert.ok(evalResult.spendpassToken);
    assert.equal(evalResult.spendpass.status, "ISSUED");
    assert.equal(evalResult.spendpass.purchaseIntentId, intent.intentId);
    assert.equal(evalResult.spendpass.maxAmount, 1500);
    assert.equal(evalResult.spendpass.merchantId, "bitrefill");

    // SpendPass record exists in SQLite
    const persisted = db.getSpendPassToken(evalResult.spendpass.id);
    assert.ok(persisted);
    assert.equal(persisted.status, "ISSUED");
    assert.equal(persisted.reservationId, evalResult.reservation.id);

    // Calling issueSpendPass again for an already active authorization returns the existing SpendPass idempotently
    const duplicate = spendPassService.issueSpendPass({
      authorizationId: evalResult.signedAuthorization!.authorizationId,
      purchaseIntentId: intent.intentId,
    });
    assert.equal(duplicate.record.id, evalResult.spendpass.id);
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 2: Cryptographic Validation & Integrity", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, { amountCents: 1500 });
    const evalResult = gate.evaluateIntent(intent);
    const token = evalResult.spendpassToken!;

    // 1. Valid token passes verification
    const validResult = spendPassService.verifySpendPass(token);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.maxAmount, 1500);
    assert.equal(validResult.merchantId, "bitrefill");

    // 2. Tampered payload is rejected (e.g. attacker modifies max_amount to 9999)
    const [headerB64, payloadB64, sigB64] = token.split(".");
    const decodedPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    decodedPayload.max_amount = 999999;
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(decodedPayload)).toString("base64url");
    const tamperedToken = `${headerB64}.${tamperedPayloadB64}.${sigB64}`;

    const tamperedResult = spendPassService.verifySpendPass(tamperedToken);
    assert.equal(tamperedResult.valid, false);
    assert.ok(tamperedResult.reasonCodes.includes("INVALID_SIGNATURE"));

    // 3. Tampered signature is rejected
    const badSigToken = `${headerB64}.${payloadB64}.invalidsignaturestring`;
    const badSigResult = spendPassService.verifySpendPass(badSigToken);
    assert.equal(badSigResult.valid, false);
    assert.ok(badSigResult.reasonCodes.includes("INVALID_SIGNATURE"));

    // 4. "alg: none" attack is rejected
    const algNoneHeaderB64 = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const algNoneToken = `${algNoneHeaderB64}.${payloadB64}.`;
    const algNoneResult = spendPassService.verifySpendPass(algNoneToken);
    assert.equal(algNoneResult.valid, false);
    assert.ok(algNoneResult.reasonCodes.includes("UNSUPPORTED_ALGORITHM"));

    // 5. Unknown Key ID (kid) is rejected
    const unknownKidHeaderB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT", kid: "unknown_key_999" })).toString("base64url");
    const unknownKidToken = `${unknownKidHeaderB64}.${payloadB64}.${sigB64}`;
    const unknownKidResult = spendPassService.verifySpendPass(unknownKidToken);
    assert.equal(unknownKidResult.valid, false);
    assert.ok(unknownKidResult.reasonCodes.includes("UNKNOWN_SIGNING_KEY"));

    // 6. Expired token is rejected
    const expiredClaims: SpendPassClaims = {
      ...decodedPayload,
      jti: "sp_expired_test",
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1800, // expired 30 mins ago
    };
    const expiredToken = spendPassService.signToken(expiredClaims);
    const expiredResult = spendPassService.verifySpendPass(expiredToken);
    assert.equal(expiredResult.valid, false);
    assert.ok(expiredResult.reasonCodes.includes("TOKEN_EXPIRED"));

    // 7. Token not yet valid (nbf in future) is rejected
    const futureClaims: SpendPassClaims = {
      ...decodedPayload,
      jti: "sp_future_test",
      iat: Math.floor(Date.now() / 1000),
      nbf: Math.floor(Date.now() / 1000) + 600, // valid in 10 mins
      exp: Math.floor(Date.now() / 1000) + 1200,
    };
    const futureToken = spendPassService.signToken(futureClaims);
    const futureResult = spendPassService.verifySpendPass(futureToken);
    assert.equal(futureResult.valid, false);
    assert.ok(futureResult.reasonCodes.includes("TOKEN_NOT_YET_VALID"));
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 3: Scope Binding & Execution Context Validation", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, {
      amountCents: 1500,
      denominationCents: 1500,
      productId: "card_steam_15",
      merchant: "bitrefill",
    });
    const evalResult = gate.evaluateIntent(intent);
    const token = evalResult.spendpassToken!;

    // 1. Matching execution context succeeds
    const matchRes = spendPassService.verifySpendPass(token, {
      recipientId: "rec_self",
      merchantId: "bitrefill",
      productId: "card_steam_15",
      denomination: 1500,
      currency: "USD",
      actualAmountCents: 1500,
    });
    assert.equal(matchRes.valid, true);

    // 2. Recipient mismatch fails
    const badRec = spendPassService.verifySpendPass(token, { recipientId: "rec_attacker" });
    assert.equal(badRec.valid, false);
    assert.ok(badRec.reasonCodes.includes("RECIPIENT_MISMATCH"));

    // 3. Merchant mismatch fails
    const badMerch = spendPassService.verifySpendPass(token, { merchantId: "scam_market" });
    assert.equal(badMerch.valid, false);
    assert.ok(badMerch.reasonCodes.includes("MERCHANT_MISMATCH"));

    // 4. Product mismatch fails
    const badProd = spendPassService.verifySpendPass(token, { productId: "different_product" });
    assert.equal(badProd.valid, false);
    assert.ok(badProd.reasonCodes.includes("PRODUCT_MISMATCH"));

    // 5. Denomination mismatch fails
    const badDenom = spendPassService.verifySpendPass(token, { denomination: 5000 });
    assert.equal(badDenom.valid, false);
    assert.ok(badDenom.reasonCodes.includes("DENOMINATION_MISMATCH"));

    // 6. Currency mismatch fails
    const badCurr = spendPassService.verifySpendPass(token, { currency: "EUR" });
    assert.equal(badCurr.valid, false);
    assert.ok(badCurr.reasonCodes.includes("CURRENCY_MISMATCH"));

    // 7. Price exceeds authorized max_amount fails
    const priceExceeded = spendPassService.verifySpendPass(token, { actualAmountCents: 1600 });
    assert.equal(priceExceeded.valid, false);
    assert.ok(priceExceeded.reasonCodes.includes("AMOUNT_EXCEEDED"));
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 4: Single-Use Lifecycle & Replay Protection", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, { amountCents: 1000 });
    const evalResult = gate.evaluateIntent(intent);
    const token = evalResult.spendpassToken!;
    const spendpassId = evalResult.spendpass!.id;

    // 1. Initial status is ISSUED
    const rec1 = db.getSpendPassToken(spendpassId);
    assert.equal(rec1?.status, "ISSUED");

    // 2. Claim token for execution
    const claimSuccess = spendPassService.claimForExecution(spendpassId, "exec_1001");
    assert.equal(claimSuccess, true);

    const rec2 = db.getSpendPassToken(spendpassId);
    assert.equal(rec2?.status, "CLAIMED");
    assert.equal(rec2?.executionId, "exec_1001");

    // 3. Second claim fails (Replay attack blocked)
    const replayClaim = spendPassService.claimForExecution(spendpassId, "exec_1002");
    assert.equal(replayClaim, false);

    // 4. Verification with a different execution context indicates TOKEN_ALREADY_CLAIMED
    const claimedVerify = spendPassService.verifySpendPass(token, { executionId: "exec_1002" });
    assert.equal(claimedVerify.valid, false);
    assert.ok(claimedVerify.reasonCodes.includes("TOKEN_ALREADY_CLAIMED"));

    // 5. Verification with the matching executionId succeeds (in-flight verification)
    const matchingClaimedVerify = spendPassService.verifySpendPass(token, { executionId: "exec_1001" });
    assert.equal(matchingClaimedVerify.valid, true);

    // 6. Complete execution (CONSUMED)
    const consumed = spendPassService.completeExecution(spendpassId, "exec_1001");
    assert.equal(consumed, true);

    const rec3 = db.getSpendPassToken(spendpassId);
    assert.equal(rec3?.status, "CONSUMED");
    assert.ok(rec3?.consumedAt);

    // 7. Consumed token cannot be claimed again
    const claimAfterConsumed = spendPassService.claimForExecution(spendpassId, "exec_1003");
    assert.equal(claimAfterConsumed, false);

    // 8. Consumed token verification fails with TOKEN_ALREADY_CONSUMED
    const consumedVerify = spendPassService.verifySpendPass(token);
    assert.equal(consumedVerify.valid, false);
    assert.ok(consumedVerify.reasonCodes.includes("TOKEN_ALREADY_CONSUMED"));
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 5: Serialized Concurrency & Double-Claim Prevention", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, { amountCents: 1200 });
    const evalResult = gate.evaluateIntent(intent);
    const spendpassId = evalResult.spendpass!.id;

    // Simulate 20 concurrent execution threads attempting to claim the exact same SpendPass
    const claimResults: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      const execId = `exec_concurrent_${i}`;
      claimResults.push(spendPassService.claimForExecution(spendpassId, execId));
    }

    // Exactly one claim must have succeeded; 19 must have failed
    const successCount = claimResults.filter((r) => r === true).length;
    const failCount = claimResults.filter((r) => r === false).length;

    assert.equal(successCount, 1, "Exactly one claim should succeed under concurrency");
    assert.equal(failCount, 19, "All other concurrent claims must fail");

    const record = db.getSpendPassToken(spendpassId);
    assert.equal(record?.status, "CLAIMED");
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 6: Reservation Consistency & Released Ledger", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent = makeIntent(gate, { amountCents: 1500 });
    const evalResult = gate.evaluateIntent(intent);
    const token = evalResult.spendpassToken!;
    const reservationId = evalResult.reservation!.id;

    // Initially valid
    assert.equal(spendPassService.verifySpendPass(token).valid, true);

    // Release the reservation in the database (simulating timeout or cancellation)
    db.releaseBudget(intent.intentId);

    // SpendPass verification must fail because budget reservation is no longer active
    const invalidRes = spendPassService.verifySpendPass(token);
    assert.equal(invalidRes.valid, false);
    assert.ok(invalidRes.reasonCodes.includes("RESERVATION_INVALID"));
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("SpendPass Suite 7: Emergency Pause & Owner Revocation", () => {
  const { root, db, gate, spendPassService } = setupTestEnv();
  try {
    const intent1 = makeIntent(gate, { amountCents: 1000 });
    const eval1 = gate.evaluateIntent(intent1);
    const token1 = eval1.spendpassToken!;
    const spendpassId1 = eval1.spendpass!.id;

    // 1. Owner explicitly revokes SpendPass
    const revoked = spendPassService.revokeSpendPass(spendpassId1, "owner_cancelled_purchase");
    assert.equal(revoked, true);

    const rec1 = db.getSpendPassToken(spendpassId1);
    assert.equal(rec1?.status, "REVOKED");
    assert.equal(rec1?.revocationReason, "owner_cancelled_purchase");

    // Verification of revoked token fails
    const revVerify = spendPassService.verifySpendPass(token1);
    assert.equal(revVerify.valid, false);
    assert.ok(revVerify.reasonCodes.includes("TOKEN_REVOKED"));

    // Revocation also released the budget reservation in spending_ledger
    const ledgerEntry = db.listSpendingLedger("local-owner", 10).find((l) => l.id === eval1.reservation!.id);
    assert.equal(ledgerEntry?.status, "RELEASED");

    // 2. Emergency Pause invalidation
    const intent2 = makeIntent(gate, { amountCents: 1500 });
    const eval2 = gate.evaluateIntent(intent2);
    const token2 = eval2.spendpassToken!;
    const spendpassId2 = eval2.spendpass!.id;

    assert.equal(spendPassService.verifySpendPass(token2).valid, true);

    // Trigger Emergency Pause on Gate
    gate.setEmergencyPause(true);

    // Active pause immediately invalidates token verification
    const pauseVerify = spendPassService.verifySpendPass(token2);
    assert.equal(pauseVerify.valid, false);
    assert.ok(pauseVerify.reasonCodes.includes("EMERGENCY_PAUSE_ACTIVE"));

    // Unclaimed token status was automatically transitioned to REVOKED
    const rec2 = db.getSpendPassToken(spendpassId2);
    assert.equal(rec2?.status, "REVOKED");
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});
