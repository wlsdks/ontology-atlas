/**
 * `/architecture` view state. The URL `?view=` is the source of truth — a refresh, a shared link or
 * an agent handoff must open the same view — so parsing and serialization are pure functions rather
 * than component state. Same grammar as `/mcp`'s `?tab=`; two screens must not grow two ways of
 * writing the same query.
 *
 * ⚠️ **`structure` changed what it means on 2026-09-19, and that was the point of the slice.**
 * It used to open the product's layer ladder — routes, app shell, screens, widgets, features,
 * entities, shared — inside a destination called Harness. The owner named the mismatch: that ladder
 * is the codebase's **architecture**, and in the vocabulary this tab borrows, architecture fitness
 * is one of the three things a harness *regulates*, not a part of the harness itself. So the ladder
 * moved to `?view=architecture` and `structure` now opens the harness's own anatomy.
 *
 * Nothing silently redirects between the two. An old `?view=structure` link opens a real view about
 * the same repository, one tab away from the ladder, and the alternative — mapping the old address
 * to `architecture` — would have made the tab a person presses and the tab a link opens disagree
 * for the rest of the product's life.
 *
 * One carve-out remains: **`?view=sensors` opens the coverage view.** The sensors view named
 * exactly what the matrix answers — which checks cover each domain's paths, and where nobody is
 * watching — and said it was not built. It is built, so the old address resolves to the answer.
 */
const HARNESS_VIEWS = ['structure', 'coverage', 'guides', 'architecture'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

/**
 * **The arrival view is the harness's own structure** (owner, 2026-09-19).
 *
 * The owner chose the layer ladder as the arrival on 2026-09-13, when it was the only structural
 * view this destination had. Six days later he said the thing that changes the answer: the ladder
 * is not harness engineering. A destination named Harness whose first screen is the product's
 * architecture teaches the wrong word for the whole tab, so the first screen is now the anatomy —
 * what this repository tells, gates and watches — and the ladder is a press away.
 *
 * The plain `/architecture/` address still opens the tab with no query on it, which is what every
 * link written before this slice meant.
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
 * **Parameters only the blueprint has, which therefore name it when no view is written.**
 *
 * `?role=` and `?stage=` are written by the blueprint's own deep links, and they were meaningful
 * with no `?view=` beside them for as long as the blueprint was the default. Moving the default
 * would have made every one of those links — the ones this repository's writing calls the point of
 * a deep link, "look at what widgets may depend on" sent as a URL — open a screen with no roles on
 * it. Reading them is not a guess: no other view on this destination has a role or a stage.
 */
const BLUEPRINT_ONLY_PARAMS = ['role', 'stage'] as const;

/**
 * The view an address names, including the case where it names it only by what else it carries.
 *
 * An explicit `?view=` always wins; `parseHarnessView` owns it, retired names and all.
 */
export function resolveAddressView(params: URLSearchParams | null | undefined): HarnessView {
  const raw = params?.get('view');
  if (raw) return parseHarnessView(raw);
  if (params && BLUEPRINT_ONLY_PARAMS.some((name) => params.has(name))) return 'architecture';
  return DEFAULT_HARNESS_VIEW;
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
