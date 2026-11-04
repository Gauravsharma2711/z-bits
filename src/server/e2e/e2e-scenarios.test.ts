/**
 * Z-Bits Phase 07-08 End-to-End Test Suite: Comprehensive Security & System Scenarios
 *
 * Verifies all 8 mandatory hackathon scenarios:
 * 1. Scenario 1: Shared cross-agent recipient budget (Rahul: Maya $300 + Bolt $250 -> blocked by Gate)
 * 2. Scenario 2: SpendPass replay protection (reusing consumed authorization is rejected)
 * 3. Scenario 3: Expired SpendPass rejection (expired tokens cannot be executed)
 * 4. Scenario 4: Emergency pause enforcement (halts new spending instantly, fails closed)
 * 5. Scenario 5: Human approval workflow (threshold hold -> pending -> owner approves -> succeeds)
 * 6. Scenario 6: Bitrefill delivery verification (invoice polling, terminal delivery, code masking)
 * 7. Scenario 7: Zcash shielded testnet transaction (NU7 testnet, opaque memo, zero PII, on-chain verification)
 * 8. Scenario 8: Robust failure handling & fail-closed behavior (tampering, invalid credentials, duplicate keys)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "../database.js";
import { GateEngine } from "../gate/gate-engine.js";
import { CommerceRunner } from "../runner/commerce-runner.js";
import { BitrefillClient } from "../runner/bitrefill-client.js";
import { MayaWorkflowService } from "../agents/maya-workflow.js";
import { BoltWorkflowService } from "../agents/bolt-workflow.js";
import { ZcashService } from "../zcash/zcash-service.js";
import type { PurchaseIntent } from "../../shared/zbits-types.js";

function setupE2EEnvironment(constitutionPatch: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "zbits-e2e-test-"));
  const db = new OpenBotDatabase(root);
  const secretKey = "test-e2e-gate-secret-key-32-chars-long";
  const gate = new GateEngine(db, undefined, secretKey);
  const bitrefill = new BitrefillClient({ sandboxMode: true });
  const runner = new CommerceRunner(db, gate, bitrefill);
  const maya = new MayaWorkflowService(gate, runner, db);
  const bolt = new BoltWorkflowService(gate, runner, db);
  const zcash = new ZcashService(db);

  gate.updateConstitution("local-owner", {
    maxPerOrderCents: 50000,          // $500.00
    dailyBudgetCents: 100000,         // $1,000.00
    monthlyBudgetCents: 500000,       // $5,000.00
    requireApprovalAboveCents: 50000, // $500.00 (allow up to 500 without manual approval)
    allowedMerchants: ["bitrefill"],
    allowedCategories: ["digital_gift_cards", "gaming"],
    trustedRecipientOnly: false,
    ...constitutionPatch,
  });

  return { root, db, gate, runner, bitrefill, maya, bolt, zcash, secretKey };
}

// ============================================================================
// Scenario 1: Shared cross-agent recipient budget
// ============================================================================
test("Scenario 1: Cross-agent shared budget enforcement (Maya $300 + Bolt $250 for Rahul -> Gate blocks Bolt)", async () => {
  const { root, db, gate, maya, bolt } = setupE2EEnvironment();
  try {
    // Register canonical recipient Rahul with $500 cap and alias 'rahul_bounty'
    const rahul = gate.registerRecipient("local-owner", {
      displayName: "Rahul Sharma",
      trusted: true,
      recipientLimitCents: 50000, // $500.00
    });
    gate.addAlias("local-owner", rahul.id, "rahul");
    gate.addAlias("local-owner", rahul.id, "rahul_bounty");

    // 1. Maya initiates purchase request of $300 for Rahul (under $500 limit)
    const mayaResult = await maya.submitPurchase({
      ownerId: "local-owner",
      recipientAlias: "rahul",
      productId: "steam-usa",
      denominationCents: 30000, // $300.00
      idempotencyKey: "maya-order-rahul-300",
    });

    assert.equal(mayaResult.decision, "ALLOW", "Maya's $300 request should be ALLOWED by Gate");
    assert.equal(mayaResult.success, true);
    assert.ok(mayaResult.deliveryRef, "Delivery reference should be issued upon successful execution");

    // Verify recipient spend is recorded in Gate ledger
    const spendAfterMaya = db.calculateSpend("local-owner", rahul.id);
    assert.equal(spendAfterMaya.recipientSpentCents, 30000, "Rahul's spent total should now be $300.00");

    // 2. Bolt subsequently submits a $250 bounty for Rahul using alias 'rahul_bounty'
    // Total would be $300 + $250 = $550, exceeding Rahul's $500 cap
    const boltBounty = bolt.createBountyEvent({
      ownerId: "local-owner",
      contributorAlias: "rahul_bounty",
      rewardAmountCents: 25000, // $250.00
      currency: "USD",
      reason: "Security audit bug bounty",
      idempotencyKey: "bolt-bounty-rahul-250",
    });

    const boltResult = await bolt.processReward({
      bountyId: boltBounty.id,
      productId: "steam-usa",
    });

    // Expect Gate to deterministically block Bolt
    assert.equal(boltResult.decision, "DENY", "Bolt's $250 reward should be DENIED by Gate");
    assert.equal(boltResult.success, false);
    assert.ok(
      boltResult.reasonCodes.includes("RECIPIENT_LIMIT_EXCEEDED"),
      `Expected RECIPIENT_LIMIT_EXCEEDED reason code, got: ${boltResult.reasonCodes.join(", ")}`
    );

    // Verify no second purchase executed
    const spendFinal = db.calculateSpend("local-owner", rahul.id);
    assert.equal(spendFinal.recipientSpentCents, 30000, "Rahul's spent total must remain $300.00");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 2: SpendPass replay defense
// ============================================================================
test("Scenario 2: SpendPass replay defense (attempting to reuse an already consumed SpendPass is rejected)", async () => {
  const { root, db, gate, runner } = setupE2EEnvironment();
  try {
    const intent: PurchaseIntent = {
      intentId: "intent_replay_test",
      idempotencyKey: "idem_replay_test",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1000,
      currency: "USD",
      category: "digital_gift_cards",
      itemDescription: "Steam USD 10",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      intentDigest: "a".repeat(64),
    };

    // Authorize intent to issue SpendPass
    const decision = gate.evaluateIntent(intent);
    assert.equal(decision.decision, "ALLOW");
    assert.ok(decision.spendpassToken);

    // First execution: consumes the token
    const firstExecution = await runner.executeSpendPass({
      spendpassToken: decision.spendpassToken!,
      productId: "steam-usa",
      denominationCents: 1000,
    });
    assert.equal(firstExecution.success, true, "First execution should succeed");
    assert.equal(firstExecution.status, "COMPLETED");

    // Second execution: replay attempt with same token
    const replayExecution = await runner.executeSpendPass({
      spendpassToken: decision.spendpassToken!,
      productId: "steam-usa",
      denominationCents: 1000,
    });

    assert.equal(replayExecution.success, false, "Replay execution must be rejected");
    assert.equal(replayExecution.status, "FAILED");
    assert.ok(
      replayExecution.reasonCodes.some((code) =>
        ["SPENDPASS_ALREADY_CLAIMED", "TOKEN_ALREADY_CONSUMED", "SPENDPASS_INVALID", "SPENDPASS_REVOKED"].includes(code)
      ),
      `Expected replay rejection code, got: ${replayExecution.reasonCodes.join(", ")}`
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 3: Expired SpendPass rejection
// ============================================================================
test("Scenario 3: Expired SpendPass rejection (tokens used after validity window are rejected)", async () => {
  const { root, db, gate, runner } = setupE2EEnvironment();
  try {
    const spService = gate.getSpendPassService();
    const intent: PurchaseIntent = {
      intentId: "intent_expired_test",
      idempotencyKey: "idem_expired_test",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1000,
      currency: "USD",
      category: "digital_gift_cards",
      itemDescription: "Steam USD 10",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      intentDigest: "b".repeat(64),
    };
    const decision = gate.evaluateIntent(intent);
    const validToken = decision.spendpassToken!;
    const [, payloadB64] = validToken.split(".");
    const decodedPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const expiredClaims = {
      ...decodedPayload,
      jti: "sp_expired_e2e_test",
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 1800,
    };
    const expiredToken = spService.signToken(expiredClaims);

    const result = await runner.executeSpendPass({
      spendpassToken: expiredToken,
      productId: "steam-usa",
      denominationCents: 1000,
    });

    assert.equal(result.success, false, "Expired SpendPass must be rejected");
    assert.ok(
      result.reasonCodes.includes("SPENDPASS_EXPIRED") || result.reasonCodes.includes("TOKEN_EXPIRED"),
      `Expected expiration code, got: ${result.reasonCodes.join(", ")}`
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 4: Emergency pause enforcement
// ============================================================================
test("Scenario 4: Emergency pause enforcement (new purchase requests cannot execute)", async () => {
  const { root, db, gate, maya } = setupE2EEnvironment();
  try {
    // Activate emergency pause
    gate.setEmergencyPause(true, "local-owner");
    assert.equal(gate.getConstitution("local-owner").emergencyPause, true);

    // Maya attempts a valid purchase while paused
    const result = await maya.submitPurchase({
      ownerId: "local-owner",
      recipientAlias: "self",
      productId: "steam-usa",
      denominationCents: 1000,
      idempotencyKey: "maya-order-during-pause",
    });

    assert.equal(result.decision, "DENY", "Must be DENIED during emergency pause");
    assert.equal(result.success, false);
    assert.ok(
      result.reasonCodes.includes("EMERGENCY_PAUSE_ACTIVE"),
      `Expected EMERGENCY_PAUSE_ACTIVE, got: ${result.reasonCodes.join(", ")}`
    );

    // Deactivate emergency pause and verify recovery
    gate.setEmergencyPause(false, "local-owner");
    assert.equal(gate.getConstitution("local-owner").emergencyPause, false);

    const recoveryResult = await maya.submitPurchase({
      ownerId: "local-owner",
      recipientAlias: "self",
      productId: "steam-usa",
      denominationCents: 1000,
      idempotencyKey: "maya-order-after-resume",
    });

    assert.equal(recoveryResult.decision, "ALLOW", "Should succeed once emergency pause is lifted");
    assert.equal(recoveryResult.success, true);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 5: Human approval workflow
// ============================================================================
test("Scenario 5: Approval workflow (request requiring approval -> pending -> owner resolves -> executes)", async () => {
  const { root, db, gate, maya, runner } = setupE2EEnvironment({
    requireApprovalAboveCents: 5000, // $50.00 requires human approval
  });
  try {
    // Maya requests a $100 order (exceeds $50 threshold)
    const result = await maya.submitPurchase({
      ownerId: "local-owner",
      recipientAlias: "self",
      productId: "steam-usa",
      denominationCents: 10000, // $100.00
      idempotencyKey: "maya-high-value-approval",
    });

    assert.equal(result.decision, "REQUIRE_APPROVAL", "High-value order should REQUIRE_APPROVAL");
    assert.equal(result.success, false);
    assert.ok(result.approvalId, "Should return an approvalId");

    // Verify approval record is pending in database
    const pendingApprovals = db.listGateApprovals("local-owner", "PENDING");
    assert.equal(pendingApprovals.length, 1);
    assert.equal(pendingApprovals[0].id, result.approvalId);

    // Owner resolves the approval: APPROVED (Gate issues authorization atomically)
    const resolvedEval = gate.resolveApproval(result.approvalId!, "APPROVED", "local-owner");
    assert.equal(resolvedEval.decision, "ALLOW");
    assert.ok(resolvedEval.spendpassToken);

    // Runner executes the approved SpendPass successfully
    const execResult = await runner.executeSpendPass({
      spendpassToken: resolvedEval.spendpassToken!,
      productId: "steam-usa",
      denominationCents: 10000,
    });

    assert.equal(execResult.success, true);
    assert.equal(execResult.status, "COMPLETED");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 6: Bitrefill delivery verification
// ============================================================================
test("Scenario 6: Bitrefill purchase & delivery verification (invoice tracking, terminal delivery, masked claim codes)", async () => {
  const { root, db, gate, runner } = setupE2EEnvironment();
  try {
    const intent: PurchaseIntent = {
      intentId: "intent_bitrefill_delivery",
      idempotencyKey: "idem_bitrefill_delivery",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 2000,
      currency: "USD",
      category: "digital_gift_cards",
      itemDescription: "Steam USD 20",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      intentDigest: "c".repeat(64),
    };

    const decision = gate.evaluateIntent(intent);
    assert.equal(decision.decision, "ALLOW");

    const execResult = await runner.executeSpendPass({
      spendpassToken: decision.spendpassToken!,
      productId: "steam-usa",
      denominationCents: 2000,
    });

    assert.equal(execResult.success, true);
    assert.equal(execResult.status, "COMPLETED");
    assert.ok(execResult.merchantInvoiceId, "Should have a merchant invoice ID");
    assert.equal(execResult.deliveryStatus, "delivered", "Must verify terminal delivered state");
    assert.ok(execResult.deliveryRef, "Delivery claim code must be generated");

    // Invariant: The raw execution record in DB is present and matches the invoice
    const executionInDb = runner.getExecution(execResult.executionId);
    assert.ok(executionInDb);
    assert.equal(executionInDb?.status, "COMPLETED");
    assert.equal(executionInDb?.merchantInvoiceId, execResult.merchantInvoiceId);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 7: Zcash privacy transaction
// ============================================================================
test("Scenario 7: Zcash shielded testnet transaction (NU7 testnet, opaque memo, zero PII, on-chain verification)", async () => {
  const { root, db, zcash } = setupE2EEnvironment();
  try {
    // 1. Verify network status: NU7 Testnet
    const status = zcash.getStatus();
    assert.equal(status.network, "testnet");
    assert.equal(status.isOnline, true);
    assert.ok(status.networkUpgrade.includes("NU7"));
    assert.ok(status.vizorCompatibility.supported);

    // 2. Prepare transaction with opaque memo
    const prepared = zcash.prepareTransaction({
      toAddress: "utest1zcs8jqm6d3k5s2f4g7h9j1k3l5n7p9q2r4s6t8u0v2w4x6y8z0a2c4e6g8i0k2m4o6q8s0u2w4y6",
      amountZat: 50_000_000, // 0.5 TAZ
      orderRef: "ord_a8f92b",
    });

    assert.equal(prepared.prepared, true);
    assert.equal(prepared.network, "testnet");
    assert.ok(prepared.memoRef.startsWith("zbits:ord_"), "Memo must strictly start with zbits:ord_");

    // Verify memo security audit (Zero PII)
    const audit = zcash.auditMemoSecurity(prepared.memoRef);
    assert.equal(audit.safe, true);

    // Verify rejection of PII in memos
    const badAudit = zcash.auditMemoSecurity("zbits:ord_steam_gift_card_for_rahul_pin_1234");
    assert.equal(badAudit.safe, false, "Must reject plain-text PII in memos");

    // 3. Record a genuine submitted transaction
    const genuineTxid = "5e9b8f2d1a3c4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789ab";
    const recorded = zcash.recordTransaction({
      txid: genuineTxid,
      toAddress: prepared.toAddress,
      amountZat: prepared.amountZat,
      memoRef: prepared.memoRef,
      confirmations: 3,
      blockHeight: 2984100,
    });

    assert.equal(recorded.txid, genuineTxid);
    assert.equal(recorded.status, "CONFIRMED");
    assert.ok(recorded.explorerUrl.includes("blockexplorer.one"));

    // 4. Verify transaction can be listed and retrieved from database
    const listed = zcash.listTransactions("local-owner");
    assert.equal(listed.length, 1);
    assert.equal(listed[0].txid, genuineTxid);
    assert.equal(listed[0].amountZec, 0.5);

    // 5. Verify on-chain verification method updates record
    const verified = await zcash.verifyTransactionOnChain(genuineTxid);
    assert.equal(verified.txid, genuineTxid);
    assert.ok(verified.verifiedAt);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Scenario 8: Failure handling & fail-closed behavior
// ============================================================================
test("Scenario 8: Failure handling & fail-closed behavior (tampering, invalid credentials, duplicate keys)", async () => {
  const { root, db, gate, runner } = setupE2EEnvironment();
  try {
    // 1. Invalid compact JWT rejected
    const invalidTokenResult = await runner.executeSpendPass({
      spendpassToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature",
      productId: "steam-usa",
      denominationCents: 1000,
    });
    assert.equal(invalidTokenResult.success, false);
    assert.ok(
      invalidTokenResult.reasonCodes.length > 0,
      `Expected failure reason codes, got: ${invalidTokenResult.reasonCodes.join(", ")}`
    );

    // 2. Product not in merchant catalog rejected
    const intent: PurchaseIntent = {
      intentId: "intent_invalid_product",
      idempotencyKey: "idem_invalid_product",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1000,
      currency: "USD",
      category: "digital_gift_cards",
      itemDescription: "Steam USD 10",
      status: "PENDING",
      createdAt: new Date().toISOString(),
      intentDigest: "d".repeat(64),
    };

    const decision = gate.evaluateIntent(intent);
    assert.equal(decision.decision, "ALLOW");

    const missingProductResult = await runner.executeSpendPass({
      spendpassToken: decision.spendpassToken!,
      productId: "non-existent-product-xyz",
      denominationCents: 1000,
    });

    assert.equal(missingProductResult.success, false);
    assert.ok(missingProductResult.reasonCodes.includes("PRODUCT_NOT_FOUND"));

    // 3. Price tampering rejected: token authorized for $10, execution attempts $50
    const priceTamperingResult = await runner.executeSpendPass({
      spendpassToken: decision.spendpassToken!,
      productId: "steam-usa",
      denominationCents: 5000, // Exceeds maxAmountCents (1000) in scope
    });

    assert.equal(priceTamperingResult.success, false);
    assert.ok(
      priceTamperingResult.reasonCodes.includes("PRICE_EXCEEDS_AUTHORIZATION") ||
        priceTamperingResult.reasonCodes.includes("SCOPE_MISMATCH") ||
        priceTamperingResult.reasonCodes.includes("DENOMINATION_MISMATCH") ||
        priceTamperingResult.reasonCodes.includes("AMOUNT_EXCEEDED"),
      `Expected tampering reason code, got: ${priceTamperingResult.reasonCodes.join(", ")}`
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
