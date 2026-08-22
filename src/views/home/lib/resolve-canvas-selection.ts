/**
 * The slug the map may actually focus — only when the address points at
 * something this vault really holds.
 *
 * **Why this function exists (2026-08-01).** The expression used to end in
 * `?? selectedSlug`, which handed the canvas a name pointing at nothing, and the
 * engine's ego focus checks only `focusedNodeId !== null`, never existence
 * (`topology-physics-step.ts`). So a stale `?p=` left over after switching
 * vaults produced two defects:
 *
 * - The whole map dimmed. Focusing a node with zero neighbours drops every node
 *   on screen into the dim band, which reads as "the map is broken".
 * - The first-visit hint died permanently: `hasSelection` turned true and
 *   `use-sample-node-hint` recorded the lesson as learned, unclicked.
 *
 * **The rule separates "absent" from "not known yet."** Clearing focus while the
 * vault is still loading makes deep links flicker, so this returns null only
 * once the miss is certain — the same grammar the miss notice uses
 * (`deeplink-miss-notice.ts`). A kind-prefixed slug (`element:foo`) can never
 * collide with a project slug and so does not wait for the project list; a bare
 * slug might be a project, so it waits.
 */
export interface CanvasSelectionInput {
  /** The raw value the address asked for (`?p=`). */
  selectedSlug: string | null;
  /** Id resolved to a project or ontology node; null when resolution failed. */
  resolvedSlug: string | null;
  /**
   * Whether vault restore and the current ontology source have settled enough to
   * diagnose an absence. While false, the static sample may still be replaced by
   * the local graph.
   */
  sourceReady: boolean;
  /** `useProjects().loaded`. */
  projectsLoaded: boolean;
  /** Whether the ontology graph has arrived at least once. */
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
  // Not known yet: hold the raw value so the deep link does not flicker.
  if (!sourceReady || !ontologyLoaded) return selectedSlug;
  if (!selectedSlug.includes(":") && !projectsLoaded) return selectedSlug;
  // The miss is certain: never treat a ghost as selected.
  return null;
}
