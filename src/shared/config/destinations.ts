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
  'docs',
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
   * MCP — added 2026-09-05. The folder's own MCP connection and the external
   * connectors left `/agents`, which had grown into two unrelated jobs under one
   * title: "which coding tools does this computer have" and "what does an agent
   * reach through MCP". Owner: *"Agents itself needs a redesign — MCP separately
   * (doesn't it need its own LNB tab?) …"*
   *
   * ⚠️ **Eight is the current ceiling.** The seven-cap that decision (91) closed on
   * 2026-08-21 is reopened by this record, measured rather than assumed: at the
   * app's minimum window (1040×720) the eight tiles plus the utility tier are
   * drawn without clipping, and the destinations pane owns its own scroll for
   * every case beyond that. A ninth requires another measured decision, and
   * `destination-shortcuts.contract.test.ts` enforces that.
   */
  'mcp',
  'git',
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];

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
  'docs',
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
  mcp: '/mcp/',
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
  git: 'g',
};

/** How long, in ms, to wait for the second letter after the leader. */
export const NAV_LEADER_WINDOW_MS = 1500;

/** Letter → destination, the direction the handler needs. */
export const DESTINATION_BY_KEY: Record<string, DestinationId> = Object.fromEntries(
  DESTINATION_IDS.map((id) => [DESTINATION_KEY[id], id]),
) as Record<string, DestinationId>;
