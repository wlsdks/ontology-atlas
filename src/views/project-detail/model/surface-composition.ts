import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";

import type { DomainCompositionRow } from "./domain-composition";
import type { ProjectOntologyMetrics } from "./project-ontology-metrics";

/**
 * What this project has built on each of Atlas's own surfaces — the project page's first answer.
 *
 * Owner, 2026-09-19, looking at the page: the overview showed the whole document and little
 * else, when what a project page is for is *"how much ontology, harness and library is built in
 * here"*, read fast, then choose where to go. So the page leads with one cell per surface
 * rather than with prose.
 *
 * **The three are not equals.** A project *is* its ontology; the Library holds the raw material
 * beside it and the Harness holds the rules an agent works under. So the ontology cell is the
 * wide one and the other two are narrow. One attention winner, which
 * is the rule this page had lost: five figures at one weight read as "everything matters, so
 * nothing does".
 *
 * **Each cell states only what its surface can honestly answer from here.** The ontology is
 * scoped to this project, because its nodes carry `projectIds`. Sources and wiki pages are
 * folder-wide and say so: nothing in a vault ties a source file to one project, and inventing a
 * per-project number would be the fabrication this repository refuses everywhere else. The
 * harness is read from the source tree the folder belongs to, which needs a native path the
 * browser does not have, so its cell carries what the destination holds and its door rather
 * than a number it cannot stand behind.
 */
export interface SurfaceCell {
  id: "ontology" | "library" | "harness";
  /** The figures this surface can state, in containment order. Empty when it has none. */
  figures: { label: string; value: number }[];
  /**
   * One short line under the figures: what is thin, or what the surface holds when it has no
   * figures. Null when there is nothing true to add.
   */
  note: string | null;
  /** Where the cell opens. */
  href: string;
}

/*
 * **No bar at project scale, deliberately.** A proportion mark is what makes a composition read
 * in one glance, and this page has one — the capability-to-element bar on every domain row
 * below. A second bar over the project's own totals would encode 8 : 34 : 64, which is a
 * containment pyramid rather than parts of a whole: drawn as proportion it says only "elements
 * are the most numerous", which is true of every healthy map and therefore tells a reader
 * nothing. The three figures are the composition here; the thin-spot line is the judgement.
 */

export interface SurfaceCompositionLabels {
  domains: string;
  capabilities: string;
  elements: string;
  sources: string;
  wikiPages: string;
  /** Domains that name capabilities but hold no element yet — named, not yet evidenced. */
  planOnlyDomains: (count: number) => string;
  /** How connected the project's own map is. A different kind from the containment figures. */
  relations: (count: number) => string;
  ontologyEmpty: string;
  libraryEmpty: string;
  harnessHolds: string;
}

/** Wiki pages are the folder's `wiki/` documents; the Library counts them the same way. */
export function countWikiPages(docs: readonly VaultDoc[]): number {
  let count = 0;
  for (const doc of docs) if (doc.slug.startsWith("wiki/")) count += 1;
  return count;
}

/** Domains that name at least one capability and hold no element: named, not yet evidenced. */
export function countPlanOnlyDomains(domains: readonly DomainCompositionRow[]): number {
  let count = 0;
  for (const domain of domains) {
    if (domain.capabilityCount > 0 && domain.elementCount === 0) count += 1;
  }
  return count;
}

export function buildSurfaceComposition({
  metrics,
  domains,
  manifest,
  docs,
  labels,
  hrefs,
}: {
  metrics: ProjectOntologyMetrics;
  domains: readonly DomainCompositionRow[];
  manifest: VaultManifest | null;
  docs: readonly VaultDoc[];
  labels: SurfaceCompositionLabels;
  hrefs: { ontology: string; library: string; harness: string };
}): SurfaceCell[] {
  const planOnly = countPlanOnlyDomains(domains);
  const ontologyTotal = metrics.domains + metrics.capabilities + metrics.elements;
  const sources = manifest?.sources?.length ?? 0;
  const wikiPages = countWikiPages(docs);
  return [
    {
      id: "ontology",
      figures:
        ontologyTotal > 0
          ? [
            { label: labels.domains, value: metrics.domains },
            { label: labels.capabilities, value: metrics.capabilities },
            { label: labels.elements, value: metrics.elements },
          ]
          : [],
      /*
       * Relations are a different kind from the containment figures — they say how connected the
       * map is, not how much of it there is — so they ride the note line rather than becoming a
       * fourth figure of equal weight. The thin-spot clause joins them when there is one, because
       * both sentences are about the same surface's state.
       */
      note:
        ontologyTotal === 0
          ? labels.ontologyEmpty
          : [
              metrics.relations > 0 ? labels.relations(metrics.relations) : null,
              planOnly > 0 ? labels.planOnlyDomains(planOnly) : null,
            ]
              .filter((part): part is string => part !== null)
              .join(" · ") || null,
      href: hrefs.ontology,
    },
    {
      id: "library",
      figures:
        sources + wikiPages > 0
          ? [
            { label: labels.sources, value: sources },
            { label: labels.wikiPages, value: wikiPages },
          ]
          : [],
      note: sources + wikiPages === 0 ? labels.libraryEmpty : null,
      href: hrefs.library,
    },
    {
      id: "harness",
      figures: [],
      note: labels.harnessHolds,
      href: hrefs.harness,
    },
  ];
}
