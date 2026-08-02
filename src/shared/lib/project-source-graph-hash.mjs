const GRAPH_ARRAY_KEYS = Object.freeze([
  "domains",
  "capabilities",
  "elements",
  "dependencies",
  "depends_on",
  "relates",
  "contains",
  "describes",
  "broader",
]);

function nonBlank(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(nonBlank).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function canonicalDoc(doc) {
  const frontmatter = doc?.frontmatter && typeof doc.frontmatter === "object"
    ? doc.frontmatter
    : {};
  const graph = {};
  const domain = nonBlank(frontmatter.domain);
  if (domain) graph.domain = domain;
  const path = nonBlank(frontmatter.path);
  if (path) graph.path = path.replaceAll("\\", "/").replace(/^\.\//, "");
  for (const key of GRAPH_ARRAY_KEYS) {
    const values = stringArray(frontmatter[key]);
    if (values.length > 0) graph[key] = values;
  }
  return {
    slug: String(doc.slug),
    kind: nonBlank(frontmatter.kind) ?? "",
    title:
      nonBlank(frontmatter.title)
      ?? nonBlank(frontmatter.name)
      ?? nonBlank(doc.title)
      ?? String(doc.slug),
    graph,
  };
}

/**
 * Semantic change detector for one project's real ontology documents.
 * Callers own project containment; this function owns one byte-identical
 * canonicalization shared by the browser UI and the MCP server.
 */
export function buildProjectSourceGraphHash(projectSlug, docs) {
  const canonical = [...docs]
    .filter((doc) => doc && typeof doc.slug === "string" && doc.slug.length > 0)
    .map(canonicalDoc)
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const value = JSON.stringify({ version: 1, projectSlug, docs: canonical });
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `project-graph-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
