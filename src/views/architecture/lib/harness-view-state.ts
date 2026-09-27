/**
 * `/architecture` view state. `?view=` is the source of truth (refresh, shared link, agent handoff),
 * with the same grammar as `/mcp`'s `?tab=`. `structure` opens the harness anatomy and the layer
 * ladder is `architecture`; old `structure` links are not redirected. `?view=sensors` opens coverage.
 */
const HARNESS_VIEWS = ['structure', 'coverage', 'guides', 'architecture'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

/** The anatomy is the arrival: a destination named Harness must not open on the architecture ladder. */
export const DEFAULT_HARNESS_VIEW: HarnessView = 'structure';

/** Addresses that named a view this slice replaced, and what they resolve to now. */
const RETIRED_VIEWS: Readonly<Record<string, HarnessView>> = Object.freeze({
  sensors: 'coverage',
});

function isHarnessView(value: string): value is HarnessView {
  return (HARNESS_VIEWS as readonly string[]).includes(value);
}

export function parseHarnessView(raw: string | null | undefined): HarnessView {
  if (!raw) return DEFAULT_HARNESS_VIEW;
  if (isHarnessView(raw)) return raw;
  return RETIRED_VIEWS[raw] ?? DEFAULT_HARNESS_VIEW;
}

/**
 * `?role=` and `?stage=` exist only on the blueprint, so an address carrying one names it even
 * without `?view=`; older deep links depend on this.
 */
const BLUEPRINT_ONLY_PARAMS = ['role', 'stage'] as const;

/** The view an address names, directly or by a blueprint-only parameter; `?view=` always wins. */
export function resolveAddressView(
  params: URLSearchParams | null | undefined,
  /** Whether this surface can read the dot directories the structure view is about. */
  canReadHarness = true,
): HarnessView {
  const raw = params?.get('view');
  if (raw) return parseHarnessView(raw);
  if (params && BLUEPRINT_ONLY_PARAMS.some((name) => params.has(name))) return 'architecture';
  return defaultViewForSurface(canReadHarness);
}

/**
 * The browser cannot see dot directories, so the structure view would be empty there: the app
 * arrives on structure, the browser on the blueprint. An address that names a view always wins.
 */
export function defaultViewForSurface(canReadHarness: boolean): HarnessView {
  return canReadHarness ? DEFAULT_HARNESS_VIEW : 'architecture';
}

/**
 * The address for a view, keeping every other parameter so it agrees with `buildArchitectureHref`
 * (tab switches `replaceState`, so a dropped `role` is lost for Back too). The surface's own
 * arrival view omits `?view=`, and the caller says which view that is.
 */
export function buildHarnessViewHref(
  view: HarnessView,
  pathname = '/architecture/',
  search = '',
  /** The view this surface opens with no `?view=` on the address — `defaultViewForSurface`. */
  surfaceDefault: HarnessView = DEFAULT_HARNESS_VIEW,
): string {
  const params = new URLSearchParams(search);
  if (view === surfaceDefault) params.delete('view');
  else params.set('view', view);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export const HARNESS_VIEW_ORDER: readonly HarnessView[] = HARNESS_VIEWS;
