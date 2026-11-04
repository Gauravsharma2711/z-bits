/**
 * Z-Bits Personas and Identity Mapping Layer.
 *
 * Maps high-level Z-Bits product personas to underlying agent components
 * while strictly preserving internal identifiers (nova, pixel, scout).
 */

import type { BitDisplayProfile } from "./zbits-types.js";
import type { Bot } from "./types.js";

export const DEFAULT_ZBITS_PERSONAS: Record<string, BitDisplayProfile> = {
  nova: {
    internalBotId: "nova",
    personaId: "maya",
    displayName: "Maya",
    title: "Concierge Bit",
    tagline: "Your personal concierge for everyday requests, gifting, and research.",
    responsibilities: [
      "Everyday requests, deep research, and synthesis",
      "Gift recommendations and personal commerce inquiries",
      "Trip planning, vendor comparisons, and travel arrangements",
    ],
    avatarMascot: "nova",
    accentColor: "#6366f1", // Indigo / Violet
    suggestedPrompts: [
      "Help me find a thoughtful anniversary gift under $50",
      "Research the best flight options to Tokyo next spring",
      "Draft a polite inquiry to our building landlord",
    ],
    assignedProviderId: "google",
    assignedModel: "google/gemini-2.5-flash",
  },
  pixel: {
    internalBotId: "pixel",
    personaId: "bolt",
    displayName: "Bolt",
    title: "Bounty Bit",
    tagline: "Your autonomous engineering and repository workflow partner.",
    responsibilities: [
      "Repository events, bug audits, and code benchmarks",
      "Git branch workflows and automated review suggestions",
      "Contributor reward tracking and bounty delivery verification",
    ],
    avatarMascot: "blob",
    accentColor: "#2563eb", // Electric Blue
    suggestedPrompts: [
      "Check this repository for failing tests and propose a fix",
      "Review the recent commits and generate a release summary",
      "Verify the latest pull request against our engineering standards",
    ],
    assignedProviderId: "bedrock",
    assignedModel: "bedrock/us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  },
  scout: {
    internalBotId: "scout",
    personaId: "sage",
    displayName: "Sage",
    title: "Occasion Bit",
    tagline: "Keeps your calendar, birthdays, deadlines, and milestones on track.",
    responsibilities: [
      "Occasion reminders, birthdays, and calendar synchronizations",
      "Follow-up scheduling and routine check-ins",
      "Milestone tracking and timely notification alerts",
    ],
    avatarMascot: "sprout",
    accentColor: "#10b981", // Emerald / Mint
    suggestedPrompts: [
      "What birthdays or upcoming milestones do I have this month?",
      "Set a reminder for Mom's birthday two weeks in advance",
      "Review my upcoming weekly schedule and highlight conflicts",
    ],
    assignedProviderId: "google",
    assignedModel: "google/gemini-flash-lite-latest",
  },
};

/**
 * Resolves a display name for a bot: returns persona display name if configured,
 * or falls back safely to the bot's raw internal name.
 */
export function getBitDisplayName(bot: Pick<Bot, "id" | "name">): string {
  const profile = DEFAULT_ZBITS_PERSONAS[bot.id.toLowerCase()];
  if (profile) return profile.displayName;
  return bot.name;
}

/**
 * Resolves a role title for a bot: returns persona title if configured,
 * or falls back to the bot's stored role.
 */
export function getBitRoleTitle(bot: Pick<Bot, "id" | "role">): string {
  const profile = DEFAULT_ZBITS_PERSONAS[bot.id.toLowerCase()];
  if (profile) return profile.title;
  return bot.role;
}

/**
 * Resolves full Bit display profile.
 */
export function getBitProfile(botId: string): BitDisplayProfile | undefined {
  return DEFAULT_ZBITS_PERSONAS[botId.toLowerCase()];
}

/**
 * Lists all active personas with their assigned or default capabilities.
 */
export function listBitProfiles(): BitDisplayProfile[] {
  return Object.values(DEFAULT_ZBITS_PERSONAS);
}

