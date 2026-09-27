/**
 * The destination registry: ids, default hrefs and keyboard shortcuts as data, so the rail,
 * keyboard navigation and the shortcut sheet read one list. Labels and icons stay in the rail.
 *
 * Navigation uses a leader key (`G`, then a letter), as GitHub and Linear do: ⌘1–⌘9 are the
 * browser's tab switches, and bare letters are taken (`D`, `F`, `?`, `/`). The time window lets
 * a person press `G` and change their mind.
 */

export const DESTINATION_IDS = [
  'map',
  'architecture',
  // Ontology documents now live inside Library; /docs remains a link alias.
  'library',
  // Automation management owns schedules; execution context remains Map or Library.
  'automations',
  'insights',
  'projects',
  // Agents: install and connect work with progress, kept out of the settings sheet.
  'agents',
  // MCP is the second tab of Agents: `/mcp/` redirects to `DESTINATION_HREF.mcp`.
  'git',
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number] | 'docs' | 'mcp';

/*
 * Persistent bottom tabs below `lg`; web may add Get App as a sixth. Architecture stays so a
 * selected route remains visible. MCP and Agents are deliberately absent: they are desk work,
 * reached below `lg` from their contextual entry points and typed addresses, and
 * `destination-shortcuts.contract.test.ts` asserts the absence.
 */
export const MOBILE_DESTINATION_IDS = [
  'map',
  'architecture',
  'library',
  'insights',
  'projects',
] as const satisfies ReadonlyArray<DestinationId>;

export type MobileDestinationId = (typeof MOBILE_DESTINATION_IDS)[number];

/**
 * Default hrefs. In one place the rail may supply a different one from context
 * (`docs` goes to a project's own workspace inside a project), and there the
 * rail's value wins — these are the defaults for when there is no context.
 */
export const DESTINATION_HREF: Record<DestinationId, string> = {
  map: '/topology/',
  architecture: '/architecture/',
  docs: '/docs/',
  insights: '/ontology/insights/',
  projects: '/projects/',
  agents: '/agents/',
  mcp: '/agents/?tab=mcp',
  library: '/library/',
  automations: '/automations/',
  git: '/git/',
};

/**
 * The Agents models tab (API keys, local runners, the external check and the record of what
 * left). Every door that used to open the settings API Key pane goes here.
 */
export const AGENTS_MODELS_HREF = '/agents/?tab=models';

/** The leader key: press this, then one of the letters below, to navigate. */
export const NAV_LEADER_KEY = 'g';

/** The letter after the leader — the first letter, unless it collides, in which case another letter that still carries the meaning. */
export const DESTINATION_KEY: Record<DestinationId, string> = {
  map: 'm',
  // `a` belongs to Agents; the second consonant keeps Architecture mnemonic.
  architecture: 'r',
  docs: 'd',
  insights: 'i',
  projects: 'p',
  agents: 'a',
  // `m` belongs to Map; `c` for the connectors it holds.
  mcp: 'c',
  library: 'l',
  // `u` — automation is a management utility, and `a` belongs to Agents.
  automations: 'u',
  git: 'g',
};

/** How long, in ms, to wait for the second letter after the leader. */
export const NAV_LEADER_WINDOW_MS = 1500;

/** Letter → destination, the direction the handler needs. */
export const DESTINATION_BY_KEY: Record<string, DestinationId> = {
  ...Object.fromEntries(DESTINATION_IDS.map((id) => [DESTINATION_KEY[id], id])),
  // Preserve the published shortcut and project-specific Docs href overrides.
  d: 'docs',
  // `g c` still lands on the connectors, now the MCP tab of Agents.
  c: 'mcp',
};

/**
 * The destinations a folder of this shape earns. The shape comes from the files
 * (`describeVaultShape`), never a setting, so a teammate sees the same rail. A wiki without a
 * map keeps the Library, Automations, Agents and Git; an empty folder or none earns everything.
 */
export function destinationsForVaultShape(
  shape: { map: boolean; wiki: boolean } | null | undefined,
): ReadonlySet<DestinationId> {
  if (!shape || shape.map || !shape.wiki) return new Set(DESTINATION_IDS);
  return new Set<DestinationId>(['library', 'automations', 'agents', 'git']);
}

/** The bottom tabs for a wiki without a map: the Library is the one place to go. */
export const WIKI_ONLY_MOBILE_DESTINATION_IDS = ['library'] as const satisfies ReadonlyArray<DestinationId>;
