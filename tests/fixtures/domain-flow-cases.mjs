const uids = new Map();
const uid = (slug) => {
  if (!uids.has(slug)) uids.set(slug, `00000000-0000-4000-8000-${(uids.size + 1).toString(16).padStart(12, "0")}`);
  return uids.get(slug);
};

const domain = (id, extra = {}) => ({ slug: `domains/${id}`, frontmatter: { uid: uid(`domains/${id}`), kind: "domain", title: id, ...extra } });
const capability = (id, domainId, extra = {}) => ({
  slug: `capabilities/${id}`,
  frontmatter: { uid: uid(`capabilities/${id}`), kind: "capability", title: id, domain: `domains/${domainId}`, ...extra },
});
const element = (id, extra = {}) => ({ slug: `elements/${id}`, frontmatter: { uid: uid(`elements/${id}`), kind: "element", title: id, ...extra } });

const node = (slug) => ({ id: slug, label: slug.split("/").pop(), kind: slug.split("/")[0].replace(/ies$/, "y").replace(/s$/, "") });
const contains = (source, target) => ({ source, target, kind: "contains", relationType: "contains" });
const dependsOn = (source, target) => ({ source, target, kind: "depends", relationType: "depends_on" });
const relatedTo = (source, target) => ({ source, target, kind: "depends", relationType: "related_to" });

const twoDomains = ["domains/a", "domains/b", "capabilities/a1", "capabilities/b1"];
const twoDomainContains = [contains("domains/a", "capabilities/a1"), contains("domains/b", "capabilities/b1")];

export const DOMAIN_FLOW_CASES = [
  {
    name: "a domain-to-domain dependency",
    docs: [domain("a", { depends_on: ["domains/b"] }), domain("b"), capability("a1", "a"), capability("b1", "b")],
    map: { nodes: twoDomains.map(node), edges: [...twoDomainContains, dependsOn("domains/a", "domains/b")] },
    expected: { directed: [{ from: "domains/a", to: "domains/b", count: 1 }], relatesOnly: [], dependents: { "domains/a": 0, "domains/b": 1 } },
  },
  {
    name: "a domain-held element",
    docs: [
      domain("a", { elements: ["elements/e"] }),
      domain("b"),
      capability("a1", "a"),
      capability("b1", "b"),
      element("e", { depends_on: ["capabilities/b1"] }),
    ],
    map: {
      nodes: [...twoDomains, "elements/e"].map(node),
      edges: [...twoDomainContains, contains("domains/a", "elements/e"), dependsOn("elements/e", "capabilities/b1")],
    },
    expected: { directed: [{ from: "domains/a", to: "domains/b", count: 1 }], relatesOnly: [], dependents: { "domains/a": 0, "domains/b": 1 } },
  },
  {
    name: "a two-way pair",
    docs: [
      domain("a"),
      domain("b"),
      capability("a1", "a", { depends_on: ["capabilities/b1"] }),
      capability("a2", "a", { depends_on: ["capabilities/b1"] }),
      capability("b1", "b", { depends_on: ["capabilities/a1"] }),
    ],
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
    docs: [domain("a"), domain("b"), capability("a1", "a", { relates: ["capabilities/b1"] }), capability("b1", "b")],
    map: { nodes: twoDomains.map(node), edges: [...twoDomainContains, relatedTo("capabilities/a1", "capabilities/b1")] },
    expected: { directed: [], relatesOnly: [["domains/a", "domains/b"]], dependents: { "domains/a": 0, "domains/b": 0 } },
  },
  {
    name: "the alias duplicate",
    docs: [domain("a"), domain("b"), capability("a1", "a", { depends_on: ["capabilities/b1", "b1"] }), capability("b1", "b")],
    map: { nodes: twoDomains.map(node), edges: [...twoDomainContains, dependsOn("capabilities/a1", "capabilities/b1")] },
    expected: {
      directed: [{ from: "domains/a", to: "domains/b", count: { mcp: 2, map: 1 } }],
      relatesOnly: [],
      dependents: { "domains/a": 0, "domains/b": 1 },
    },
  },
];
