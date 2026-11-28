import type { HarnessSearch } from '@/shared/lib/navigation/screen-searches';
import { firstSearchText } from '@/shared/lib/navigation/search-text';

const HARNESS_VIEWS = ['overview', 'architecture'] as const;

export type HarnessView = (typeof HARNESS_VIEWS)[number];

export const DEFAULT_HARNESS_VIEW: HarnessView = 'overview';

const RETIRED_VIEWS: Readonly<Record<string, HarnessView>> = Object.freeze({
  sensors: 'overview',
  structure: 'overview',
  coverage: 'overview',
  guides: 'overview',
});

function isHarnessView(value: string): value is HarnessView {
  return (HARNESS_VIEWS as readonly string[]).includes(value);
}

export function parseHarnessView(raw: string | null | undefined): HarnessView {
  if (!raw) return DEFAULT_HARNESS_VIEW;
  if (isHarnessView(raw)) return raw;
  return (Object.hasOwn(RETIRED_VIEWS, raw) ? RETIRED_VIEWS[raw] : undefined) ?? DEFAULT_HARNESS_VIEW;
}

/**
 * `?role=` and `?stage=` exist only on the blueprint, so an address carrying one names it even
 * without `?view=`; older deep links depend on this.
 */
const BLUEPRINT_ONLY_PARAMS = ['role', 'stage'] as const;

export type { HarnessSearch } from '@/shared/lib/navigation/screen-searches';

export function resolveAddressView(search: HarnessSearch): HarnessView {
  const raw = firstSearchText(search.view);
  if (raw) return parseHarnessView(raw);
  if (BLUEPRINT_ONLY_PARAMS.some((name) => search[name] !== undefined)) return 'architecture';
  return DEFAULT_HARNESS_VIEW;
}

/**
 * The address for a view, keeping every other parameter so it agrees with `buildArchitectureHref`
 * (tab switches `replaceState`, so a dropped `role` is lost for Back too). The arrival view omits
 * `?view=`.
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

export function rewriteRetiredView(search: string): string | null {
  const params = new URLSearchParams(search);
  const raw = params.get('view');
  const next = raw && Object.hasOwn(RETIRED_VIEWS, raw) ? RETIRED_VIEWS[raw] : undefined;
  if (!next) return null;
  params.set('view', next);
  return `?${params.toString()}`;
}
