export const capabilityTitles = {
  overview: "Overview", spending: "Spending & Rules",
  team: "My Bits", usage: "Usage & limits", provider: "AI Providers", connectors: "Apps & tools", projects: "Projects", bot: "Bit settings",
  files: "Files", artifacts: "Files & results", routines: "Automations", control: "Permissions", computer: "Computer",
  teach: "Memory & skills", knows: "What they know", remote: "Your phone", telegram: "Chat apps", live: "Activity & recovery", search: "Search",
} as const;
export type CapabilityPanel = keyof typeof capabilityTitles;
export function isCapabilityPanel(value: string | null): value is CapabilityPanel {
  return value !== null && Object.hasOwn(capabilityTitles, value);
}
