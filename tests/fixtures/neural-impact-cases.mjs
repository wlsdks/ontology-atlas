/**
 * Graphs whose impact the map's Neural view and the MCP engine's `impact` must agree on: each case
 * names a center and every concept that depends on it, directly or through others, with its fewest
 * hops. Shared by `tests/contract/map/neural-impact.contract.test.ts`.
 */

const uids = new Map();
const uid = (slug) => {
  if (!uids.has(slug)) uids.set(slug, `00000000-0000-4000-9000-${(uids.size + 1).toString(16).padStart(12, "0")}`);
  return uids.get(slug);
};

const domain = (id, extra = {}) => ({ slug: `domains/${id}`, frontmatter: { uid: uid(`domains/${id}`), kind: "domain", title: id, ...extra } });
const capability = (id, extra = {}) => ({
  slug: `capabilities/${id}`,
  frontmatter: { uid: uid(`capabilities/${id}`), kind: "capability", title: id, domain: "domains/d", ...extra },
});
const element = (id, extra = {}) => ({ slug: `elements/${id}`, frontmatter: { uid: uid(`elements/${id}`), kind: "element", title: id, ...extra } });
const needs = (...ids) => ({ dependencies: ids.map((id) => `capabilities/${id}`) });

export const NEURAL_IMPACT_CASES = [
  {
    name: "a chain, one hop further each",
    docs: [domain("d"), capability("a"), capability("b", needs("a")), capability("c", needs("b")), capability("e", needs("c"))],
    center: "capabilities/a",
    expected: { "capabilities/b": 1, "capabilities/c": 2, "capabilities/e": 3 },
  },
  {
    name: "a diamond, where the fewest hops win",
    docs: [
      domain("d"),
      capability("a"),
      capability("b", needs("a")),
      capability("c", needs("a")),
      capability("e", needs("b")),
      capability("f", needs("e", "c")),
    ],
    center: "capabilities/a",
    expected: { "capabilities/b": 1, "capabilities/c": 1, "capabilities/e": 2, "capabilities/f": 2 },
  },
  {
    name: "a cycle back to the center",
    docs: [domain("d"), capability("a", needs("c")), capability("b", needs("a")), capability("c", needs("b"))],
    center: "capabilities/a",
    expected: { "capabilities/b": 1, "capabilities/c": 2 },
  },
  {
    name: "a concept nothing depends on",
    docs: [domain("d"), capability("a", needs("b")), capability("b")],
    center: "capabilities/a",
    expected: {},
  },
  {
    name: "the depends_on alias and an element dependent",
    docs: [
      domain("d", { elements: ["elements/x"] }),
      capability("a"),
      capability("b", { depends_on: ["capabilities/a"] }),
      element("x", needs("b")),
    ],
    center: "capabilities/a",
    expected: { "capabilities/b": 1, "elements/x": 2 },
  },
  {
    name: "relates and containment carry no change",
    docs: [
      domain("d", { capabilities: ["capabilities/a", "capabilities/b"] }),
      capability("a", { elements: ["elements/x"] }),
      capability("b", { relates: ["capabilities/a"] }),
      element("x"),
    ],
    center: "capabilities/a",
    expected: {},
  },
];
