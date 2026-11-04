import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ZBITS_PERSONAS,
  getBitDisplayName,
  getBitRoleTitle,
  getBitProfile,
  listBitProfiles,
} from "./zbits-personas.js";

test("Z-Bits Personas: Preserves internal runtime IDs while mapping user-facing display names", () => {
  // 1. Verify internal IDs are strictly preserved
  assert.equal(DEFAULT_ZBITS_PERSONAS.nova.internalBotId, "nova");
  assert.equal(DEFAULT_ZBITS_PERSONAS.pixel.internalBotId, "pixel");
  assert.equal(DEFAULT_ZBITS_PERSONAS.scout.internalBotId, "scout");

  // 2. Verify display names: Maya, Bolt, Sage
  assert.equal(getBitDisplayName({ id: "nova", name: "Nova" }), "Maya");
  assert.equal(getBitDisplayName({ id: "pixel", name: "Pixel" }), "Bolt");
  assert.equal(getBitDisplayName({ id: "scout", name: "Scout" }), "Sage");

  // 3. Fallback for custom bots
  assert.equal(getBitDisplayName({ id: "custom-bot-1", name: "Custom Agent" }), "Custom Agent");

  // 4. Role titles
  assert.equal(getBitRoleTitle({ id: "nova", role: "General Assistant" }), "Concierge Bit");
  assert.equal(getBitRoleTitle({ id: "pixel", role: "Code Expert" }), "Bounty Bit");
  assert.equal(getBitRoleTitle({ id: "scout", role: "Organizer" }), "Occasion Bit");

  // 5. Profiles and persona listings
  const profile = getBitProfile("nova");
  assert.ok(profile);
  assert.equal(profile.personaId, "maya");
  assert.ok(profile.responsibilities.length > 0);

  const all = listBitProfiles();
  assert.equal(all.length, 3);
});
