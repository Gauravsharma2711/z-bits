import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "../database.js";
import { GateEngine } from "../gate/gate-engine.js";
import { CommerceRunner } from "./commerce-runner.js";
import { BitrefillClient } from "./bitrefill-client.js";
import type { PurchaseIntent } from "../../shared/zbits-types.js";

function setupRunnerTestEnv() {
  const root = mkdtempSync(path.join(tmpdir(), "runner-test-"));
  const db = new OpenBotDatabase(root);
  const gate = new GateEngine(db, undefined, "test-gate-secret-key-runner");
  const bitrefill = new BitrefillClient({ sandboxMode: true });
  const runner = new CommerceRunner(db, gate, bitrefill);
  return { root, db, gate, bitrefill, runner };
}

function createApprovedIntent(
  gate: GateEngine,
  overrides: Partial<PurchaseIntent> = {}
): { intent: PurchaseIntent; token: string; spendpassId: string } {
  const raw: Omit<PurchaseIntent, "intentDigest"> = {
    intentId: `intent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    idempotencyKey: `idem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    botId: "nova",
    personaName: "Maya",
    merchant: "bitrefill",
    recipient: "self",
    recipientId: "rec_self",
    amountCents: 2000, // $20.00
    currency: "USD",
    itemDescription: "Steam Gift Card $20",
    productId: "steam-usa",
    denominationCents: 2000,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
  const intent: PurchaseIntent = { ...raw, intentDigest: gate.calculateDigest(raw) };
  const evalResult = gate.evaluateIntent(intent);
  assert.equal(evalResult.allowed, true, `Intent must be allowed: ${evalResult.reasonCodes.join(",")}`);
  assert.ok(evalResult.spendpass, "SpendPass must be issued on ALLOW");
  return {
    intent,
    token: evalResult.spendpass.token,
    spendpassId: evalResult.spendpass.id,
  };
}

// =========================================================================
// SECTION A: SpendPass Verification (Fail-Closed)
// =========================================================================

test("Runner Suite A1: Valid SpendPass and matching context executes successfully", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token, spendpassId } = createApprovedIntent(gate, {
    productId: "steam-usa",
    denominationCents: 2000,
    amountCents: 2000,
  });

  const result = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
    currency: "USD",
    recipientId: "rec_self",
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.deliveryStatus, "delivered");
  assert.equal(result.actualAmountCents, 2000);
  assert.ok(result.executionId.startsWith("exec_"));
  assert.ok(result.merchantInvoiceId);
});

test("Runner Suite A2: Tampered SpendPass token signature is rejected (fails closed)", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate);

  // Tamper with the JWT signature part
  const parts = token.split(".");
  const tamperedToken = `${parts[0]}.${parts[1]}.tampered_signature_bytes`;

  const result = await runner.executeSpendPass({
    spendpassToken: tamperedToken,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "FAILED");
  assert.ok(result.reasonCodes.includes("INVALID_SIGNATURE"));
});

test("Runner Suite A3: Revoked SpendPass token cannot be executed", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token, spendpassId } = createApprovedIntent(gate);

  // Revoke token prior to execution
  const revoked = gate.revokeSpendPass(spendpassId, "owner_requested_cancel");
  assert.equal(revoked, true);

  const result = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "FAILED");
  assert.ok(result.reasonCodes.includes("TOKEN_REVOKED"));
});

test("Runner Suite A4: Scope mismatch rejects execution (merchant / recipient mismatch)", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate, {
    recipientId: "rec_self",
    productId: "steam-usa",
  });

  // Attempting to execute with a different recipient ID than authorized
  const result = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
    recipientId: "rec_other_unauthorized",
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "FAILED");
  assert.ok(result.reasonCodes.includes("RECIPIENT_MISMATCH"));
});

test("Runner Suite A5: Price ceiling enforcement (rejects price > max_amount)", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  // Authorize for $20.00 max
  const { token } = createApprovedIntent(gate, {
    amountCents: 2000,
    denominationCents: 2000,
    productId: "steam-usa",
  });

  // Attempt to execute a $50.00 package using a $20.00 authorized SpendPass
  const result = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 5000,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "FAILED");
  assert.ok(
    result.reasonCodes.includes("PRICE_EXCEEDS_AUTHORIZATION") ||
    result.reasonCodes.includes("DENOMINATION_MISMATCH")
  );
});

// =========================================================================
// SECTION B: Product Discovery & Price Verification
// =========================================================================

test("Runner Suite B1: Product search and detail lookup", async () => {
  const { runner } = setupRunnerTestEnv();

  const products = await runner.searchProducts("steam");
  assert.ok(products.length > 0);
  const steam = products.find((p) => p.id === "steam-usa");
  assert.ok(steam);
  assert.equal(steam.currency, "USD");
  assert.ok(steam.packages.length >= 3);

  const details = await runner.getProduct("steam-usa");
  assert.ok(details);
  assert.equal(details.id, "steam-usa");
  assert.equal(details.isAvailable, true);
});

test("Runner Suite B2: Non-existent product fails closed", async () => {
  const { runner } = setupRunnerTestEnv();

  const details = await runner.getProduct("non-existent-product-id-999");
  assert.equal(details, null);
});

test("Runner Suite B3: Unsupported denomination rejected", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  // Authorize with amount that steam-usa does not offer (e.g. $13.37)
  const { token } = createApprovedIntent(gate, {
    amountCents: 1337,
    denominationCents: 1337,
    productId: "steam-usa",
  });

  const result = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 1337,
  });

  assert.equal(result.success, false);
  assert.equal(result.status, "FAILED");
  assert.ok(result.reasonCodes.includes("DENOMINATION_INVALID"));
});

// =========================================================================
// SECTION C: Execution Lifecycle & Replay Protection
// =========================================================================

test("Runner Suite C1: Single execution succeeds and prevents replay", async () => {
  const { gate, runner, db } = setupRunnerTestEnv();
  const { token, spendpassId } = createApprovedIntent(gate, {
    productId: "steam-usa",
    denominationCents: 2000,
  });

  // First execution: Success
  const first = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });
  assert.equal(first.success, true);
  assert.equal(first.status, "COMPLETED");

  // Verify SpendPass state transitioned to CONSUMED
  const tokenRecord = db.getSpendPassToken(spendpassId);
  assert.equal(tokenRecord?.status, "CONSUMED");

  // Immediate second execution with exact same SpendPass: Rejected
  const replay = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });
  assert.equal(replay.success, false);
  assert.equal(replay.status, "FAILED");
  assert.ok(
    replay.reasonCodes.includes("TOKEN_ALREADY_CONSUMED") ||
    replay.reasonCodes.includes("SPENDPASS_ALREADY_CLAIMED")
  );
});

test("Runner Suite C2: Serialized concurrency prevents double claim", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate, {
    productId: "steam-usa",
    denominationCents: 2000,
  });

  // Launch two concurrent execution requests with the identical token
  const [res1, res2] = await Promise.all([
    runner.executeSpendPass({
      spendpassToken: token,
      productId: "steam-usa",
      denominationCents: 2000,
    }),
    runner.executeSpendPass({
      spendpassToken: token,
      productId: "steam-usa",
      denominationCents: 2000,
    }),
  ]);

  // Exactly one must succeed, the other must fail
  const successes = [res1, res2].filter((r) => r.success);
  const failures = [res1, res2].filter((r) => !r.success);

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.ok(
    failures[0].reasonCodes.includes("SPENDPASS_ALREADY_CLAIMED") ||
    failures[0].reasonCodes.includes("TOKEN_NOT_CLAIMABLE")
  );
});

// =========================================================================
// SECTION D: Invoice & Delivery Polling (Paid != Delivered)
// =========================================================================

test("Runner Suite D1: Order creates invoice and delivery is verified", async () => {
  const { gate, runner, db } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate, {
    productId: "steam-usa",
    denominationCents: 1500,
    amountCents: 1500,
  });

  const res = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 1500,
  });

  assert.equal(res.success, true);
  assert.equal(res.deliveryStatus, "delivered");
  assert.ok(res.merchantInvoiceId);

  // Check persisted invoice record
  const invoice = runner.getInvoice(res.merchantInvoiceId!);
  assert.ok(invoice);
  assert.equal(invoice.status, "DELIVERED");
  assert.equal(invoice.actualAmountCents, 1500);
  assert.ok(invoice.deliveredAt);
});

test("Runner Suite D2: Terminal delivery failure marks execution FAILED without consumption", async () => {
  const { gate, runner, bitrefill, db } = setupRunnerTestEnv();
  const { token, spendpassId } = createApprovedIntent(gate);

  // Configure Bitrefill client to simulate a terminal order rejection
  bitrefill.setSimulateOrderFailure(true);

  const res = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(res.success, false);
  assert.equal(res.status, "FAILED");

  // SpendPass must NOT be consumed
  const tokenRecord = db.getSpendPassToken(spendpassId);
  assert.notEqual(tokenRecord?.status, "CONSUMED");
});

// =========================================================================
// SECTION E: Gate Settlement & Ledger Consistency
// =========================================================================

test("Runner Suite E1: Confirmed delivery settles reservation in ledger", async () => {
  const { gate, runner, db } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate, {
    amountCents: 2000,
    denominationCents: 2000,
    productId: "steam-usa",
  });

  // Verify reservation exists prior to execution
  const ledgerBefore = db.listSpendingLedger("local-owner");
  const reservationBefore = ledgerBefore.find((e) => e.status === "RESERVED");
  assert.ok(reservationBefore, "Reserved entry must exist before execution");

  const res = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(res.success, true);

  // Verify ledger settlement
  const ledgerAfter = db.listSpendingLedger("local-owner");
  const settledReservation = ledgerAfter.find((e) => e.id === reservationBefore.id);
  assert.equal(settledReservation?.status, "SETTLED");

  // Check recorded spend
  const currentSpend = db.calculateSpend("local-owner");
  assert.ok(currentSpend.dailySpentCents >= 2000);
});

test("Runner Suite E2: Network timeout marks UNCERTAIN and holds reservation", async () => {
  const { gate, runner, bitrefill, db } = setupRunnerTestEnv();
  const { token, spendpassId } = createApprovedIntent(gate);

  // Simulate timeout during order submission
  bitrefill.setSimulateTimeout(true);

  const res = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(res.success, false);
  assert.equal(res.status, "UNCERTAIN");
  assert.ok(res.reasonCodes.includes("MERCHANT_OUTCOME_UNCERTAIN"));

  // SpendPass must remain in CLAIMED state (held safely for reconciliation)
  const tokenRecord = db.getSpendPassToken(spendpassId);
  assert.equal(tokenRecord?.status, "CLAIMED");

  // Gate reservation must remain RESERVED (funds NOT released blindly)
  const ledger = db.listSpendingLedger("local-owner");
  const reservation = ledger.find((e) => e.status === "RESERVED");
  assert.ok(reservation, "Reservation must remain RESERVED during uncertain outcome");
});

// =========================================================================
// SECTION F: Security, Masking & Audit Trail
// =========================================================================

test("Runner Suite F1: Secret claim codes are masked in invoices and execution results", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate);

  const res = await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  assert.equal(res.success, true);
  assert.ok(res.deliveryRef);
  // Mask pattern check: should contain asterisks and not raw unmasked string
  assert.match(res.deliveryRef!, /\*\*\*\*/);

  // Check in database invoice record
  const invoice = runner.getInvoice(res.merchantInvoiceId!);
  assert.ok(invoice?.deliveryRef);
  assert.match(invoice.deliveryRef!, /\*\*\*\*/);
});

test("Runner Suite F2: Comprehensive audit events are logged across lifecycle", async () => {
  const { gate, runner } = setupRunnerTestEnv();
  const { token } = createApprovedIntent(gate);

  await runner.executeSpendPass({
    spendpassToken: token,
    productId: "steam-usa",
    denominationCents: 2000,
  });

  const auditLog = gate.getAuditLog(50);
  const eventKinds = auditLog.map((e) => e.kind);

  assert.ok(eventKinds.includes("runner_purchase_initiated"));
  assert.ok(eventKinds.includes("runner_delivery_confirmed"));
  assert.ok(eventKinds.includes("runner_settlement_completed"));
});
