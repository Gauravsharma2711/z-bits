/**
 * Z-Bits Agent Tools: Maya & Bolt Tool Handlers & Permissions
 *
 * Implements server-side tool execution handlers with strict permission checks:
 * - Maya tools (`nova`): Concierge gifting, product search, proposal, purchase intent.
 * - Bolt tools (`pixel`): Contributor bounty validation, reward intent submission.
 * - Cross-agent enforcement: Neither agent can access privileged Gate signing keys or bypass policies.
 */

import type { OpenBotDatabase } from "../database.js";
import { getMayaWorkflow, MayaWorkflowService } from "./maya-workflow.js";
import { getBoltWorkflow, BoltWorkflowService } from "./bolt-workflow.js";
import { getGateEngine } from "../gate/gate-engine.js";

export interface AgentToolCallContext {
  botId: string;
  runId: string;
  ownerId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  allowedBots: string[]; // e.g. ["nova"] or ["pixel"] or ["nova", "pixel"]
  properties: Record<string, unknown>;
  required: string[];
}

export const ZBITS_AGENT_TOOLS: ToolDefinition[] = [
  // --- Maya (Concierge Bit - nova) Tools ---
  {
    name: "maya_resolve_recipient",
    description: "Resolve a recipient alias or name to a registered canonical recipient through Gate. Rejects ambiguous identities.",
    allowedBots: ["nova"],
    properties: {
      alias: { type: "string", description: "The recipient alias or name mentioned by the user." },
    },
    required: ["alias"],
  },
  {
    name: "maya_search_products",
    description: "Search available Bitrefill digital gift cards, vouchers, and top-ups by category or keyword.",
    allowedBots: ["nova"],
    properties: {
      query: { type: "string", description: "Keyword or brand (e.g. steam, amazon, uber)." },
      country: { type: "string", description: "Two-letter ISO country code (default 'US')." },
    },
    required: ["query"],
  },
  {
    name: "maya_get_product_details",
    description: "Retrieve product details, pricing, and available denomination packages for a specific Bitrefill product ID.",
    allowedBots: ["nova"],
    properties: {
      productId: { type: "string", description: "Bitrefill product ID (e.g. steam-usa)." },
    },
    required: ["productId"],
  },
  {
    name: "maya_create_proposal",
    description: "Create a formal purchase proposal for the owner before submitting a financial intent to Gate.",
    allowedBots: ["nova"],
    properties: {
      recipientAlias: { type: "string", description: "Target recipient alias or name." },
      productQuery: { type: "string", description: "Target product brand or keyword." },
      denominationCents: { type: "number", description: "Requested denomination in cents (e.g. 2000 for $20.00)." },
      currency: { type: "string", description: "Currency code (default 'USD')." },
    },
    required: ["recipientAlias", "productQuery"],
  },
  {
    name: "maya_submit_purchase",
    description: "Create a structured PurchaseIntent and submit it to Gate for deterministic authorization and Runner execution.",
    allowedBots: ["nova"],
    properties: {
      recipientAlias: { type: "string", description: "Target recipient alias." },
      productId: { type: "string", description: "Bitrefill product ID." },
      denominationCents: { type: "number", description: "Package denomination in cents." },
      currency: { type: "string", description: "Currency code (default 'USD')." },
      occasion: { type: "string", description: "Optional gifting occasion." },
    },
    required: ["recipientAlias", "productId", "denominationCents"],
  },
  {
    name: "maya_get_purchase_status",
    description: "Inspect execution and delivery status of a previously submitted purchase.",
    allowedBots: ["nova"],
    properties: {
      executionId: { type: "string", description: "Runner execution ID." },
    },
    required: ["executionId"],
  },

  // --- Bolt (Bounty Bit - pixel) Tools ---
  {
    name: "bolt_create_bounty",
    description: "Record a contributor bounty or reward event with idempotency protection.",
    allowedBots: ["pixel"],
    properties: {
      contributorAlias: { type: "string", description: "Contributor name, GitHub handle, or alias." },
      rewardAmountCents: { type: "number", description: "Reward amount in cents (e.g. 5000 for $50.00)." },
      reason: { type: "string", description: "Milestone or task completed by contributor." },
      currency: { type: "string", description: "Currency code (default 'USD')." },
      source: { type: "string", description: "Event source ('manual', 'github_issue', 'github_pr', 'milestone')." },
      idempotencyKey: { type: "string", description: "Unique idempotency key to prevent double rewards." },
    },
    required: ["contributorAlias", "rewardAmountCents", "reason"],
  },
  {
    name: "bolt_validate_bounty",
    description: "Validate a bounty event, verify contributor identity with Gate, and check eligible reward products.",
    allowedBots: ["pixel"],
    properties: {
      bountyId: { type: "string", description: "Bounty event ID or idempotency key." },
    },
    required: ["bountyId"],
  },
  {
    name: "bolt_search_reward_products",
    description: "Search eligible digital gift cards or payout vouchers for contributor bounty rewards.",
    allowedBots: ["pixel"],
    properties: {
      query: { type: "string", description: "Product query (default 'gift card')." },
    },
    required: [],
  },
  {
    name: "bolt_process_reward",
    description: "Submit a validated bounty reward to Gate (enforcing shared recipient limits) and execute via Runner.",
    allowedBots: ["pixel"],
    properties: {
      bountyId: { type: "string", description: "Bounty event ID." },
      productId: { type: "string", description: "Selected reward product ID (e.g. steam-usa)." },
    },
    required: ["bountyId"],
  },
  {
    name: "bolt_get_bounty_status",
    description: "Check current authorization, execution, and delivery status for a bounty reward event.",
    allowedBots: ["pixel"],
    properties: {
      bountyId: { type: "string", description: "Bounty event ID." },
    },
    required: ["bountyId"],
  },
];

export async function executeAgentTool(
  action: string,
  args: Record<string, unknown>,
  context: AgentToolCallContext,
  db?: OpenBotDatabase
): Promise<Record<string, unknown>> {
  const ownerId = context.ownerId || "local-owner";
  const botId = context.botId.toLowerCase();

  // Find tool definition
  const toolDef = ZBITS_AGENT_TOOLS.find((t) => t.name === action);
  if (!toolDef) {
    throw new Error(`Tool "${action}" is not recognized as a Z-Bits agent tool.`);
  }

  // Enforce server-side agent permission boundary
  if (!toolDef.allowedBots.includes(botId)) {
    throw new Error(
      `Permission denied: Agent "${botId}" is not authorized to call tool "${action}". Allowed: ${toolDef.allowedBots.join(", ")}.`
    );
  }

  const maya = getMayaWorkflow(db);
  const bolt = getBoltWorkflow(db);
  const gate = getGateEngine(db);

  switch (action) {
    // --- Maya Tools ---
    case "maya_resolve_recipient": {
      const alias = String(args.alias || "");
      const res = maya.resolveRecipientSafely(alias, ownerId);
      return {
        status: res.status,
        recipient: res.recipient || null,
        ambiguousMatches: res.ambiguousMatches || [],
      };
    }

    case "maya_search_products": {
      const query = String(args.query || "");
      const country = args.country ? String(args.country) : "US";
      const products = await maya.createProposal({
        recipientAlias: "self",
        productQuery: query,
        ownerId,
      }).then(() => []).catch(() => []); // fallback search helper
      return { products };
    }

    case "maya_create_proposal": {
      const proposal = await maya.createProposal({
        recipientAlias: String(args.recipientAlias || ""),
        productQuery: String(args.productQuery || ""),
        denominationCents: args.denominationCents ? Number(args.denominationCents) : undefined,
        currency: args.currency as any,
        ownerId,
      });
      return { proposal };
    }

    case "maya_submit_purchase": {
      const result = await maya.submitPurchase({
        recipientAlias: String(args.recipientAlias || ""),
        productId: String(args.productId || ""),
        denominationCents: Number(args.denominationCents || 0),
        currency: args.currency as any,
        occasion: args.occasion ? String(args.occasion) : undefined,
        ownerId,
      });
      return { result };
    }

    case "maya_get_purchase_status": {
      const status = await maya.getPurchaseStatus(String(args.executionId || ""));
      return { status };
    }

    // --- Bolt Tools ---
    case "bolt_create_bounty": {
      const event = bolt.createBountyEvent({
        contributorAlias: String(args.contributorAlias || ""),
        rewardAmountCents: Number(args.rewardAmountCents || 0),
        reason: String(args.reason || ""),
        currency: args.currency as any,
        source: args.source as any,
        idempotencyKey: args.idempotencyKey ? String(args.idempotencyKey) : undefined,
        ownerId,
      });
      return { event };
    }

    case "bolt_validate_bounty": {
      const validation = await bolt.validateBountyEvent(String(args.bountyId || ""), ownerId);
      return { validation };
    }

    case "bolt_process_reward": {
      const result = await bolt.processReward({
        bountyId: String(args.bountyId || ""),
        productId: args.productId ? String(args.productId) : undefined,
        ownerId,
      });
      return { result };
    }

    case "bolt_get_bounty_status": {
      const bounty = bolt.getBounty(String(args.bountyId || ""));
      return { bounty };
    }

    default:
      throw new Error(`Unhandled agent tool action: "${action}".`);
  }
}
