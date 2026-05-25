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

export function inferOntologyRelationKey(
  sourceKind: string,
  targetKind: string,
): OntologyRelationKey {
  if (sourceKind === "project" && targetKind === "project") {
    return "dependencies";
  }
  if (sourceKind === "project" && targetKind === "domain") {
    return "domains";
  }
  if (sourceKind === "project" && targetKind === "capability") {
    return "capabilities";
  }
  if (sourceKind === "project" && targetKind === "element") {
    return "elements";
  }
  if (sourceKind === "domain" && targetKind === "capability") {
    return "capabilities";
  }
  if (sourceKind === "capability" && targetKind === "element") {
    return "elements";
  }
  if (sourceKind === "document" && targetKind !== "document") {
    return "describes";
  }
  if (
    (sourceKind === "domain" && targetKind === "element") ||
    (sourceKind === "domain" && targetKind === "domain") ||
    (sourceKind === "capability" && targetKind === "capability")
  ) {
    return "contains";
  }
  return "relates";
}

export function explainOntologyRelationKeyInference(
  sourceKind: string,
  targetKind: string,
): string {
  const key = inferOntologyRelationKey(sourceKind, targetKind);
  if (sourceKind === "project" && targetKind === "project") {
    return "project -> project maps to dependencies because one project can depend on another project.";
  }
  if (sourceKind === "project" && targetKind === "domain") {
    return "project -> domain maps to domains because projects own domain areas.";
  }
  if (sourceKind === "project" && targetKind === "capability") {
    return "project -> capability maps to capabilities because projects can own top-level capabilities.";
  }
  if (sourceKind === "project" && targetKind === "element") {
    return "project -> element maps to elements because projects can directly reference concrete elements.";
  }
  if (sourceKind === "domain" && targetKind === "capability") {
    return "domain -> capability maps to capabilities because domains own capabilities.";
  }
  if (sourceKind === "capability" && targetKind === "element") {
    return "capability -> element maps to elements because capabilities use concrete elements.";
  }
  if (sourceKind === "document" && targetKind !== "document") {
    return `document -> ${targetKind} maps to describes because documents explain ontology nodes.`;
  }
  if (key === "contains") {
    return `${sourceKind} -> ${targetKind} maps to contains because this pair is explicit containment, not a loose semantic edge.`;
  }
  return `${sourceKind} -> ${targetKind} falls back to relates because this pair has no hierarchy-specific graph key.`;
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
