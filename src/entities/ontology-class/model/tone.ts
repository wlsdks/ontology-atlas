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
 * Qualitative ontology-kind palette shared by Sigma, tree chips, builder
 * palette swatches, and the Browse detail modal. Graph fills stay visible on a
 * dark canvas, while UI chips use quiet alpha so kind color works as hierarchy
 * rather than decoration.
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
    hueName: "sage",
    fill: "rgba(105, 177, 121, 0.94)",
    border: "rgba(105, 177, 121, 0.88)",
    chipBg: "rgba(105, 177, 121, 0.11)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(105, 177, 121, 0.44)",
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
