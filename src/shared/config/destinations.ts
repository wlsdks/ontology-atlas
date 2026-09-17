/**
 * The destination registry — ids, default hrefs and keyboard shortcuts in one
 * place.
 *
 * **Why this file exists.** The seven destinations' hrefs lived inline **inside the
 * `AppNavRail` component**. That was enough for drawing the screen, but a
 * **second consumer that reads the list as data** (keyboard navigation and the
 * shortcut sheet) could not use it: the array inside the component is
 * interleaved with `t()` calls and icons, so it cannot be imported, and a copy
 * would start diverging from the routes immediately (Carbon).
 *
 * So **only ids and hrefs** move down here. Labels and icons belong to the
 * screen and stay in the rail — this file answers only "what exists and where
 * does it go".
 *
 * **Why a leader key (`G`, then a letter) for navigation.** ⌘1–⌘9 are **the
 * browser's tab switches**; hijacking them on the web means the app breaks the
 * user's browser, and the web is this product's gateway, so that cost is not
 * payable. Bare single letters are out too — `D` (doc drawer), `F`
 * (presentation), `?` (shortcut sheet) and `/` (palette) already occupy them.
 *
 * A leader key avoids both and **has published precedent**: GitHub (`g c`,
 * `g i`) and Linear use the same grammar. Being a sequence, it does not collide
 * with the existing single letters — `G` then `D` is a different input from `D`
 * alone.
 *
 * The time limit exists for **pressing `G` and then changing your mind**;
 * without it, a letter pressed much later would be read as navigation.
 */

export const DESTINATION_IDS = [
  'map',
  'architecture',
  // Ontology documents now live inside Library; /docs remains a link alias.
  'library',
  'insights',
  'projects',
  /*
   * Agents — added 2026-08-20 (ledger entry 90). The install and connect screens
   * moved out of the settings sheet: settings is where values are chosen, while
   * this is operational work with progress (download, install, sign in, repair,
   * open a conversation).
   */
  'agents',
  /*
   * MCP — added 2026-09-05 as its own destination, folded into Agents as its second tab
   * on 2026-09-17 (owner: "merge these two, split them as tabs inside"). `/mcp/` redirects
   * to `/agents/?tab=mcp`, and `DESTINATION_HREF.mcp` still names that address for the
   * links and the `g c` shortcut.
   */
  'git',
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number] | 'docs' | 'mcp';

/**
 * Persistent destinations below `lg`. The installed app has five slots; web may
 * add the separate Get App utility as a sixth. Keep Architecture here because a
 * selected route must remain visible in the shell that replaces the desktop rail.
 * Agents keeps its existing contextual mobile entry points rather than changing
 * the spatial order of this five-slot reading and planning ladder.
 */
/*
 * ⚠️ **MCP is deliberately absent, and 1024 is its width floor** (design council, 2026-09-05).
 *
 * Library inherits the former Docs slot and contains the ontology editor.
 *
 * Below `lg` the rail is replaced by five bottom tabs, and MCP is not one of them. That is a
 * decision, not an omission: what the screen does is hand a coding tool a config and switch
 * external servers on, and both are done at the desk with the tool open beside it. Its own
 * contextual entry points reach it below `lg` — the runner row on `/agents` links to it, and the
 * address works typed — so the route is never a trap at a narrow width; it is simply not one of
 * the five things worth a permanent slot on a phone.
 *
 * `destination-shortcuts.contract.test.ts` asserts the absence so a later pass reads it as a
 * choice rather than as something that fell out.
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
  git: '/git/',
};

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
  // `a` — nothing collides with it.
  agents: 'a',
  // `m` belongs to Map; `c` is the letter this destination's own name turns on
  // (the connectors it holds), so the mnemonic survives the collision.
  mcp: 'c',
  // `l` — nothing collides with it, and it is the destination's own first letter.
  library: 'l',
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
 * The destinations a folder of this shape earns.
 *
 * Owner direction 2026-09-06: a person with documents and no code should not meet the
 * map, the architecture reading or the ontology analysis as empty doors. The shape comes
 * from the files (`describeVaultShape`), never a setting, so a teammate who pulls the
 * folder sees the same rail. Agents, MCP and history stay: a wiki is compiled by an agent
 * and read as diffs too. The Library stays as well — PO review the same day: it holds
 * `sources/` for any folder, the CLI writes the wiki template into every code vault, and
 * hiding it would have retired a door from every vault made before today. An empty
 * folder, or no folder, earns everything — there is nothing to hide.
 */
export function destinationsForVaultShape(
  shape: { map: boolean; wiki: boolean } | null | undefined,
): ReadonlySet<DestinationId> {
  if (!shape || shape.map || !shape.wiki) return new Set(DESTINATION_IDS);
  return new Set<DestinationId>(['library', 'agents', 'git']);
}

/** The bottom tabs for a wiki without a map: the Library is the one place to go. */
export const WIKI_ONLY_MOBILE_DESTINATION_IDS = ['library'] as const satisfies ReadonlyArray<DestinationId>;
