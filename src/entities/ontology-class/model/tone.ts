export const ONTOLOGY_VISUAL_KINDS = [
  "project",
  "domain",
  "capability",
  "element",
  "unknown",
] as const;

export type OntologyVisualKind = (typeof ONTOLOGY_VISUAL_KINDS)[number];

export interface OntologyKindTone {
  hueName: string;
  fill: string;
  border: string;
  chipBg: string;
  chipText: string;
  chipBorder: string;
  nodeSize: number;
}

/**
 * Qualitative ontology-kind palette for compact chips, legends, summaries, and
 * classification guidance. `topology-map-v2` uses its own neutral engraved
 * canvas tokens; retired Sigma/tree/Builder adapters are not consumers.
 */
export const ONTOLOGY_KIND_TONE: Record<OntologyVisualKind, OntologyKindTone> = {
  project: {
    hueName: "indigo",
    fill: "rgba(126, 134, 216, 0.94)",
    border: "rgba(126, 134, 216, 0.88)",
    chipBg: "rgba(126, 134, 216, 0.12)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(126, 134, 216, 0.46)",
    nodeSize: 8.4,
  },
  domain: {
    hueName: "teal",
    fill: "rgba(74, 177, 196, 0.94)",
    border: "rgba(74, 177, 196, 0.88)",
    chipBg: "rgba(74, 177, 196, 0.11)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(74, 177, 196, 0.44)",
    nodeSize: 7.2,
  },
  capability: {
    hueName: "amber",
    fill: "rgba(211, 159, 73, 0.94)",
    border: "rgba(211, 159, 73, 0.88)",
    chipBg: "rgba(211, 159, 73, 0.12)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(211, 159, 73, 0.46)",
    nodeSize: 5.2,
  },
  element: {
    // Strategy verdict, 2026-07-21 §C — to remove the "bootstrap green" feel:
    // sage (105,177,121, 31% saturation) → eucalyptus (124,166,141, 19%), nudged
    // cooler. `element` is the most common kind in the dogfood vault (55/105), so it
    // dominates any surface using this colour (the insights kind bars, the domain
    // capacity bar) — hence low saturation to keep it quiet. The topology-map-v2
    // canvas does not use this palette; it uses the neutral engraving tokens
    // (`--topology-v2-node-fill-*`). The alpha ramp (0.94/0.88/0.11/0.44) is unchanged.
    hueName: "eucalyptus",
    fill: "rgba(124, 166, 141, 0.94)",
    border: "rgba(124, 166, 141, 0.88)",
    chipBg: "rgba(124, 166, 141, 0.11)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(124, 166, 141, 0.44)",
    nodeSize: 3.1,
  },
  unknown: {
    hueName: "brick",
    fill: "rgba(196, 92, 92, 0.94)",
    border: "rgba(196, 92, 92, 0.88)",
    chipBg: "rgba(196, 92, 92, 0.12)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(196, 92, 92, 0.46)",
    nodeSize: 3.6,
  },
};

export function isOntologyVisualKind(kind: string | null | undefined): kind is OntologyVisualKind {
  return !!kind && (ONTOLOGY_VISUAL_KINDS as readonly string[]).includes(kind);
}

export function getOntologyKindTone(kind: string | null | undefined): OntologyKindTone {
  return ONTOLOGY_KIND_TONE[isOntologyVisualKind(kind) ? kind : "unknown"];
}
