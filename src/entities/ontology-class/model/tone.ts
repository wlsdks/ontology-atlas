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
    hueName: "red",
    fill: "rgba(255, 60, 80, 0.97)",
    border: "rgba(255, 60, 80, 1)",
    chipBg: "rgba(255, 60, 80, 0.16)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(255, 60, 80, 0.52)",
    nodeSize: 8.4,
  },
  domain: {
    hueName: "blue",
    fill: "rgba(47, 128, 237, 0.97)",
    border: "rgba(47, 128, 237, 1)",
    chipBg: "rgba(47, 128, 237, 0.16)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(47, 128, 237, 0.52)",
    nodeSize: 7.2,
  },
  capability: {
    hueName: "amber",
    fill: "rgba(255, 210, 0, 0.97)",
    border: "rgba(255, 210, 0, 1)",
    chipBg: "rgba(255, 210, 0, 0.17)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(255, 210, 0, 0.54)",
    nodeSize: 5.2,
  },
  element: {
    hueName: "green",
    fill: "rgba(28, 185, 120, 0.97)",
    border: "rgba(28, 185, 120, 1)",
    chipBg: "rgba(28, 185, 120, 0.16)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(28, 185, 120, 0.52)",
    nodeSize: 3.1,
  },
  unknown: {
    hueName: "violet",
    fill: "rgba(187, 107, 217, 0.97)",
    border: "rgba(187, 107, 217, 1)",
    chipBg: "rgba(187, 107, 217, 0.16)",
    chipText: "var(--color-text-primary)",
    chipBorder: "rgba(187, 107, 217, 0.52)",
    nodeSize: 3.6,
  },
};

export function isOntologyVisualKind(kind: string | null | undefined): kind is OntologyVisualKind {
  return !!kind && (ONTOLOGY_VISUAL_KINDS as readonly string[]).includes(kind);
}

export function getOntologyKindTone(kind: string | null | undefined): OntologyKindTone {
  return ONTOLOGY_KIND_TONE[isOntologyVisualKind(kind) ? kind : "unknown"];
}
