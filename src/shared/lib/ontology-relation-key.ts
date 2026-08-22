export type OntologyRelationKey =
  | "domains"
  | "capabilities"
  | "elements"
  | "dependencies"
  | "contains"
  | "describes"
  | "relates";

const GRAPH_ID_KIND_TO_ONTOLOGY_KIND: Record<string, string> = {
  domain: "domain",
  domains: "domain",
  capability: "capability",
  capabilities: "capability",
  element: "element",
  elements: "element",
  project: "project",
  document: "document",
  documents: "document",
};

/**
 * **Single source of truth** for the kind-pair → relation-key rules. The first match from the
 * top wins, so order matters: more specific rules come first. No match falls back to
 * `RELATES_FALLBACK`.
 *
 * Inferring the key and explaining why that key was chosen read the *same* table, so mapping
 * and explanation cannot structurally disagree. The two functions used to carry duplicate
 * kind-pair branches, and changing one made the explanation drift silently from the real key.
 */
interface RelationKeyRule {
  matches: (sourceKind: string, targetKind: string) => boolean;
  key: OntologyRelationKey;
  explain: (sourceKind: string, targetKind: string) => string;
}

const RELATION_KEY_RULES: readonly RelationKeyRule[] = [
  {
    matches: (s, t) => s === "project" && t === "project",
    key: "dependencies",
    explain: () =>
      "project -> project maps to dependencies because one project can depend on another project.",
  },
  {
    matches: (s, t) => s === "project" && t === "domain",
    key: "domains",
    explain: () => "project -> domain maps to domains because projects own domain areas.",
  },
  {
    matches: (s, t) => s === "project" && t === "capability",
    key: "capabilities",
    explain: () =>
      "project -> capability maps to capabilities because projects can own top-level capabilities.",
  },
  {
    matches: (s, t) => s === "project" && t === "element",
    key: "elements",
    explain: () =>
      "project -> element maps to elements because projects can directly reference concrete elements.",
  },
  {
    matches: (s, t) => s === "domain" && t === "capability",
    key: "capabilities",
    explain: () => "domain -> capability maps to capabilities because domains own capabilities.",
  },
  {
    matches: (s, t) => s === "capability" && t === "element",
    key: "elements",
    explain: () =>
      "capability -> element maps to elements because capabilities use concrete elements.",
  },
  {
    matches: (s, t) => s === "document" && t !== "document",
    key: "describes",
    explain: (_s, t) =>
      `document -> ${t} maps to describes because documents explain ontology nodes.`,
  },
  {
    matches: (s, t) =>
      (s === "domain" && t === "element") ||
      (s === "domain" && t === "domain") ||
      (s === "capability" && t === "capability"),
    key: "contains",
    explain: (s, t) =>
      `${s} -> ${t} maps to contains because this pair is explicit containment, not a loose semantic edge.`,
  },
];

const RELATES_FALLBACK: RelationKeyRule = {
  matches: () => true,
  key: "relates",
  explain: (s, t) =>
    `${s} -> ${t} falls back to relates because this pair has no hierarchy-specific graph key.`,
};

function resolveRelationKeyRule(sourceKind: string, targetKind: string): RelationKeyRule {
  return (
    RELATION_KEY_RULES.find((rule) => rule.matches(sourceKind, targetKind)) ?? RELATES_FALLBACK
  );
}

export function inferOntologyRelationKey(
  sourceKind: string,
  targetKind: string,
): OntologyRelationKey {
  return resolveRelationKeyRule(sourceKind, targetKind).key;
}

export function explainOntologyRelationKeyInference(
  sourceKind: string,
  targetKind: string,
): string {
  return resolveRelationKeyRule(sourceKind, targetKind).explain(sourceKind, targetKind);
}

export function inferOntologyRelationKeyForGraphIds(
  sourceId: string,
  targetId: string,
): OntologyRelationKey {
  return inferOntologyRelationKey(
    inferOntologyKindFromGraphId(sourceId),
    inferOntologyKindFromGraphId(targetId),
  );
}

export function explainOntologyRelationKeyForGraphIds(
  sourceId: string,
  targetId: string,
): string {
  return explainOntologyRelationKeyInference(
    inferOntologyKindFromGraphId(sourceId),
    inferOntologyKindFromGraphId(targetId),
  );
}

function inferOntologyKindFromGraphId(id: string): string {
  const normalized = id.trim().replace(/^\/+/, "");
  const [prefix] = normalized.split(/[/:]/, 1);
  return GRAPH_ID_KIND_TO_ONTOLOGY_KIND[prefix] ?? prefix;
}
