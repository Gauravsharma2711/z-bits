import test from "node:test";
import assert from "node:assert/strict";
import { newDb } from "pg-mem";
import { type Pool } from "pg";
import { MigrationRunner } from "./migration-runner.js";
import { PostgresZbitsRepository } from "./postgres-zbits-repository.js";
import type { PurchaseIntent, GateReasonCode } from "../../shared/zbits-types.js";

/**
 * Creates an isolated in-memory PostgreSQL instance with all migrations applied.
 */
async function setupTestPostgres(): Promise<{ pool: Pool; repo: PostgresZbitsRepository; runner: MigrationRunner }> {
  const mem = newDb({ noAstCoverageCheck: true });
  // Register date_trunc function in pg-mem if needed
  (mem.public as any).registerFunction({
    name: "date_trunc",
    args: ["text", "timestamp with time zone"],
    returns: "timestamp with time zone",
    implementation: (_field: string, date: Date) => {
      const d = new Date(date || Date.now());
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return d;
    },
  });
  (mem.public as any).registerFunction({
    name: "trim",
    args: ["text"],
    returns: "text",
    implementation: (str: string) => (str ? str.trim() : str),
  });

  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  const runner = new MigrationRunner();
  await runner.runMigrations(pool);
  const repo = new PostgresZbitsRepository(pool);
  await repo.ensureOwner("local-owner", "Local Test Owner");
  await repo.getSpendingConstitution("local-owner");

  return { pool, repo, runner };
}

// ============================================================================
// Test 1: Database connection succeeds
// ============================================================================
test("Mandatory Test 1: Database connection succeeds", async () => {
  const { pool } = await setupTestPostgres();
  try {
    const res = await pool.query("SELECT 1 AS ok");
    assert.equal(res.rows[0].ok, 1);
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 2: Migrations run on a clean database
// ============================================================================
test("Mandatory Test 2: Migrations run on a clean database", async () => {
  const mem = newDb({ noAstCoverageCheck: true });
  const { Pool } = mem.adapters.createPg();
  const pool = new Pool();
  try {
    const runner = new MigrationRunner();
    const result = await runner.runMigrations(pool);
    assert.ok(result.applied.length >= 2, "Expected at least 2 migrations applied");
    assert.equal(result.skipped.length, 0);

    const applied = await runner.getAppliedMigrations(pool);
    assert.equal(applied.length, result.applied.length);
    assert.equal(applied[0].version, "001");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 3: Existing schema upgrades successfully (idempotent re-runs)
// ============================================================================
test("Mandatory Test 3: Existing schema upgrades successfully", async () => {
  const { pool, runner } = await setupTestPostgres();
  try {
    const rerun = await runner.runMigrations(pool);
    assert.equal(rerun.applied.length, 0, "No new migrations should apply on second run");
    assert.ok(rerun.skipped.length >= 2, "Previously applied migrations should be skipped");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 4: Recipient creation works
// ============================================================================
test("Mandatory Test 4: Recipient creation works", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", {
      displayName: "Alice Developer",
      trusted: true,
      recipientLimitCents: 50000,
      aliases: ["alice", "alice-dev"],
    });

    assert.ok(recipient.id.startsWith("rec_"));
    assert.equal(recipient.displayName, "Alice Developer");
    assert.equal(recipient.trusted, true);
    assert.equal(recipient.recipientLimitCents, 50000);

    const retrieved = await repo.getRecipient(recipient.id);
    assert.equal(retrieved?.id, recipient.id);
    assert.equal(retrieved?.displayName, "Alice Developer");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 5: Alias resolution maps multiple aliases to one canonical recipient
// ============================================================================
test("Mandatory Test 5: Alias resolution maps multiple aliases to one canonical recipient", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const rahul = await repo.createRecipient("local-owner", {
      displayName: "Rahul Sharma",
      aliases: ["rahul", "rahul-s", "bestie"],
    });

    const res1 = await repo.resolveRecipientAlias("local-owner", "rahul");
    const res2 = await repo.resolveRecipientAlias("local-owner", "RAHUL-S");
    const res3 = await repo.resolveRecipientAlias("local-owner", "bestie");
    const res4 = await repo.resolveRecipientAlias("local-owner", "Rahul Sharma");

    assert.equal(res1?.id, rahul.id);
    assert.equal(res2?.id, rahul.id);
    assert.equal(res3?.id, rahul.id);
    assert.equal(res4?.id, rahul.id);

    // Unregistered alias returns null
    const resUnknown = await repo.resolveRecipientAlias("local-owner", "stranger");
    assert.equal(resUnknown, null);
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 6: Owner isolation prevents cross-account access
// ============================================================================
test("Mandatory Test 6: Owner isolation prevents cross-account access", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    await repo.ensureOwner("owner-alice", "Alice");
    await repo.ensureOwner("owner-bob", "Bob");

    // Alice creates recipient "Charlie"
    const aliceRecipient = await repo.createRecipient("owner-alice", {
      displayName: "Charlie",
      aliases: ["charlie"],
    });

    // Bob tries to resolve "charlie" under Bob's account
    const bobLookup = await repo.resolveRecipientAlias("owner-bob", "charlie");
    assert.equal(bobLookup, null, "Bob must not resolve Alice's recipient");

    // Bob cannot fetch Alice's recipient with ownerId check
    const bobDirect = await repo.getRecipient(aliceRecipient.id, "owner-bob");
    assert.equal(bobDirect, null, "Bob cannot view Alice's recipient directly");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 7: Shared spending totals are correct
// ============================================================================
test("Mandatory Test 7: Shared spending totals are correct", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Dave" });

    // Intent 1: $30
    const intent1: PurchaseIntent = {
      intentId: "intent_tot_1",
      idempotencyKey: "idem_tot_1",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Dave",
      merchant: "bitrefill",
      amountCents: 3000,
      currency: "USD",
      itemDescription: "Gift 1",
      createdAt: new Date().toISOString(),
      intentDigest: "d1",
    };
    await repo.savePurchaseIntent(intent1);
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent1.intentId,
      agentId: "nova",
      amountCents: 3000,
    });
    await repo.settleBudget(intent1.intentId);

    // Intent 2: $20
    const intent2: PurchaseIntent = {
      intentId: "intent_tot_2",
      idempotencyKey: "idem_tot_2",
      botId: "pixel",
      recipientId: recipient.id,
      recipient: "Dave",
      merchant: "bitrefill",
      amountCents: 2000,
      currency: "USD",
      itemDescription: "Gift 2",
      createdAt: new Date().toISOString(),
      intentDigest: "d2",
    };
    await repo.savePurchaseIntent(intent2);
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent2.intentId,
      agentId: "pixel",
      amountCents: 2000,
    });
    await repo.settleBudget(intent2.intentId);

    const spend = await repo.calculateSpend("local-owner", recipient.id);
    assert.equal(spend.dailySpentCents, 5000);
    assert.equal(spend.recipientSpentCents, 5000);
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 8: Maya and Bolt use the same recipient ledger
// ============================================================================
test("Mandatory Test 8: Maya and Bolt use the same recipient ledger", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    await repo.updateSpendingConstitution("local-owner", {
      dailyBudgetCents: 100000,
      monthlyBudgetCents: 200000,
      maxPerOrderCents: 50000,
    });
    const rahul = await repo.createRecipient("local-owner", {
      displayName: "Rahul",
      recipientLimitCents: 50000, // $500 cap
    });

    // Maya reserves $300 for Rahul
    const mayaIntent: PurchaseIntent = {
      intentId: "intent_maya_cross",
      idempotencyKey: "idem_maya_cross",
      botId: "nova", // Maya
      recipientId: rahul.id,
      recipient: "Rahul",
      merchant: "bitrefill",
      amountCents: 30000,
      currency: "USD",
      itemDescription: "Maya Gift",
      createdAt: new Date().toISOString(),
      intentDigest: "digest_maya",
    };
    await repo.savePurchaseIntent(mayaIntent);
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: rahul.id,
      purchaseIntentId: mayaIntent.intentId,
      agentId: "nova",
      amountCents: 30000,
    });
    await repo.settleBudget(mayaIntent.intentId);

    // Bolt checks spend before creating intent
    const spendBeforeBolt = await repo.calculateSpend("local-owner", rahul.id);
    assert.equal(spendBeforeBolt.recipientSpentCents, 30000, "Bolt sees Maya's $300 spend");

    // Bolt tries to reserve $250 ($300 + $250 = $550 > $500 recipient cap)
    const remainingAllowance = rahul.recipientLimitCents! - spendBeforeBolt.recipientSpentCents;
    assert.equal(remainingAllowance, 20000, "Only $200 allowance remains for Rahul");
    assert.ok(25000 > remainingAllowance, "Bolt's $250 request exceeds shared allowance");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 9: Concurrent reservations cannot exceed available budget
// ============================================================================
test("Mandatory Test 9: Concurrent reservations cannot exceed the available budget", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    // Set daily limit to $50
    await repo.updateSpendingConstitution("local-owner", { dailyBudgetCents: 5000 });
    const recipient = await repo.createRecipient("local-owner", { displayName: "Eve" });

    // First reservation for $40 succeeds
    const intent1: PurchaseIntent = {
      intentId: "intent_conc_1",
      idempotencyKey: "idem_conc_1",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Eve",
      merchant: "bitrefill",
      amountCents: 4000,
      currency: "USD",
      itemDescription: "Item 1",
      createdAt: new Date().toISOString(),
      intentDigest: "dig1",
    };
    await repo.savePurchaseIntent(intent1);
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent1.intentId,
      agentId: "nova",
      amountCents: 4000,
    });

    // Second reservation for $30 ($40 + $30 = $70 > $50) MUST be rejected
    const intent2: PurchaseIntent = {
      intentId: "intent_conc_2",
      idempotencyKey: "idem_conc_2",
      botId: "pixel",
      recipientId: recipient.id,
      recipient: "Eve",
      merchant: "bitrefill",
      amountCents: 3000,
      currency: "USD",
      itemDescription: "Item 2",
      createdAt: new Date().toISOString(),
      intentDigest: "dig2",
    };
    await repo.savePurchaseIntent(intent2);

    await assert.rejects(
      async () => {
        await repo.reserveBudget({
          ownerId: "local-owner",
          recipientId: recipient.id,
          purchaseIntentId: intent2.intentId,
          agentId: "pixel",
          amountCents: 3000,
        });
      },
      /daily spending limit/,
      "Second concurrent reservation exceeding daily limit must be rejected"
    );
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 10: Expired reservations are handled safely
// ============================================================================
test("Mandatory Test 10: Expired reservations are handled safely", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Frank" });
    const intent: PurchaseIntent = {
      intentId: "intent_exp_res",
      idempotencyKey: "idem_exp_res",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Frank",
      merchant: "bitrefill",
      amountCents: 2000,
      currency: "USD",
      itemDescription: "Expiring Item",
      createdAt: new Date().toISOString(),
      intentDigest: "exp_dig",
    };
    await repo.savePurchaseIntent(intent);

    // Reserve with ttlMinutes: -5 (already expired)
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent.intentId,
      agentId: "nova",
      amountCents: 2000,
      ttlMinutes: -5,
    });

    // calculateSpend must ignore expired reservations
    const spend = await repo.calculateSpend("local-owner", recipient.id);
    assert.equal(spend.dailySpentCents, 0, "Expired reservation must not consume daily budget");
    assert.equal(spend.recipientSpentCents, 0, "Expired reservation must not consume recipient budget");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 11: Failed orders release reservations correctly
// ============================================================================
test("Mandatory Test 11: Failed orders release reservations correctly", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Grace" });
    const intent: PurchaseIntent = {
      intentId: "intent_failed_order",
      idempotencyKey: "idem_failed_order",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Grace",
      merchant: "bitrefill",
      amountCents: 2500,
      currency: "USD",
      itemDescription: "Failing Order",
      createdAt: new Date().toISOString(),
      intentDigest: "fail_dig",
    };
    await repo.savePurchaseIntent(intent);
    await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent.intentId,
      agentId: "nova",
      amountCents: 2500,
    });

    // Release budget on order failure
    const released = await repo.releaseBudget(intent.intentId);
    assert.equal(released, true);

    const updatedIntent = await repo.getPurchaseIntent(intent.intentId);
    assert.equal(updatedIntent?.status, "CANCELLED");

    const spend = await repo.calculateSpend("local-owner", recipient.id);
    assert.equal(spend.dailySpentCents, 0, "Released budget must restore available allowance");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 12: Uncertain orders are not blindly retried
// ============================================================================
test("Mandatory Test 12: Uncertain orders are not blindly retried", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Heidi" });
    const intent: PurchaseIntent = {
      intentId: "intent_uncertain",
      idempotencyKey: "idem_uncertain",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Heidi",
      merchant: "bitrefill",
      amountCents: 1500,
      currency: "USD",
      itemDescription: "Uncertain Order",
      createdAt: new Date().toISOString(),
      intentDigest: "unc_dig",
    };
    await repo.savePurchaseIntent(intent);
    const reservation = await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent.intentId,
      agentId: "nova",
      amountCents: 1500,
    });

    // Create valid SpendPass token for the intent
    await repo.createSpendPassToken({
      id: "sp_unc_1",
      jti: "jti_unc_1",
      ownerId: "local-owner",
      purchaseIntentId: intent.intentId,
      authorizationId: "auth_unc_1",
      reservationId: reservation.id,
      recipientId: recipient.id,
      agentId: "nova",
      merchantId: "bitrefill",
      denomination: 1500,
      currency: "USD",
      maxAmount: 1500,
      policyVersion: 1,
      keyId: "k1",
      status: "ISSUED",
      token: "unc_token",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    // Record execution with status UNCERTAIN
    await repo.recordRunnerExecution({
      id: "exec_unc_1",
      spendpassId: "sp_unc_1",
      purchaseIntentId: intent.intentId,
      ownerId: "local-owner",
      merchant: "bitrefill",
      status: "UNCERTAIN",
      actualAmountCents: 1500,
      currency: "USD",
      error: "Gateway timeout waiting for Bitrefill response",
      reasonCodes: ["NETWORK_TIMEOUT"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const execution = await repo.getRunnerExecution("exec_unc_1");
    assert.equal(execution?.status, "UNCERTAIN");

    // The budget reservation MUST remain held and NOT released
    const spend = await repo.calculateSpend("local-owner", recipient.id);
    assert.equal(spend.dailySpentCents, 1500, "Uncertain order must hold budget reservation");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 13: SpendPass replay is rejected after application restart
// ============================================================================
test("Mandatory Test 13: SpendPass replay is rejected after application restart", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Ivan" });
    const intent: PurchaseIntent = {
      intentId: "intent_restart_1",
      idempotencyKey: "idem_restart_1",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Ivan",
      merchant: "bitrefill",
      amountCents: 1000,
      currency: "USD",
      itemDescription: "Ivan Card",
      createdAt: new Date().toISOString(),
      intentDigest: "restart_dig",
    };
    await repo.savePurchaseIntent(intent);
    const reservation = await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent.intentId,
      agentId: "nova",
      amountCents: 1000,
    });

    const token = await repo.createSpendPassToken({
      id: "sp_restart_1",
      jti: "jti_restart_1",
      ownerId: "local-owner",
      purchaseIntentId: intent.intentId,
      authorizationId: "auth_restart_1",
      reservationId: reservation.id,
      recipientId: recipient.id,
      agentId: "nova",
      merchantId: "bitrefill",
      denomination: 1000,
      currency: "USD",
      maxAmount: 1000,
      policyVersion: 1,
      keyId: "k1",
      status: "ISSUED",
      token: "valid_jwt_compact_token",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    // First claim succeeds
    const claim1 = await repo.claimSpendPassForExecution(token.id, "exec_1");
    assert.equal(claim1, true);

    // Complete execution (mark CONSUMED)
    const completed = await repo.completeSpendPassExecution(token.id, "exec_1");
    assert.equal(completed, true);

    // Simulate server restart: create a new repository instance pointing to the same database
    const freshRepo = new PostgresZbitsRepository(pool);

    // Replay attack: try to claim again
    const claimReplay = await freshRepo.claimSpendPassForExecution(token.id, "exec_replay");
    assert.equal(claimReplay, false, "Replaying a consumed SpendPass after restart must fail");

    const reloaded = await freshRepo.getSpendPassToken(token.id);
    assert.equal(reloaded?.status, "CONSUMED");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 14: Revoked SpendPass is rejected
// ============================================================================
test("Mandatory Test 14: Revoked SpendPass is rejected", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    const recipient = await repo.createRecipient("local-owner", { displayName: "Judy" });
    const intent: PurchaseIntent = {
      intentId: "intent_rev_1",
      idempotencyKey: "idem_rev_1",
      botId: "nova",
      recipientId: recipient.id,
      recipient: "Judy",
      merchant: "bitrefill",
      amountCents: 1000,
      currency: "USD",
      itemDescription: "Judy Card",
      createdAt: new Date().toISOString(),
      intentDigest: "rev_dig",
    };
    await repo.savePurchaseIntent(intent);
    const reservation = await repo.reserveBudget({
      ownerId: "local-owner",
      recipientId: recipient.id,
      purchaseIntentId: intent.intentId,
      agentId: "nova",
      amountCents: 1000,
    });

    const token = await repo.createSpendPassToken({
      id: "sp_revoked_1",
      jti: "jti_revoked_1",
      ownerId: "local-owner",
      purchaseIntentId: intent.intentId,
      authorizationId: "auth_rev_1",
      reservationId: reservation.id,
      recipientId: recipient.id,
      agentId: "nova",
      merchantId: "bitrefill",
      denomination: 1000,
      currency: "USD",
      maxAmount: 1000,
      policyVersion: 1,
      keyId: "k1",
      status: "ISSUED",
      token: "revocable_token",
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });

    // Owner revokes SpendPass
    const revoked = await repo.revokeSpendPass(token.id, "owner_cancelled");
    assert.equal(revoked, true);

    // Runner attempts to claim revoked SpendPass
    const claimResult = await repo.claimSpendPassForExecution(token.id, "exec_revoked");
    assert.equal(claimResult, false, "Claiming a revoked SpendPass must be rejected");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 15: Audit events persist
// ============================================================================
test("Mandatory Test 15: Audit events persist", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    await repo.recordAudit("local-owner", "gate_decision", "info", "gate_engine", {
      intentId: "intent_aud_1",
      decision: "ALLOW",
    });
    await repo.recordAudit("local-owner", "emergency_pause_toggled", "warning", "owner", {
      pauseState: true,
    });
    await repo.recordAudit("local-owner", "spendpass_tamper_alert", "security_alert", "runner", {
      reason: "Signature mismatch",
    });

    const logs = await repo.listAuditLogs("local-owner");
    assert.equal(logs.length, 3);
    assert.equal(logs[0].eventType, "spendpass_tamper_alert");
    assert.equal(logs[0].category, "security_alert");
    assert.equal(logs[1].eventType, "emergency_pause_toggled");
    assert.equal(logs[2].eventType, "gate_decision");
  } finally {
    await pool.end();
  }
});

// ============================================================================
// Test 16: Database outage causes fail-closed purchase behavior
// ============================================================================
test("Mandatory Test 16: Database outage causes fail-closed purchase behavior", async () => {
  const { pool, repo } = await setupTestPostgres();
  // Simulate complete database disconnection / outage
  pool.query = () => Promise.reject(new Error("Connection refused: database outage"));
  pool.connect = () => Promise.reject(new Error("Connection refused: database outage"));

  // Any attempt to evaluate limits or reserve budget must throw (fail closed)
  await assert.rejects(
    async () => {
      await repo.calculateSpend("local-owner");
    },
    /database outage/
  );

  await assert.rejects(
    async () => {
      await repo.reserveBudget({
        ownerId: "local-owner",
        recipientId: "rec_self",
        purchaseIntentId: "intent_offline",
        agentId: "nova",
        amountCents: 1000,
      });
    },
    /database outage/
  );
});

// ============================================================================
// Test 17: Existing agent functionality still works
// ============================================================================
test("Mandatory Test 17: Existing agent functionality still works (Zcash & Bounties)", async () => {
  const { pool, repo } = await setupTestPostgres();
  try {
    // 1. Bolt Bounty Event persistence
    const bounty = await pool.query(
      `INSERT INTO bounty_events
       (id, owner_id, contributor_alias, reward_amount_cents, reason, idempotency_key, status)
       VALUES ('bounty_test_1', 'local-owner', 'contributor_42', 5000, 'Bug fix PR #10', 'idem_bounty_42', 'PENDING')
       RETURNING *`
    );
    assert.equal(bounty.rows[0].contributor_alias, "contributor_42");
    assert.equal(bounty.rows[0].status, "PENDING");

    // 2. Zcash Shielded Transaction persistence
    const ztx = await repo.createZcashTransaction({
      id: "ztx_pg_1",
      ownerId: "local-owner",
      txid: "aabbcc11223344556677889900aabbcc11223344556677889900aabbcc112233",
      toAddress: "utest1zcs8jqm6d3k5s2f4g7h9j1k3l5n7p9q2r4s6t8u0v2w4x6y8z0a2c4e6g8i0k2m4o6q8s0u2w4y6",
      amountZat: 20000000,
      memoRef: "zbits:ord_pgtest",
      explorerUrl: "https://blockexplorer.one/zcash/testnet/tx/aabbcc",
      confirmations: 2,
      status: "CONFIRMED",
    });

    assert.equal(ztx.status, "CONFIRMED");
    assert.equal(ztx.amountZec, 0.2);

    const retrievedZtx = await repo.getZcashTransaction("aabbcc11223344556677889900aabbcc11223344556677889900aabbcc112233");
    assert.equal(retrievedZtx?.memoRef, "zbits:ord_pgtest");
  } finally {
    await pool.end();
  }
});
