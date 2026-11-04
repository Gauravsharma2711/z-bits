/**
 * Z-Bits Phase 06 Test Suite: Maya & Bolt Agent Workflows and Commerce Integration
 *
 * Verifies:
 * - Section A: Maya Concierge Workflow (parsing, proposals, Gate evaluation, Runner execution)
 * - Section B: Bolt Bounty Workflow (idempotent intake, validation, Gate evaluation, reward execution)
 * - Section C: Cross-Agent Shared Financial Behavior (Shared recipient limit & constitution)
 * - Section D: Agent Tool Security Boundaries & Permission Enforcement
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
import { MayaWorkflowService } from "./maya-workflow.js";
import { BoltWorkflowService } from "./bolt-workflow.js";
import { executeAgentTool, ZBITS_AGENT_TOOLS } from "./agent-tools.js";
import type { SpendingPolicy, CanonicalRecipient } from "../../shared/zbits-types.js";

function setupAgentTestEnv(constitutionOverrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "agents-workflow-test-"));
  const db = new OpenBotDatabase(root);
  const secretKey = "test-gate-secret-key-agents-workflow";
  const gate = new GateEngine(db, undefined, secretKey);
  const bitrefill = new BitrefillClient({ sandboxMode: true });
  const runner = new CommerceRunner(db, gate, bitrefill);

  const maya = new MayaWorkflowService(gate, runner, db);
  const bolt = new BoltWorkflowService(gate, runner, db);

  gate.updateConstitution("local-owner", {
    maxPerOrderCents: 50000,    // $500.00
    dailyBudgetCents: 100000,         // $1,000.00
    monthlyBudgetCents: 500000,       // $5,000.00
    requireApprovalAboveCents: 2000,  // $20.00
    allowedMerchants: ["bitrefill"],
    ...constitutionOverrides,
  });

  return { root, db, gate, runner, bitrefill, maya, bolt };
}

// ============================================================================
// Section A: Maya Concierge Workflow Tests
// ============================================================================

test("Maya: parses natural language purchase requests correctly", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv();
  try {
    // Register recipient Alice
    gate.registerRecipient("local-owner", {
      displayName: "Alice",
      trusted: true,
      recipientLimitCents: 10000,
    });

    const parsed = await maya.parseRequest("Hey Maya, buy Alice a $25 Steam gift card for her birthday");
    assert.equal(parsed.recipientAlias, "Alice");
    assert.equal(parsed.denominationCents, 2500);
    assert.equal(parsed.currency, "USD");
    assert.equal(parsed.productQuery, "steam");
    assert.equal(parsed.occasion, "birthday");
    assert.equal(parsed.missingFields.length, 0);
    assert.equal(parsed.needsClarification, false);
    assert.ok(parsed.canonicalRecipientId, "Canonical recipient ID should be resolved");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: missing information triggers clarification prompt", async () => {
  const { root, db, maya } = setupAgentTestEnv();
  try {
    const parsed = await maya.parseRequest("Can you buy something for me?");
    assert.equal(parsed.recipientAlias, "self");
    assert.equal(parsed.needsClarification, true);
    assert.ok(parsed.missingFields.includes("denomination"), "Should detect missing denomination");
    assert.ok(parsed.clarificationPrompt, "Should generate clarification prompt");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: ambiguous recipient triggers clarification prompt without guessing", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv();
  try {
    // Register two recipients with overlapping names
    gate.registerRecipient("local-owner", { displayName: "Rahul Sharma", trusted: true });
    gate.registerRecipient("local-owner", { displayName: "Rahul Verma", trusted: true });

    const parsed = await maya.parseRequest("Buy Rahul a $15 Steam card");
    assert.equal(parsed.isAmbiguous, true);
    assert.equal(parsed.needsClarification, true);
    assert.ok(parsed.clarificationPrompt?.includes("Rahul"), "Clarification prompt should address ambiguity");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: proposal generation checks Gate approval threshold and returns structured details", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv({
    requireApprovalAboveCents: 2000, // $20.00
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Alice", trusted: true });

    // Request above threshold ($50.00)
    const proposalHigh = await maya.createProposal({
      recipientAlias: "Alice",
      productQuery: "steam",
      denominationCents: 5000,
    });
    assert.equal(proposalHigh.productName, "Steam Gift Card USD");
    assert.equal(proposalHigh.denominationCents, 5000);
    assert.equal(proposalHigh.requiresApproval, true);

    // Request below or equal threshold ($20.00)
    const proposalLow = await maya.createProposal({
      recipientAlias: "Alice",
      productQuery: "steam",
      denominationCents: 2000,
    });
    assert.equal(proposalLow.requiresApproval, false);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: ALLOW purchase executes through Runner and verifies delivery", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv({
    requireApprovalAboveCents: 5000, // $50.00 threshold so $20 is auto-allowed
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Alice", trusted: true });

    const result = await maya.submitPurchase({
      recipientAlias: "Alice",
      productId: "steam-usa",
      denominationCents: 2000,
      occasion: "birthday",
    });

    assert.equal(result.success, true);
    assert.equal(result.decision, "ALLOW");
    assert.ok(result.executionId, "Execution ID should be returned");
    assert.equal(result.runnerResult?.deliveryStatus, "delivered");
    assert.equal(result.runnerResult?.status, "COMPLETED");
    assert.ok(result.runnerResult?.merchantInvoiceId, "Invoice ID should be set");
    assert.ok(result.runnerResult?.deliveryRef, "Delivery ref should be set");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: REQUIRE_APPROVAL purchase pauses and returns approvalId", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv({
    requireApprovalAboveCents: 2000, // $20.00 threshold
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Alice", trusted: true });

    // $50 purchase triggers approval
    const result = await maya.submitPurchase({
      recipientAlias: "Alice",
      productId: "steam-usa",
      denominationCents: 5000,
    });

    assert.equal(result.success, false);
    assert.equal(result.decision, "REQUIRE_APPROVAL");
    assert.ok(result.approvalId, "Approval ID must be returned");
    assert.ok(result.reasonCodes?.includes("POLICY_REQUIRES_APPROVAL"));
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Maya: DENY purchase explains reason safely", async () => {
  const { root, db, maya, gate } = setupAgentTestEnv({
    maxPerOrderCents: 1000, // $10 max
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Alice", trusted: true });

    const result = await maya.submitPurchase({
      recipientAlias: "Alice",
      productId: "steam-usa",
      denominationCents: 2000, // $20 exceeds $10
    });

    assert.equal(result.success, false);
    assert.equal(result.decision, "DENY");
    assert.ok(result.reasonCodes?.includes("ORDER_LIMIT_EXCEEDED"));
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Section B: Bolt Bounty Workflow Tests
// ============================================================================

test("Bolt: creates bounty event with unique idempotency key", async () => {
  const { root, db, bolt, gate } = setupAgentTestEnv();
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    const bounty = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 5000,
      reason: "Fixed security issue #42",
      idempotencyKey: "bounty_test_idem_01",
    });

    assert.ok(bounty.id);
    assert.equal(bounty.status, "PENDING");
    assert.equal(bounty.rewardAmountCents, 5000);
    assert.equal(bounty.contributorAlias, "Bob");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Bolt: duplicate bounty submission is handled idempotently", async () => {
  const { root, db, bolt, gate } = setupAgentTestEnv();
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    const first = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 5000,
      reason: "Documentation improvements",
      idempotencyKey: "bounty_test_idem_02",
    });

    // Exact replay returns existing event
    const second = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 5000,
      reason: "Documentation improvements",
      idempotencyKey: "bounty_test_idem_02",
    });
    assert.equal(second.id, first.id);

    // Mismatched parameters with same idempotency key throws conflict
    assert.throws(
      () => {
        bolt.createBountyEvent({
          contributorAlias: "Bob",
          rewardAmountCents: 9999, // different amount!
          reason: "Documentation improvements",
          idempotencyKey: "bounty_test_idem_02",
        });
      },
      /Idempotency conflict/
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Bolt: validates contributor identity through Gate and checks eligible products", async () => {
  const { root, db, bolt, gate } = setupAgentTestEnv();
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    const bounty = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 2000,
      reason: "Feature PR #12 merged",
    });

    const validation = await bolt.validateBountyEvent(bounty.id);
    assert.equal(validation.valid, true);
    assert.equal(validation.contributorName, "Bob");
    assert.ok(validation.canonicalContributorId);
    assert.ok(validation.eligibleProducts && validation.eligibleProducts.length > 0);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Bolt: unresolvable or ambiguous contributor fails validation", async () => {
  const { root, db, bolt } = setupAgentTestEnv();
  try {
    const bounty = bolt.createBountyEvent({
      contributorAlias: "UnknownContributorXYZ",
      rewardAmountCents: 2000,
      reason: "Unknown contribution",
    });

    const validation = await bolt.validateBountyEvent(bounty.id);
    assert.equal(validation.valid, false);
    assert.ok(validation.reasonCodes?.includes("CONTRIBUTOR_UNRESOLVED"));
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Bolt: ALLOW reward executes via Runner and marks bounty EXECUTED", async () => {
  const { root, db, bolt, gate } = setupAgentTestEnv({
    requireApprovalAboveCents: 5000, // $50 threshold
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    const bounty = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 2000, // $20
      reason: "Closed bug report",
    });

    const result = await bolt.processReward({
      bountyId: bounty.id,
      productId: "steam-usa",
    });

    assert.equal(result.success, true);
    assert.equal(result.decision, "ALLOW");
    assert.equal(result.runnerResult?.deliveryStatus, "delivered");

    // Verify persisted bounty state
    const updated = bolt.getBounty(bounty.id);
    assert.equal(updated?.status, "EXECUTED");
    assert.ok(updated?.executionId);
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Bolt: DENY reward marks bounty REJECTED", async () => {
  const { root, db, bolt, gate } = setupAgentTestEnv({
    maxPerOrderCents: 1000, // $10 max
  });
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    const bounty = bolt.createBountyEvent({
      contributorAlias: "Bob",
      rewardAmountCents: 5000, // $50 exceeds $10
      reason: "Bounty too large",
    });

    const result = await bolt.processReward({
      bountyId: bounty.id,
      productId: "steam-usa",
    });

    assert.equal(result.success, false);
    assert.equal(result.decision, "DENY");
    assert.ok(result.reasonCodes?.includes("ORDER_LIMIT_EXCEEDED"));

    const updated = bolt.getBounty(bounty.id);
    assert.equal(updated?.status, "REJECTED");
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Section C: Cross-Agent Shared Financial Behavior (Mandatory Core Z-Bits Test)
// ============================================================================

test("Cross-Agent: Maya and Bolt strictly share single owner recipient limit and ledger", async () => {
  const { root, db, maya, bolt, gate } = setupAgentTestEnv({
    maxPerOrderCents: 50000,          // $500 max per transaction
    dailyBudgetCents: 100000,         // $1,000 daily
    requireApprovalAboveCents: 50000, // $500 threshold
  });
  try {
    // Register canonical recipient Rahul with an explicit $500 cumulative limit
    const rahul = gate.registerRecipient("local-owner", {
      id: "rec_rahul",
      displayName: "Rahul Sharma",
      trusted: true,
      recipientLimitCents: 50000, // $500.00 maximum recipient budget
    });

    // Add alias for Rahul so both agents can reference him by alias
    db.addRecipientAlias("local-owner", rahul.id, "Rahul");
    db.addRecipientAlias("local-owner", rahul.id, "Rahul S.");

    // STEP 1: Maya requests a $300 Steam gift for Rahul
    // Denomination $100 x 3 not supported as single, let's use $50 * 6 or register product package or test direct intent
    // In our runner mock, steam-usa has packages: 500 ($5), 1000 ($10), 2000 ($20), 5000 ($50), 10000 ($100)
    // Let's do $100 ($100.00 = 10000 cents) for Maya first
    const mayaResult1 = await maya.submitPurchase({
      recipientAlias: "Rahul",
      productId: "steam-usa",
      denominationCents: 10000, // $100
      occasion: "team appreciation",
    });

    assert.equal(mayaResult1.success, true);
    assert.equal(mayaResult1.decision, "ALLOW");

    const getRecipientSpent = (recipientId: string) => {
      return db
        .listSpendingLedger("local-owner")
        .filter((e) => e.recipientId === recipientId && (e.status === "RESERVED" || e.status === "SETTLED"))
        .reduce((acc, e) => acc + e.amountCents, 0);
    };

    // Verify ledger has recorded $100 spend for Rahul
    const ledgerTotal1 = getRecipientSpent("rec_rahul");
    assert.equal(ledgerTotal1, 10000);

    // STEP 2: Maya requests another $100 purchase for Rahul (Total = $200)
    const mayaResult2 = await maya.submitPurchase({
      recipientAlias: "Rahul",
      productId: "steam-usa",
      denominationCents: 10000, // $100
    });
    assert.equal(mayaResult2.success, true);
    assert.equal(getRecipientSpent("rec_rahul"), 20000);

    // STEP 3: Maya requests another $100 purchase for Rahul (Total = $300)
    const mayaResult3 = await maya.submitPurchase({
      recipientAlias: "Rahul",
      productId: "steam-usa",
      denominationCents: 10000, // $100
    });
    assert.equal(mayaResult3.success, true);
    assert.equal(getRecipientSpent("rec_rahul"), 30000);

    // Current spend on Rahul = $300. Remaining limit = $500 - $300 = $200.

    // STEP 4: Bolt attempts a $250 reward for Rahul (alias "Rahul S.")
    // Since $300 + $250 = $550 > $500 limit, Gate MUST DENY the reward!
    const bountyHigh = bolt.createBountyEvent({
      contributorAlias: "Rahul S.",
      rewardAmountCents: 25000, // $250.00
      reason: "Massive code refactoring milestone",
    });

    const boltResultDenied = await bolt.processReward({
      bountyId: bountyHigh.id,
      productId: "steam-usa",
    });

    assert.equal(boltResultDenied.success, false);
    assert.equal(boltResultDenied.decision, "DENY");
    assert.ok(
      boltResultDenied.reasonCodes?.includes("RECIPIENT_LIMIT_EXCEEDED"),
      `Expected RECIPIENT_LIMIT_EXCEEDED, got: ${boltResultDenied.reasonCodes?.join(", ")}`
    );

    // Persisted bounty status must be REJECTED
    const bountyHighRecord = bolt.getBounty(bountyHigh.id);
    assert.equal(bountyHighRecord?.status, "REJECTED");

    // Cumulative spend remains $300 (blocked request did NOT increment spend)
    assert.equal(getRecipientSpent("rec_rahul"), 30000);

    // STEP 5: Bolt now attempts a $100 reward for Rahul (Total = $300 + $100 = $400 <= $500)
    // Gate MUST ALLOW this purchase because it is within the remaining budget!
    const bountyAllowed = bolt.createBountyEvent({
      contributorAlias: "Rahul",
      rewardAmountCents: 10000, // $100.00
      reason: "Bug fix bounty",
    });

    const boltResultAllowed = await bolt.processReward({
      bountyId: bountyAllowed.id,
      productId: "steam-usa",
    });

    assert.equal(boltResultAllowed.success, true);
    assert.equal(boltResultAllowed.decision, "ALLOW");

    // Cumulative spend is now exactly $400
    assert.equal(getRecipientSpent("rec_rahul"), 40000);

    // STEP 6: Now Maya tries a $150 purchase -> $400 + $150 = $550 > $500 -> DENIED!
    // Demonstrates bidirectional enforcement: Bolt's spend restricts Maya's next spend!
    // We test with denomination 10000 ($100) + another $100 -> second one exceeds
    const mayaResultAllowed = await maya.submitPurchase({
      recipientAlias: "Rahul",
      productId: "steam-usa",
      denominationCents: 10000, // $100 -> Total becomes $500 (hits limit exactly)
    });
    assert.equal(mayaResultAllowed.success, true);
    assert.equal(getRecipientSpent("rec_rahul"), 50000);

    // Any further request for Rahul (even $5) MUST now be denied
    const mayaResultExceeded = await maya.submitPurchase({
      recipientAlias: "Rahul",
      productId: "steam-usa",
      denominationCents: 1000, // $10 -> $510 > $500
    });
    assert.equal(mayaResultExceeded.success, false);
    assert.equal(mayaResultExceeded.decision, "DENY");
    assert.ok(mayaResultExceeded.reasonCodes?.includes("RECIPIENT_LIMIT_EXCEEDED"));
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// ============================================================================
// Section D: Security & Tool Permission Boundary Tests
// ============================================================================

test("Security: Maya (nova) can execute maya_* tools but is blocked from bolt_* tools", async () => {
  const { root, db, gate } = setupAgentTestEnv();
  try {
    gate.registerRecipient("local-owner", { displayName: "Alice", trusted: true });

    // nova calling maya tool -> ALLOWED
    const mayaToolRes = await executeAgentTool(
      "maya_resolve_recipient",
      { alias: "Alice" },
      { botId: "nova", runId: "test_run_1" },
      db
    );
    assert.equal(mayaToolRes.status, "RESOLVED");

    // nova calling bolt tool -> BLOCKED with permission error
    await assert.rejects(
      async () => {
        await executeAgentTool(
          "bolt_create_bounty",
          { contributorAlias: "Alice", rewardAmountCents: 1000, reason: "Unauthorized" },
          { botId: "nova", runId: "test_run_2" },
          db
        );
      },
      /Permission denied: Agent "nova" is not authorized to call tool "bolt_create_bounty"/
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Security: Bolt (pixel) can execute bolt_* tools but is blocked from maya_* tools", async () => {
  const { root, db, gate } = setupAgentTestEnv();
  try {
    gate.registerRecipient("local-owner", { displayName: "Bob", trusted: true });

    // pixel calling bolt tool -> ALLOWED
    const boltToolRes = await executeAgentTool(
      "bolt_create_bounty",
      { contributorAlias: "Bob", rewardAmountCents: 2000, reason: "Docs update" },
      { botId: "pixel", runId: "test_run_3" },
      db
    );
    assert.ok(boltToolRes.event);

    // pixel calling maya tool -> BLOCKED with permission error
    await assert.rejects(
      async () => {
        await executeAgentTool(
          "maya_submit_purchase",
          { recipientAlias: "Bob", productId: "steam-usa", denominationCents: 2000 },
          { botId: "pixel", runId: "test_run_4" },
          db
        );
      },
      /Permission denied: Agent "pixel" is not authorized to call tool "maya_submit_purchase"/
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Security: Unknown or external bot is blocked from all financial agent tools", async () => {
  const { root, db } = setupAgentTestEnv();
  try {
    await assert.rejects(
      async () => {
        await executeAgentTool(
          "maya_resolve_recipient",
          { alias: "Alice" },
          { botId: "unauthorized_bot", runId: "test_run_5" },
          db
        );
      },
      /Permission denied/
    );

    await assert.rejects(
      async () => {
        await executeAgentTool(
          "bolt_create_bounty",
          { contributorAlias: "Alice", rewardAmountCents: 1000, reason: "Hacking attempt" },
          { botId: "unauthorized_bot", runId: "test_run_6" },
          db
        );
      },
      /Permission denied/
    );
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("Security: Neither agent can forge SpendPass tokens or bypass Runner authorization", async () => {
  const { root, db, runner } = setupAgentTestEnv();
  try {
    // Attempting to invoke runner with a forged / untrusted token
    const result = await runner.executeSpendPass({
      spendpassToken: "fake_forged_spendpass_token_xyz",
      productId: "steam-usa",
      denominationCents: 2000,
      currency: "USD",
    });
    assert.equal(result.success, false);
    assert.equal(result.status, "FAILED");
    assert.ok(result.reasonCodes.includes("INVALID_COMPACT_JWT") || result.reasonCodes.includes("INVALID_SIGNATURE"));
  } finally {
    db.close();
    rmSync(root, { recursive: true, force: true });
  }
});
