const node = (slug) => ({ id: slug, label: slug.split("/").pop(), kind: slug.split("/")[0].replace(/ies$/, "y").replace(/s$/, "") });
const contains = (source, target) => ({ source, target, kind: "contains", relationType: "contains" });
const dependsOn = (source, target) => ({ source, target, kind: "depends", relationType: "depends_on" });
const relatedTo = (source, target) => ({ source, target, kind: "depends", relationType: "related_to" });

const twoDomains = ["domains/a", "domains/b", "capabilities/a1", "capabilities/b1"];
const twoDomainContains = [contains("domains/a", "capabilities/a1"), contains("domains/b", "capabilities/b1")];

export const DOMAIN_FLOW_CASES = [
  {
    name: "a domain-to-domain dependency",
    map: { nodes: twoDomains.map(node), edges: [...twoDomainContains, dependsOn("domains/a", "domains/b")] },
    expected: { directed: [{ from: "domains/a", to: "domains/b", count: 1 }], relatesOnly: [], dependents: { "domains/a": 0, "domains/b": 1 } },
  },
  {
    name: "a domain-held element",
    map: {
      nodes: [...twoDomains, "elements/e"].map(node),
      edges: [...twoDomainContains, contains("domains/a", "elements/e"), dependsOn("elements/e", "capabilities/b1")],
    },
    expected: { directed: [{ from: "domains/a", to: "domains/b", count: 1 }], relatesOnly: [], dependents: { "domains/a": 0, "domains/b": 1 } },
  },
  {
    name: "a two-way pair",
    map: {
      nodes: [...twoDomains, "capabilities/a2"].map(node),
      edges: [
        ...twoDomainContains,
        contains("domains/a", "capabilities/a2"),
        dependsOn("capabilities/a1", "capabilities/b1"),
        dependsOn("capabilities/a2", "capabilities/b1"),
        dependsOn("capabilities/b1", "capabilities/a1"),
      ],
    },
    expected: {
      directed: [
        { from: "domains/a", to: "domains/b", count: 2 },
        { from: "domains/b", to: "domains/a", count: 1 },
      ],
      relatesOnly: [],
      dependents: { "domains/a": 1, "domains/b": 1 },
    },
  },
  {
    name: "a relates-only pair",
    map: { nodes: twoDomains.map(node), edges: [...twoDomainContains, relatedTo("capabilities/a1", "capabilities/b1")] },
    expected: { directed: [], relatesOnly: [["domains/a", "domains/b"]], dependents: { "domains/a": 0, "domains/b": 0 } },
  },
];
