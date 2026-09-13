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
 * Two carve-outs keep that from breaking links written before it:
 *
 * - **`?view=sensors` opens the coverage view.** The sensors view named exactly this — which checks
 *   cover each domain's paths and where nobody is watching — and said it was not built. It is built
 *   now, so the old address resolves to the answer rather than to a missing view.
 * - **`?role=` with no `?view=` opens the blueprint.** That is the ladder's own deep link
 *   (`ArchitectureWorkbench` reads `searchParams.get('role')`), so a link naming a role must land on
 *   the view that can show one. Measured in the installed app before this rule was written this
 *   way: the first attempt keyed on `?focus=`, and **every left-rail link carries `?focus=main`** as
 *   its skip-to-content anchor — so one rail click on Harness opened the ladder and the new default
 *   was unreachable from the rail. A parameter the whole shell writes cannot also be one view's
 *   deep link.
 */
const HARNESS_VIEWS = ['coverage', 'guides', 'structure'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

export const DEFAULT_HARNESS_VIEW: HarnessView = 'coverage';

/** The view a `?role=` deep link names — the only one that can show a role. */
const ROLE_HARNESS_VIEW: HarnessView = 'structure';

/** Addresses that named a view this slice replaced, and what they resolve to now. */
const RETIRED_VIEWS: Readonly<Record<string, HarnessView>> = Object.freeze({
  sensors: 'coverage',
});

function isHarnessView(value: string): value is HarnessView {
  return (HARNESS_VIEWS as readonly string[]).includes(value);
}

/**
 * The raw `searchParams.get("view")` value → a valid view. Unknown or missing gives the default,
 * except that a request carrying `?role=` and no view means the blueprint.
 */
export function parseHarnessView(
  raw: string | null | undefined,
  options: { hasRole?: boolean } = {},
): HarnessView {
  if (!raw) return options.hasRole ? ROLE_HARNESS_VIEW : DEFAULT_HARNESS_VIEW;
  if (isHarnessView(raw)) return raw;
  return RETIRED_VIEWS[raw] ?? DEFAULT_HARNESS_VIEW;
}

/**
 * The address for a view. The default omits `?view=` so the destination's plain URL stays the one a
 * person copies.
 */
export function buildHarnessViewHref(view: HarnessView, pathname = '/architecture/'): string {
  return view === DEFAULT_HARNESS_VIEW ? pathname : `${pathname}?view=${view}`;
}

export const HARNESS_VIEW_ORDER: readonly HarnessView[] = HARNESS_VIEWS;
