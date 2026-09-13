/**
 * `/architecture` view state. The URL `?view=` is the source of truth — a refresh, a shared link or
 * an agent handoff must open the same view — so parsing and serialization are pure functions rather
 * than component state. Same grammar as `/mcp`'s `?tab=`; two screens must not grow two ways of
 * writing the same query.
 *
 * **`coverage` is the default, and the two old addresses still land where they meant.** The tab's
 * spine is the matrix of this repository's own areas: it is the one view that can say where nothing
 * is watching, and a destination whose first screen is a detail view of one artifact type makes the
 * reader find that question instead of being handed it.
 *
 * One carve-out: **`?view=sensors` opens the coverage view.** The sensors view named exactly this —
 * which checks cover each domain's paths and where nobody is watching — and said it was not built.
 * It is built now, so the old address resolves to the answer rather than to a missing view.
 */
const HARNESS_VIEWS = ['structure', 'coverage', 'guides'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

/**
 * **The blueprint is the first tab and the arrival view** (owner, 2026-09-13).
 *
 * The coverage matrix is the tab's spine — it is the view that can say where nothing is watching —
 * and it is still one press away at `?view=coverage`. What the default decides is not which view
 * matters but which screen a person walks into, and the owner's call is the ladder. It also
 * restores the plain `/architecture/` address to exactly what every link written before this slice
 * meant, which removes the whole class of breakage the `?role=` carve-out existed to patch.
 */
export const DEFAULT_HARNESS_VIEW: HarnessView = 'structure';

/** Addresses that named a view this slice replaced, and what they resolve to now. */
const RETIRED_VIEWS: Readonly<Record<string, HarnessView>> = Object.freeze({
  sensors: 'coverage',
});

function isHarnessView(value: string): value is HarnessView {
  return (HARNESS_VIEWS as readonly string[]).includes(value);
}

/** The raw `searchParams.get("view")` value → a valid view. Unknown or missing gives the default. */
export function parseHarnessView(raw: string | null | undefined): HarnessView {
  if (!raw) return DEFAULT_HARNESS_VIEW;
  if (isHarnessView(raw)) return raw;
  return RETIRED_VIEWS[raw] ?? DEFAULT_HARNESS_VIEW;
}

/**
 * The address for a view, keeping every other parameter that was already there.
 *
 * ⚠️ **Two writers share this URL and they must not contradict each other.** `buildArchitectureHref`
 * starts from `window.location.search` and deliberately preserves the route's orthogonal flags;
 * this one used to build the address from scratch and therefore erased them. Walk it: pick a role
 * (`?view=structure&role=views`), press Guides, press Structure — `role` is gone, the inspector
 * closes, and because tab switching is a `replaceState` the entry that carried it was overwritten,
 * so Back does not bring it either. `?guides=off`, which the e2e harness sets, was lost the same
 * way (design-interaction, 2026-09-13).
 *
 * The default still omits `?view=` so the destination's plain URL stays the one a person copies.
 */
export function buildHarnessViewHref(
  view: HarnessView,
  pathname = '/architecture/',
  search = '',
): string {
  const params = new URLSearchParams(search);
  if (view === DEFAULT_HARNESS_VIEW) params.delete('view');
  else params.set('view', view);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export const HARNESS_VIEW_ORDER: readonly HarnessView[] = HARNESS_VIEWS;
