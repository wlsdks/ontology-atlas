import { countWikiPages, type VaultDoc, type VaultManifest } from "@/entities/docs-vault";

import type { DomainCompositionRow } from "./domain-composition";
import type { ProjectOntologyMetrics } from "@/entities/knowledge-graph";

/**
 * One cell per Atlas surface, the ontology wide as the one winner. Each states only what it can
 * answer: ontology per project (`projectIds`), sources and wiki per folder since nothing ties a
 * file to a project, and the harness no number, since it needs a native path.
 */
export interface SurfaceCell {
  id: "ontology" | "library" | "harness";
  /** In containment order. */
  figures: { label: string; value: number }[];
  /** What is thin, or what a figureless surface holds; null when nothing true remains. */
  note: string | null;
  href: string;
}

export interface SurfaceCompositionLabels {
  domains: string;
  capabilities: string;
  elements: string;
  sources: string;
  wikiPages: string;
  planOnlyDomains: (count: number) => string;
  relations: (count: number) => string;
  ontologyEmpty: string;
  libraryEmpty: string;
  harnessHolds: string;
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
      /* Relations measure connection, not amount, so they ride the note, not a fourth figure. */
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
