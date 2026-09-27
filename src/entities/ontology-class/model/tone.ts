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

/** Kind hues for chips, legends and summaries; `ontology-map` uses its own canvas tokens. */
export const ONTOLOGY_KIND_TONE: Record<OntologyVisualKind, OntologyKindTone> = {
  project: {
    hueName: "indigo",
    fill: "var(--color-kind-project-fill)",
    border: "var(--color-kind-project-border)",
    chipBg: "var(--color-kind-project-chip-bg)",
    chipText: "var(--color-text-primary)",
    chipBorder: "var(--color-kind-project-chip-border)",
    nodeSize: 8.4,
  },
  domain: {
    hueName: "teal",
    fill: "var(--color-kind-domain-fill)",
    border: "var(--color-kind-domain-border)",
    chipBg: "var(--color-kind-domain-chip-bg)",
    chipText: "var(--color-text-primary)",
    chipBorder: "var(--color-kind-domain-chip-border)",
    nodeSize: 7.2,
  },
  capability: {
    hueName: "amber",
    fill: "var(--color-kind-capability-fill)",
    border: "var(--color-kind-capability-border)",
    chipBg: "var(--color-kind-capability-chip-bg)",
    chipText: "var(--color-text-primary)",
    chipBorder: "var(--color-kind-capability-chip-border)",
    nodeSize: 5.2,
  },
  element: {
    hueName: "eucalyptus",
    fill: "var(--color-kind-element-fill)",
    border: "var(--color-kind-element-border)",
    chipBg: "var(--color-kind-element-chip-bg)",
    chipText: "var(--color-text-primary)",
    chipBorder: "var(--color-kind-element-chip-border)",
    nodeSize: 3.1,
  },
  unknown: {
    hueName: "brick",
    fill: "var(--color-kind-unknown-fill)",
    border: "var(--color-kind-unknown-border)",
    chipBg: "var(--color-kind-unknown-chip-bg)",
    chipText: "var(--color-text-primary)",
    chipBorder: "var(--color-kind-unknown-chip-border)",
    nodeSize: 3.6,
  },
};

/**
 * The same hues as paint for canvas, images and contrast checks, which cannot read CSS variables;
 * mirrors `app/globals.css` (`kind-tone-mirror.contract.test.ts`). DOM uses `ONTOLOGY_KIND_TONE`.
 */
export const ONTOLOGY_KIND_PAINT: Record<OntologyVisualKind, { rgb: readonly [number, number, number]; fill: string; chipBg: string }> = {
  project: { rgb: [126, 134, 216], fill: "rgba(126, 134, 216, 0.94)", chipBg: "rgba(126, 134, 216, 0.12)" },
  domain: { rgb: [74, 177, 196], fill: "rgba(74, 177, 196, 0.94)", chipBg: "rgba(74, 177, 196, 0.11)" },
  capability: { rgb: [211, 159, 73], fill: "rgba(211, 159, 73, 0.94)", chipBg: "rgba(211, 159, 73, 0.12)" },
  element: { rgb: [124, 166, 141], fill: "rgba(124, 166, 141, 0.94)", chipBg: "rgba(124, 166, 141, 0.11)" },
  unknown: { rgb: [196, 92, 92], fill: "rgba(196, 92, 92, 0.94)", chipBg: "rgba(196, 92, 92, 0.12)" },
};

function isOntologyVisualKind(kind: string | null | undefined): kind is OntologyVisualKind {
  return !!kind && (ONTOLOGY_VISUAL_KINDS as readonly string[]).includes(kind);
}

export function getOntologyKindTone(kind: string | null | undefined): OntologyKindTone {
  return ONTOLOGY_KIND_TONE[isOntologyVisualKind(kind) ? kind : "unknown"];
}
