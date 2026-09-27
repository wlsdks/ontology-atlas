/**
 * The slug the map may focus: only one this vault holds, or a stale `?p=` dims the whole map (ego
 * focus checks only non-null) and marks the first-visit hint learned. Returns null only once the
 * miss is certain, like `deeplink-miss-notice.ts`: a bare slug waits for projects.
 */
export interface CanvasSelectionInput {
  selectedSlug: string | null;
  resolvedSlug: string | null;
  /** While false, the static sample may still be replaced by the local graph. */
  sourceReady: boolean;
  projectsLoaded: boolean;
  ontologyLoaded: boolean;
}

export function resolveCanvasSelectedSlug({
  selectedSlug,
  resolvedSlug,
  sourceReady,
  projectsLoaded,
  ontologyLoaded,
}: CanvasSelectionInput): string | null {
  if (resolvedSlug) return resolvedSlug;
  if (!selectedSlug) return null;
  // Hold the raw value so the deep link does not flicker.
  if (!sourceReady || !ontologyLoaded) return selectedSlug;
  if (!selectedSlug.includes(":") && !projectsLoaded) return selectedSlug;
  return null;
}
