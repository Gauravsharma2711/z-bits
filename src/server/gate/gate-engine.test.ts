import test from "node:test";
import assert from "node:assert/strict";
import { GateEngine, DEFAULT_SPENDING_POLICY } from "./gate-engine.js";
import type { PurchaseIntent } from "../../shared/zbits-types.js";

test("Z-Bits Gate: Deterministic limits, approvals, idempotency, and signatures", () => {
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
