import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GateEngine, DEFAULT_SPENDING_POLICY } from "./gate-engine.js";
import { OpenBotDatabase } from "../database.js";
import type { PurchaseIntent } from "../../shared/zbits-types.js";

test("Z-Bits Gate: In-memory compatibility tests (limits, approvals, idempotency, signatures)", () => {
  const gate = new GateEngine({
    ...DEFAULT_SPENDING_POLICY,
    maxPerTransactionCents: 5000, // $50
    dailyBudgetCents: 10000,       // $100
    requireApprovalAboveCents: 2000, // $20
    whitelistedMerchants: ["bitrefill", "steam"],
    currency: "USD",
  }, "test-secret-salt-12345");

  function makeIntent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
    const raw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: `intent_${Date.now()}_${Math.random()}`,
      idempotencyKey: `idem_${Math.random()}`,
      botId: "nova",
      personaName: "Maya",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1500, // $15.00
      currency: "USD",
      itemDescription: "Gift card",
      createdAt: new Date().toISOString(),
      ...overrides,
    };
    const intentDigest = gate.calculateDigest(raw);
    return { ...raw, intentDigest };
  }

  // 1. Transaction within limits and below approval threshold -> direct authorization
  const intent1 = makeIntent({ amountCents: 1500 });
  const eval1 = gate.evaluateIntent(intent1);
  assert.equal(eval1.allowed, true);
  assert.equal(eval1.requiresUserApproval, false);
  assert.ok(eval1.signedAuthorization);
  assert.equal(eval1.signedAuthorization.authorizedAmountCents, 1500);

  // Verify HMAC-SHA256 signature
  assert.equal(gate.verifySignature(eval1.signedAuthorization), true);

  // 2. Transaction above approval threshold -> requires user approval
  const intent2 = makeIntent({ amountCents: 3500 }); // $35 > $20
  const eval2 = gate.evaluateIntent(intent2);
  assert.equal(eval2.allowed, true);
  assert.equal(eval2.requiresUserApproval, true);
  assert.equal(eval2.reason, "awaiting_user_approval");

  // 3. Transaction exceeding per-transaction cap -> rejected
  const intent3 = makeIntent({ amountCents: 7500 }); // $75 > $50 cap
  const eval3 = gate.evaluateIntent(intent3);
  assert.equal(eval3.allowed, false);
  assert.equal(eval3.requiresUserApproval, false);
  assert.equal(eval3.reason, "exceeds_transaction_limit");

  // 4. Non-whitelisted merchant -> rejected
  const intent4 = makeIntent({ merchant: "unauthorized-crypto-casino" });
  const eval4 = gate.evaluateIntent(intent4);
  assert.equal(eval4.allowed, false);
  assert.equal(eval4.reason, "merchant_not_whitelisted");

  // 5. Duplicate intent / idempotency replay protection
  const eval1Again = gate.evaluateIntent(intent1);
  assert.equal(eval1Again.allowed, false);
  assert.equal(eval1Again.reason, "duplicate_intent_detected");

  // 6. Kill Switch: disabling policy halts all transactions
  gate.updatePolicy({ enabled: false }, "admin");
  const intent5 = makeIntent({ amountCents: 500 });
  const eval5 = gate.evaluateIntent(intent5);
  assert.equal(eval5.allowed, false);
  assert.equal(eval5.reason, "policy_disabled");

  // 7. Audit Log recorded all events
  const audit = gate.getAuditLog();
  assert.ok(audit.length >= 5);
  assert.ok(audit.some((a) => a.kind === "policy_updated"));
  assert.ok(audit.some((a) => a.kind === "purchase_authorized"));
  assert.ok(audit.some((a) => a.kind === "purchase_rejected"));
});

test("Z-Bits Gate SQLite: Mandatory cross-agent spending limit test (Maya & Bolt)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-cross-agent-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root, { seedStarterBots: true });
    const gate = new GateEngine(db, undefined, "test-gate-secret");

    // 1. Configure owner spending constitution:
    // Daily budget: $1000.00 (100000 cents), Per order: $500.00 (50000 cents)
    gate.updateConstitution("local-owner", {
      dailyBudgetCents: 100000,
      monthlyBudgetCents: 500000,
      maxPerOrderCents: 50000,
      requireApprovalAboveCents: 40000, // $400 requires approval, so $300 is auto-approved
      allowedMerchants: ["bitrefill", "steam"],
      trustedRecipientOnly: false,
    });

    // 2. Register canonical recipient "Rahul" with recipient-level cap: $500.00 (50000 cents)
    const rahul = db.createRecipient("local-owner", {
      id: "rec_rahul",
      displayName: "Rahul",
      trusted: true,
      recipientLimitCents: 50000, // $500.00 cap
    });
    assert.equal(rahul.id, "rec_rahul");

    // Add alias for Rahul: "Rahul Sharma"
    db.addRecipientAlias("local-owner", "rec_rahul", "Rahul Sharma");

    // Verify alias resolution
    const resolvedByName = db.resolveRecipientAlias("local-owner", "rahul");
    assert.equal(resolvedByName?.id, "rec_rahul");
    const resolvedByAlias = db.resolveRecipientAlias("local-owner", "Rahul Sharma");
    assert.equal(resolvedByAlias?.id, "rec_rahul");

    // 3. Step A: Maya (agent 'nova') requests $300.00 (30000 cents) for "Rahul"
    const mayaIntentRaw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_maya_01",
      idempotencyKey: "idem_maya_01",
      botId: "nova",
      personaName: "Maya",
      merchant: "bitrefill",
      recipient: "rahul",
      amountCents: 30000, // $300.00
      currency: "USD",
      itemDescription: "Uber gift card for Rahul",
      createdAt: new Date().toISOString(),
    };
    const mayaIntent: PurchaseIntent = {
      ...mayaIntentRaw,
      intentDigest: gate.calculateDigest(mayaIntentRaw),
    };

    const mayaEval = gate.evaluateIntent(mayaIntent);
    assert.equal(mayaEval.allowed, true, "Maya's $300 request should be allowed");
    assert.equal(mayaEval.decision, "ALLOW");
    assert.equal(mayaEval.requiresUserApproval, false);
    assert.ok(mayaEval.signedAuthorization);
    assert.ok(mayaEval.reservation);
    assert.equal(mayaEval.reservation.amountCents, 30000);
    assert.equal(mayaEval.reservation.status, "RESERVED");

    // Check shared spend ledger state
    const spendAfterMaya = db.calculateSpend("local-owner", "rec_rahul");
    assert.equal(spendAfterMaya.dailySpentCents, 30000);
    assert.equal(spendAfterMaya.recipientSpentCents, 30000);

    // 4. Step B: Bolt (agent 'pixel') requests $250.00 (25000 cents) for "Rahul Sharma" (different alias, same person)
    const boltIntentRaw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_bolt_01",
      idempotencyKey: "idem_bolt_01",
      botId: "pixel",
      personaName: "Bolt",
      merchant: "bitrefill",
      recipient: "Rahul Sharma", // Alias mapped to rec_rahul
      amountCents: 25000, // $250.00
      currency: "USD",
      itemDescription: "Amazon gift card for Rahul Sharma",
      createdAt: new Date().toISOString(),
    };
    const boltIntent: PurchaseIntent = {
      ...boltIntentRaw,
      intentDigest: gate.calculateDigest(boltIntentRaw),
    };

    const boltEval = gate.evaluateIntent(boltIntent);
    // Cumulative spend would be $300 + $250 = $550, exceeding the $500 recipient limit!
    assert.equal(boltEval.allowed, false, "Bolt's request must be denied by Gate");
    assert.equal(boltEval.decision, "DENY");
    assert.ok(boltEval.reasonCodes?.includes("RECIPIENT_LIMIT_EXCEEDED"));
    assert.ok(boltEval.policyNotes.includes("exceed recipient cap"));

    // 5. Step C: Bolt requests $150.00 (15000 cents) instead ($300 + $150 = $450 <= $500)
    const boltIntent2Raw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_bolt_02",
      idempotencyKey: "idem_bolt_02",
      botId: "pixel",
      personaName: "Bolt",
      merchant: "bitrefill",
      recipient: "Rahul Sharma",
      amountCents: 15000, // $150.00
      currency: "USD",
      itemDescription: "Smaller card",
      createdAt: new Date().toISOString(),
    };
    const boltIntent2: PurchaseIntent = {
      ...boltIntent2Raw,
      intentDigest: gate.calculateDigest(boltIntent2Raw),
    };

    const boltEval2 = gate.evaluateIntent(boltIntent2);
    assert.equal(boltEval2.allowed, true, "Bolt's $150 request should fit within $500 cap");
    assert.equal(boltEval2.decision, "ALLOW");

    const finalSpend = db.calculateSpend("local-owner", "rec_rahul");
    assert.equal(finalSpend.recipientSpentCents, 45000, "$300 + $150 = $450 total reserved");
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("Z-Bits Gate SQLite: Alias normalization & ambiguity handling", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-alias-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root);

    // Create recipient "Alice Cooper"
    const alice = db.createRecipient("local-owner", {
      id: "rec_alice",
      displayName: "Alice Cooper",
      trusted: true,
    });

    db.addRecipientAlias("local-owner", "rec_alice", "alice.c@example.com");
    db.addRecipientAlias("local-owner", "rec_alice", "+1-555-0199");

    // Verify whitespace and punctuation normalization
    assert.equal(db.resolveRecipientAlias("local-owner", "   alice   cooper  ")?.id, "rec_alice");
    assert.equal(db.resolveRecipientAlias("local-owner", "ALICE.C@EXAMPLE.COM")?.id, "rec_alice");
    assert.equal(db.resolveRecipientAlias("local-owner", "+1-555-0199")?.id, "rec_alice");

    // Unregistered alias returns null (fails closed)
    assert.equal(db.resolveRecipientAlias("local-owner", "nonexistent_person"), null);
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("Z-Bits Gate SQLite: Emergency Pause kill switch", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-pause-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root);
    const gate = new GateEngine(db, undefined, "test-secret");

    // Toggle emergency pause ON
    gate.setEmergencyPause(true);
    assert.equal(gate.getConstitution().emergencyPause, true);

    const intentRaw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_pause_1",
      idempotencyKey: "idem_pause_1",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1000,
      currency: "USD",
      itemDescription: "Emergency test",
      createdAt: new Date().toISOString(),
    };
    const intent: PurchaseIntent = {
      ...intentRaw,
      intentDigest: gate.calculateDigest(intentRaw),
    };

    const res = gate.evaluateIntent(intent);
    assert.equal(res.allowed, false);
    assert.equal(res.decision, "DENY");
    assert.ok(res.reasonCodes?.includes("EMERGENCY_PAUSE_ACTIVE"));

    // Toggle emergency pause OFF
    gate.setEmergencyPause(false);
    assert.equal(gate.getConstitution().emergencyPause, false);

    const intent2Raw = { ...intentRaw, intentId: "intent_pause_2", idempotencyKey: "idem_pause_2" };
    const res2 = gate.evaluateIntent({ ...intent2Raw, intentDigest: gate.calculateDigest(intent2Raw) });
    assert.equal(res2.allowed, true);
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("Z-Bits Gate SQLite: Idempotency conflict protection", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-idempotency-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root);
    const gate = new GateEngine(db);

    const intent1Raw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_idem_1",
      idempotencyKey: "shared_idem_key",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 1000,
      currency: "USD",
      itemDescription: "Original item",
      createdAt: new Date().toISOString(),
    };
    const intent1: PurchaseIntent = {
      ...intent1Raw,
      intentDigest: gate.calculateDigest(intent1Raw),
    };

    const res1 = gate.evaluateIntent(intent1);
    assert.equal(res1.allowed, true);

    // Replay of exact same request -> duplicate detected
    const replay = gate.evaluateIntent(intent1);
    assert.equal(replay.allowed, false);
    assert.ok(replay.reasonCodes?.includes("DUPLICATE_REQUEST"));

    // Same idempotency key with modified amount ($20 instead of $10) -> conflict detected!
    const tamperedRaw = { ...intent1Raw, intentId: "intent_idem_2", amountCents: 2000 };
    const tampered: PurchaseIntent = {
      ...tamperedRaw,
      intentDigest: gate.calculateDigest(tamperedRaw),
    };

    const tamperedRes = gate.evaluateIntent(tampered);
    assert.equal(tamperedRes.allowed, false);
    assert.ok(tamperedRes.reasonCodes?.includes("IDEMPOTENCY_CONFLICT"));
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("Z-Bits Gate SQLite: Two-phase reservation lifecycle (reserve -> settle & release)", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-lifecycle-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root);
    const gate = new GateEngine(db);

    gate.updateConstitution("local-owner", {
      dailyBudgetCents: 5000, // $50.00 daily budget
      maxPerOrderCents: 5000,
      requireApprovalAboveCents: 4000,
    });

    const intentRaw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_life_1",
      idempotencyKey: "idem_life_1",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 3000, // $30.00
      currency: "USD",
      itemDescription: "Lifecycle test",
      createdAt: new Date().toISOString(),
    };
    const intent: PurchaseIntent = {
      ...intentRaw,
      intentDigest: gate.calculateDigest(intentRaw),
    };

    const eval1 = gate.evaluateIntent(intent);
    assert.equal(eval1.allowed, true);
    assert.ok(eval1.reservation);
    assert.equal(eval1.reservation.status, "RESERVED");

    // Settle budget
    const settled = db.settleBudget(intent.intentId);
    assert.equal(settled, true);

    const ledger = db.listSpendingLedger("local-owner");
    assert.equal(ledger[0]?.status, "SETTLED");
    assert.ok(ledger[0]?.settledAt);

    // Release an intent
    const intent2Raw = { ...intentRaw, intentId: "intent_life_2", idempotencyKey: "idem_life_2", amountCents: 1500 };
    const intent2: PurchaseIntent = {
      ...intent2Raw,
      intentDigest: gate.calculateDigest(intent2Raw),
    };
    const eval2 = gate.evaluateIntent(intent2);
    assert.equal(eval2.allowed, true);

    const released = db.releaseBudget(intent2.intentId);
    assert.equal(released, true);

    const ledger2 = db.listSpendingLedger("local-owner");
    const releasedEntry = ledger2.find((e) => e.purchaseIntentId === intent2.intentId);
    assert.equal(releasedEntry?.status, "RELEASED");
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});

test("Z-Bits Gate SQLite: Owner approval workflow", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gate-approval-workflow-test-"));
  let db: OpenBotDatabase | null = null;
  try {
    db = new OpenBotDatabase(root);
    const gate = new GateEngine(db);

    gate.updateConstitution("local-owner", {
      requireApprovalAboveCents: 2000, // $20.00
      maxPerOrderCents: 10000, // $100.00
    });

    // Request $35.00 -> triggers approval requirement
    const intentRaw: Omit<PurchaseIntent, "intentDigest"> = {
      intentId: "intent_appr_1",
      idempotencyKey: "idem_appr_1",
      botId: "nova",
      merchant: "bitrefill",
      recipient: "self",
      amountCents: 3500, // $35.00 > $20.00 threshold
      currency: "USD",
      itemDescription: "Requires owner approval",
      createdAt: new Date().toISOString(),
    };
    const intent: PurchaseIntent = {
      ...intentRaw,
      intentDigest: gate.calculateDigest(intentRaw),
    };

    const res = gate.evaluateIntent(intent);
    assert.equal(res.requiresUserApproval, true);
    assert.equal(res.decision, "REQUIRE_APPROVAL");
    assert.ok(res.approvalId);

    // Verify approval stored in database
    const approval = db.getGateApproval(res.approvalId);
    assert.equal(approval?.status, "PENDING");
    assert.equal(approval?.purchaseIntentId, intent.intentId);

    // Resolve approval with owner APPROVE
    const approvedResult = gate.resolveApproval(res.approvalId, "APPROVED", "owner");
    assert.equal(approvedResult.allowed, true);
    assert.equal(approvedResult.decision, "ALLOW");
    assert.ok(approvedResult.signedAuthorization);
    assert.ok(approvedResult.reservation);
    assert.equal(approvedResult.reservation.amountCents, 3500);

    // Status in database updated
    const updatedApproval = db.getGateApproval(res.approvalId);
    assert.equal(updatedApproval?.status, "APPROVED");
    assert.equal(updatedApproval?.resolvedBy, "owner");
  } finally {
    if (db) db.close();
    try { rmSync(root, { recursive: true, force: true }); } catch {}
  }
});
