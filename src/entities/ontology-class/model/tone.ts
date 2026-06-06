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
 * Qualitative ontology-kind palette shared by Sigma, tree chips, and builder
 * palette swatches. Keep these colors categorical: kind is nominal data, not a
 * sequential scale.
 */
export const ONTOLOGY_KIND_TONE: Record<OntologyVisualKind, OntologyKindTone> = {
  project: {
    hueName: "magenta",
    fill: "rgba(255, 60, 180, 0.97)",
    border: "rgba(255, 60, 180, 1)",
    chipBg: "rgba(255, 60, 180, 0.24)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(255, 60, 180, 0.72)",
    nodeSize: 8.4,
  },
  domain: {
    hueName: "cyan",
    fill: "rgba(0, 180, 255, 0.97)",
    border: "rgba(0, 180, 255, 1)",
    chipBg: "rgba(0, 180, 255, 0.24)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(0, 180, 255, 0.72)",
    nodeSize: 7.2,
  },
  capability: {
    hueName: "yellow",
    fill: "rgba(255, 245, 0, 0.97)",
    border: "rgba(255, 245, 0, 1)",
    chipBg: "rgba(255, 245, 0, 0.25)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(255, 245, 0, 0.74)",
    nodeSize: 5.2,
  },
  element: {
    hueName: "green",
    fill: "rgba(40, 230, 90, 0.97)",
    border: "rgba(40, 230, 90, 1)",
    chipBg: "rgba(40, 230, 90, 0.24)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(40, 230, 90, 0.72)",
    nodeSize: 3.1,
  },
  unknown: {
    hueName: "orange",
    fill: "rgba(255, 80, 0, 0.97)",
    border: "rgba(255, 80, 0, 1)",
    chipBg: "rgba(255, 80, 0, 0.24)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(255, 80, 0, 0.72)",
    nodeSize: 3.6,
  },
};

export function isOntologyVisualKind(kind: string | null | undefined): kind is OntologyVisualKind {
  return !!kind && (ONTOLOGY_VISUAL_KINDS as readonly string[]).includes(kind);
}

export function getOntologyKindTone(kind: string | null | undefined): OntologyKindTone {
  return ONTOLOGY_KIND_TONE[isOntologyVisualKind(kind) ? kind : "unknown"];
}
