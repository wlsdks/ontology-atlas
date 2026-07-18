export type AppNavRailItemId = "map" | "docs" | "builder" | "insights" | "projects";

/**
 * Pure prefix matcher for the 5 rail destinations (feat/chrome-system —
 * `docs/prototypes/chrome-rail-combined.html`). Extracted so the active-item
 * rule (which prefixes win, and in what order) is unit-testable without
 * rendering the widget — `builder`/`insights` both live under `/ontology/*`
 * so they MUST be checked before the generic `map` root-match.
 */
export function resolveActiveNavRailItem(pathname: string): AppNavRailItemId | null {
  const path = pathname || "/";
  if (path.startsWith("/ontology/edit")) return "builder";
  if (path.startsWith("/ontology/insights")) return "insights";
  if (path.startsWith("/docs")) return "docs";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}
