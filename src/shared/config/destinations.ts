/**
 * The destination registry — ids, default hrefs and keyboard shortcuts in one
 * place.
 *
 * **Why this file exists.** The six destinations' hrefs lived inline **inside the
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
  'docs',
  'insights',
  'projects',
  /*
   * Agents — added 2026-08-20 (ledger entry 90). The install and connect screens
   * moved out of the settings sheet: settings is where values are chosen, while
   * this is operational work with progress (download, install, sign in, repair,
   * open a conversation).
   *
   * ⚠️ **Six is the ceiling** (owner call, 2026-08-21). A seventh requires naming
   * what comes out first, and the contract enforces that.
   */
  'agents',
  'git',
] as const;

export type DestinationId = (typeof DESTINATION_IDS)[number];

/**
 * Default hrefs. In one place the rail may supply a different one from context
 * (`docs` goes to a project's own workspace inside a project), and there the
 * rail's value wins — these are the defaults for when there is no context.
 */
export const DESTINATION_HREF: Record<DestinationId, string> = {
  map: '/topology/',
  docs: '/docs/',
  insights: '/ontology/insights/',
  projects: '/projects/',
  agents: '/agents/',
  git: '/git/',
};

/** The leader key: press this, then one of the letters below, to navigate. */
export const NAV_LEADER_KEY = 'g';

/** The letter after the leader — the first letter, unless it collides, in which case another letter that still carries the meaning. */
export const DESTINATION_KEY: Record<DestinationId, string> = {
  map: 'm',
  docs: 'd',
  insights: 'i',
  projects: 'p',
  // `a` — nothing collides with it.
  agents: 'a',
  git: 'g',
};

/** How long, in ms, to wait for the second letter after the leader. */
export const NAV_LEADER_WINDOW_MS = 1500;

/** Letter → destination, the direction the handler needs. */
export const DESTINATION_BY_KEY: Record<string, DestinationId> = Object.fromEntries(
  DESTINATION_IDS.map((id) => [DESTINATION_KEY[id], id]),
) as Record<string, DestinationId>;
