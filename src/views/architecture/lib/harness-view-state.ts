/**
 * `/architecture` view state. The URL `?view=` is the source of truth — a refresh, a shared link or
 * an agent handoff must open the same view — so parsing and serialization are pure functions rather
 * than component state. Same grammar as `/mcp`'s `?tab=`; two screens must not grow two ways of
 * writing the same query.
 *
 * **`structure` is the default because the route already meant it.** Every existing link, bookmark
 * and `?focus=` deep link into `/architecture` points at the blueprint, and a rename that quietly
 * changed where those land would be a route change wearing a label change's clothes.
 */
const HARNESS_VIEWS = ['guides', 'structure', 'sensors'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

export const DEFAULT_HARNESS_VIEW: HarnessView = 'structure';

function isHarnessView(value: string): value is HarnessView {
  return (HARNESS_VIEWS as readonly string[]).includes(value);
}

/** The raw `searchParams.get("view")` value → a valid view. Unknown or missing gives the default. */
export function parseHarnessView(raw: string | null | undefined): HarnessView {
  if (!raw) return DEFAULT_HARNESS_VIEW;
  return isHarnessView(raw) ? raw : DEFAULT_HARNESS_VIEW;
}

/**
 * The address for a view. The default omits `?view=` so the destination's plain URL stays the one a
 * person copies, and every link written before this slice keeps working unchanged.
 */
export function buildHarnessViewHref(view: HarnessView, pathname = '/architecture/'): string {
  return view === DEFAULT_HARNESS_VIEW ? pathname : `${pathname}?view=${view}`;
}

export const HARNESS_VIEW_ORDER: readonly HarnessView[] = HARNESS_VIEWS;
