// Response-shape validators for the dogfood MCP walk: graph analytics/query
// surface tools (schema, facets, match_nodes/edges, node_profile, centrality,
// communities, similar_nodes, explain_relation) plus shared bucket/row helpers
// reused by the growth/maintenance plan validators.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { matchRowsFailure, numericSummaryFailure } from "./shape-validators-primitives.mjs";
import { growthCandidateRowFailure } from "./shape-validators-growth.mjs";
import { graphEdgeFailure, lineageBucketFailure } from "./shape-validators-graph-structure.mjs";

export { growthCandidateRowFailure } from "./shape-validators-growth.mjs";

export function schemaShapeFailure(result) {
  if (result.operation !== "schema") {
    return `schema response operation mismatch — ${result.operation}`;
  }
  if (!Number.isInteger(result.totalPatterns) || result.totalPatterns < 0) {
    return "schema response missing totalPatterns";
  }
  if (typeof result.limited !== "boolean") {
    return "schema response missing limited flag";
  }
  if (!Array.isArray(result.patterns)) {
    return "schema response missing patterns";
  }
  if (result.patterns.length > result.totalPatterns) {
    return `schema patterns exceed total — patterns ${result.patterns.length}, total ${result.totalPatterns}`;
  }
  if (!result.limited && result.patterns.length !== result.totalPatterns) {
    return `schema pattern count mismatch — patterns ${result.patterns.length}, total ${result.totalPatterns}`;
  }
  if (result.patterns.length === 0) {
    return "schema response returned no patterns";
  }
  for (const [index, pattern] of result.patterns.entries()) {
    const patternFailure = schemaPatternFailure("schema", pattern, index);
    if (patternFailure) return patternFailure;
  }
  return null;
}

export function schemaPatternFailure(label, pattern, index) {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
    return `${label} malformed pattern at index ${index}`;
  }
  for (const key of ["fromKind", "relation", "toKind"]) {
    if (typeof pattern[key] !== "string" || pattern[key].length === 0) {
      return `${label} pattern missing ${key} at index ${index}`;
    }
  }
  for (const key of ["count", "resolved", "external"]) {
    if (!Number.isInteger(pattern[key]) || pattern[key] < 0) {
      return `${label} pattern missing ${key}: ${pattern.fromKind}-${pattern.relation}-${pattern.toKind}`;
    }
  }
  if (pattern.resolved + pattern.external > pattern.count) {
    return `${label} pattern resolution exceeds count: ${pattern.fromKind}-${pattern.relation}-${pattern.toKind}`;
  }
  return null;
}

export function facetsShapeFailure(result) {
  if (result.operation !== "facets") {
    return `facets response operation mismatch — ${result.operation}`;
  }
  const graphFailure = numericSummaryFailure("facets graph", result.graph, [
    "nodes",
    "edges",
    "resolvedEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (graphFailure) return graphFailure;
  if (result.graph.edges !== result.graph.resolvedEdges + result.graph.externalEdges + result.graph.unresolvedEdges) {
    return `facets graph edge count mismatch — edges ${result.graph.edges}, parts ${result.graph.resolvedEdges + result.graph.externalEdges + result.graph.unresolvedEdges}`;
  }
  if (!result.nodes || typeof result.nodes !== "object" || Array.isArray(result.nodes)) {
    return "facets response missing nodes block";
  }
  for (const key of ["byKind", "byDomain", "byDegreeBucket"]) {
    if (!result.nodes[key] || typeof result.nodes[key] !== "object" || Array.isArray(result.nodes[key])) {
      return `facets nodes missing ${key}`;
    }
  }
  if (!Array.isArray(result.nodes.topByDegree)) {
    return "facets nodes missing topByDegree";
  }
  const topFailure = matchRowsFailure("facets topByDegree", result.nodes.topByDegree);
  if (topFailure) return topFailure;
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "facets response missing edges block";
  }
  if (!result.edges.byRelation || typeof result.edges.byRelation !== "object" || Array.isArray(result.edges.byRelation)) {
    return "facets edges missing byRelation";
  }
  const resolutionFailure = numericSummaryFailure("facets edges.byResolution", result.edges.byResolution, [
    "resolved",
    "external",
    "unresolved",
  ]);
  if (resolutionFailure) return resolutionFailure;
  if (result.edges.byResolution.resolved !== result.graph.resolvedEdges || result.edges.byResolution.external !== result.graph.externalEdges || result.edges.byResolution.unresolved !== result.graph.unresolvedEdges) {
    return "facets edge resolution mismatch with graph summary";
  }
  if (!Array.isArray(result.edges.topPatterns)) {
    return "facets edges missing topPatterns";
  }
  for (const [index, pattern] of result.edges.topPatterns.entries()) {
    const patternFailure = schemaPatternFailure("facets topPatterns", pattern, index);
    if (patternFailure) return patternFailure;
  }
  return null;
}

export function matchNodesShapeFailure(result, targets) {
  if (result.operation !== "match_nodes") {
    return `match_nodes response operation mismatch — ${result.operation}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "match_nodes response missing filters";
  }
  if (result.filters.kind !== "capability") {
    return `match_nodes filter kind mismatch — ${result.filters.kind}`;
  }
  if (result.filters.slugContains !== targets.slugNeedle) {
    return `match_nodes filter slugContains mismatch — ${result.filters.slugContains}`;
  }
  if (result.filters.sort !== "degree") {
    return `match_nodes filter sort mismatch — ${result.filters.sort}`;
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "match_nodes response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "match_nodes response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "match_nodes response missing nodes";
  }
  if (result.nodes.length > result.totalMatches) {
    return `match_nodes rows exceed total — rows ${result.nodes.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.nodes.length !== result.totalMatches) {
    return `match_nodes row count mismatch — rows ${result.nodes.length}, total ${result.totalMatches}`;
  }
  if (result.nodes.length === 0) {
    return "match_nodes response returned no nodes";
  }
  for (const [index, node] of result.nodes.entries()) {
    const rowFailure = matchRowsFailure("match_nodes", [node]);
    if (rowFailure) return rowFailure.replace("at index 0", `at index ${index}`);
    if (!Number.isInteger(node.inDegree) || node.inDegree < 0) {
      return `match_nodes row missing inDegree: ${node.slug}`;
    }
    if (!Number.isInteger(node.outDegree) || node.outDegree < 0) {
      return `match_nodes row missing outDegree: ${node.slug}`;
    }
    if (!Number.isInteger(node.degree) || node.degree < 0) {
      return `match_nodes row missing degree: ${node.slug}`;
    }
    if (node.degree !== node.inDegree + node.outDegree) {
      return `match_nodes row degree mismatch: ${node.slug}`;
    }
    if (node.kind !== "capability") {
      return `match_nodes row kind mismatch: ${node.slug}`;
    }
    if (!node.slug.toLowerCase().includes(targets.slugNeedle.toLowerCase())) {
      return `match_nodes row slug filter mismatch: ${node.slug}`;
    }
  }
  return null;
}

export function matchEdgesShapeFailure(result, targets) {
  if (result.operation !== "match_edges") {
    return `match_edges response operation mismatch — ${result.operation}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "match_edges response missing filters";
  }
  if (result.filters.from !== targets.capabilitySlug) {
    return `match_edges filter from mismatch — ${result.filters.from}`;
  }
  if (result.filters.includeExternal !== true) {
    return "match_edges filter includeExternal mismatch";
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "match_edges response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "match_edges response missing limited flag";
  }
  if (!Array.isArray(result.edges)) {
    return "match_edges response missing edges";
  }
  if (result.edges.length > result.totalMatches) {
    return `match_edges rows exceed total — rows ${result.edges.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.edges.length !== result.totalMatches) {
    return `match_edges row count mismatch — rows ${result.edges.length}, total ${result.totalMatches}`;
  }
  if (result.edges.length === 0) {
    return "match_edges response returned no edges";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("match_edges edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (edge.from !== targets.capabilitySlug) {
      return `match_edges row from mismatch at index ${index}`;
    }
    if (!edge.fromNode || edge.fromNode.slug !== edge.from) {
      return `match_edges row missing fromNode at index ${index}`;
    }
    if (typeof edge.toKind !== "string" || edge.toKind.length === 0) {
      return `match_edges row missing toKind at index ${index}`;
    }
    if (edge.resolved && (!edge.toNode || edge.toNode.slug !== edge.to)) {
      return `match_edges row missing toNode at index ${index}`;
    }
    if (edge.resolved && edge.toNode.kind !== edge.toKind) {
      return `match_edges row toKind mismatch at index ${index}`;
    }
    if (edge.external && edge.toNode !== null) {
      return `match_edges external row has toNode at index ${index}`;
    }
    if (edge.external && edge.toKind !== "external") {
      return `match_edges external row toKind mismatch at index ${index}`;
    }
  }
  return null;
}

export function nodeProfileShapeFailure(result, targets) {
  if (result.operation !== "node_profile") {
    return `node_profile response operation mismatch — ${result.operation}`;
  }
  if (result.center !== targets.capabilitySlug) {
    return `node_profile response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "node_profile response missing center node";
  }
  const degreeFailure = numericSummaryFailure("node_profile degree", result.degree, ["in", "out", "total"]);
  if (degreeFailure) return degreeFailure;
  if (result.degree.total !== result.degree.in + result.degree.out) {
    return `node_profile degree mismatch — total ${result.degree.total}, in+out ${result.degree.in + result.degree.out}`;
  }
  if (!Array.isArray(result.aliases)) {
    return "node_profile response missing aliases";
  }
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "node_profile response missing edges";
  }
  for (const key of ["incoming", "outgoing"]) {
    const edgeGroupFailure = profileEdgeGroupFailure(`node_profile ${key}`, result.edges[key], {
      center: result.center,
      direction: key,
    });
    if (edgeGroupFailure) return edgeGroupFailure;
  }
  if (!result.containment || typeof result.containment !== "object" || Array.isArray(result.containment)) {
    return "node_profile response missing containment";
  }
  for (const key of ["parents", "children"]) {
    if (!Array.isArray(result.containment[key])) {
      return `node_profile containment missing ${key}`;
    }
    for (const [index, row] of result.containment[key].entries()) {
      const rowFailure = containmentSummaryRowFailure(`node_profile containment ${key}`, row, index);
      if (rowFailure) return rowFailure;
    }
  }
  if (typeof result.containment.parentLimited !== "boolean" || typeof result.containment.childLimited !== "boolean") {
    return "node_profile containment missing limited flags";
  }
  if (!result.lineage || typeof result.lineage !== "object" || Array.isArray(result.lineage)) {
    return "node_profile response missing lineage";
  }
  if (!Number.isInteger(result.lineage.depth) || result.lineage.depth < 0) {
    return "node_profile lineage missing depth";
  }
  for (const key of ["ancestors", "descendants"]) {
    const bucketFailure = lineageBucketFailure(`node_profile lineage ${key}`, result.lineage[key]);
    if (bucketFailure) return bucketFailure;
  }
  return null;
}

export function centralityShapeFailure(result) {
  if (result.operation !== "centrality") {
    return `centrality response operation mismatch — ${result.operation}`;
  }
  const graphFailure = numericSummaryFailure("centrality graph", result.graph, ["nodes", "edges", "resolvedEdges"]);
  if (graphFailure) return graphFailure;
  if (typeof result.graph.graphHash !== "string" || result.graph.graphHash.length === 0) {
    return "centrality graph missing graphHash";
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "centrality response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "centrality parameters missing types";
  }
  for (const key of ["iterations", "limit"]) {
    if (!Number.isInteger(result.parameters[key]) || result.parameters[key] <= 0) {
      return `centrality parameters missing ${key}`;
    }
  }
  if (!result.rankings || typeof result.rankings !== "object" || Array.isArray(result.rankings)) {
    return "centrality response missing rankings";
  }
  for (const key of ["pageRank", "bridges", "authorities", "hubs"]) {
    const rows = result.rankings[key];
    if (!Array.isArray(rows)) {
      return `centrality rankings missing ${key}`;
    }
    if (rows.length > result.parameters.limit) {
      return `centrality ${key} rows exceed limit — rows ${rows.length}, limit ${result.parameters.limit}`;
    }
    if (key === "pageRank" && rows.length === 0) {
      return "centrality pageRank returned no rows";
    }
    for (const [index, row] of rows.entries()) {
      const rowFailure = centralityRowFailure(`centrality ${key}`, row, index);
      if (rowFailure) return rowFailure;
    }
  }
  return null;
}

export function centralityRowFailure(label, row, index) {
  const summaryFailure = matchRowsFailure(label, [row]);
  if (summaryFailure) return summaryFailure.replace("at index 0", `at index ${index}`);
  for (const key of ["inDegree", "outDegree", "degree", "bridgeScore"]) {
    if (!Number.isInteger(row[key]) || row[key] < 0) {
      return `${label} row missing ${key}: ${row.slug}`;
    }
  }
  if (row.degree !== row.inDegree + row.outDegree) {
    return `${label} degree mismatch: ${row.slug}`;
  }
  if (typeof row.pageRank !== "number" || !Number.isFinite(row.pageRank) || row.pageRank < 0) {
    return `${label} row missing pageRank: ${row.slug}`;
  }
  return null;
}

export function communitiesShapeFailure(result) {
  if (result.operation !== "communities") {
    return `communities response operation mismatch — ${result.operation}`;
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "communities response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "communities parameters missing types";
  }
  for (const key of ["iterations", "limit", "nodeLimit"]) {
    if (!Number.isInteger(result.parameters[key]) || result.parameters[key] <= 0) {
      return `communities parameters missing ${key}`;
    }
  }
  const summaryFailure = numericSummaryFailure("communities", result.summary, [
    "communities",
    "largestSize",
    "singletonCount",
    "crossCommunityEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (typeof result.limited !== "boolean") {
    return "communities response missing limited flag";
  }
  if (!Array.isArray(result.communities)) {
    return "communities response missing communities";
  }
  if (result.communities.length === 0) {
    return "communities response returned no communities";
  }
  if (result.communities.length > result.summary.communities) {
    return `communities rows exceed total — rows ${result.communities.length}, total ${result.summary.communities}`;
  }
  if (!result.limited && result.communities.length !== result.summary.communities) {
    return `communities row count mismatch — rows ${result.communities.length}, total ${result.summary.communities}`;
  }
  const largestObserved = result.communities.reduce((max, community) => Math.max(max, Number.isInteger(community?.size) ? community.size : 0), 0);
  if (result.summary.largestSize < largestObserved) {
    return `communities largestSize below returned community — largest ${result.summary.largestSize}, observed ${largestObserved}`;
  }
  for (const [index, community] of result.communities.entries()) {
    const communityFailure = communityRowFailure(community, index, result.parameters.nodeLimit);
    if (communityFailure) return communityFailure;
  }
  const crossFailure = communityEdgeBucketFailure("communities crossCommunityEdges", result.crossCommunityEdges, result.summary.crossCommunityEdges);
  if (crossFailure) return crossFailure;
  return null;
}

export function communityRowFailure(community, index, nodeLimit) {
  if (!community || typeof community !== "object" || Array.isArray(community)) {
    return `communities malformed community at index ${index}`;
  }
  if (!Number.isInteger(community.id) || community.id <= 0) {
    return `communities community missing id at index ${index}`;
  }
  if (typeof community.label !== "string" || community.label.length === 0) {
    return `communities community missing label: ${community.id}`;
  }
  for (const key of ["size", "internalEdges", "boundaryEdges"]) {
    const min = key === "size" ? 1 : 0;
    if (!Number.isInteger(community[key]) || community[key] < min) {
      return `communities community missing ${key}: ${community.id}`;
    }
  }
  for (const key of ["kinds", "domains"]) {
    if (!community[key] || typeof community[key] !== "object" || Array.isArray(community[key])) {
      return `communities community missing ${key}: ${community.id}`;
    }
  }
  const kindTotal = Object.values(community.kinds).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (kindTotal !== community.size) {
    return `communities community kind count mismatch: ${community.id}`;
  }
  const representativeFailure = matchRowsFailure("communities representative", [community.representative]);
  if (representativeFailure) return representativeFailure.replace("at index 0", `for community ${community.id}`);
  if (typeof community.nodeLimited !== "boolean") {
    return `communities community missing nodeLimited flag: ${community.id}`;
  }
  if (!Array.isArray(community.nodes)) {
    return `communities community missing nodes: ${community.id}`;
  }
  if (community.nodes.length > community.size) {
    return `communities community nodes exceed size: ${community.id}`;
  }
  if (community.nodes.length > nodeLimit) {
    return `communities community nodes exceed nodeLimit: ${community.id}`;
  }
  if (!community.nodeLimited && community.nodes.length !== community.size) {
    return `communities community node count mismatch: ${community.id}`;
  }
  return matchRowsFailure(`communities community ${community.id}`, community.nodes);
}

export function communityEdgeBucketFailure(label, bucket, expectedTotal) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.rows.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
    for (const key of ["fromCommunity", "toCommunity"]) {
      if (!Number.isInteger(edge[key]) || edge[key] <= 0) {
        return `${label} missing ${key} at index ${index}`;
      }
    }
  }
  return null;
}

export function similarNodesShapeFailure(result, targets) {
  if (result.operation !== "similar_nodes") {
    return `similar_nodes response operation mismatch — ${result.operation}`;
  }
  if (!result.source || typeof result.source !== "object" || Array.isArray(result.source)) {
    return "similar_nodes response missing source";
  }
  const expectedSource = {
    mode: "candidate",
    slug: targets.similarCandidateSlug,
    kind: "capability",
    title: targets.capabilityTitle,
    domain: targets.domainSlug,
  };
  for (const [key, value] of Object.entries(expectedSource)) {
    if (result.source[key] !== value) {
      return `similar_nodes source ${key} mismatch — ${result.source[key]}`;
    }
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "similar_nodes response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "similar_nodes parameters missing types";
  }
  if (!Number.isInteger(result.parameters.limit) || result.parameters.limit <= 0) {
    return "similar_nodes parameters missing limit";
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "similar_nodes response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "similar_nodes response missing limited flag";
  }
  if (!Array.isArray(result.matches)) {
    return "similar_nodes response missing matches";
  }
  if (result.matches.length === 0) {
    return "similar_nodes response returned no matches";
  }
  if (result.matches.length > result.totalMatches) {
    return `similar_nodes rows exceed total — rows ${result.matches.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.matches.length !== result.totalMatches) {
    return `similar_nodes row count mismatch — rows ${result.matches.length}, total ${result.totalMatches}`;
  }
  if (!result.matches.some((match) => match?.node?.slug === targets.capabilitySlug)) {
    return `similar_nodes response missing existing ${targets.capabilitySlug} match`;
  }
  for (const [index, match] of result.matches.entries()) {
    const matchFailure = similarMatchFailure(match, index);
    if (matchFailure) return matchFailure;
  }
  return null;
}

export function similarMatchFailure(match, index) {
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    return `similar_nodes malformed match at index ${index}`;
  }
  const nodeFailure = matchRowsFailure("similar_nodes match node", [match.node]);
  if (nodeFailure) return nodeFailure.replace("at index 0", `at index ${index}`);
  if (typeof match.score !== "number" || !Number.isFinite(match.score) || match.score < 0) {
    return `similar_nodes match missing score: ${match.node.slug}`;
  }
  if (!match.signals || typeof match.signals !== "object" || Array.isArray(match.signals)) {
    return `similar_nodes match missing signals: ${match.node.slug}`;
  }
  for (const key of ["slug", "title", "kind", "domain", "neighbors"]) {
    if (typeof match.signals[key] !== "number" || !Number.isFinite(match.signals[key]) || match.signals[key] < 0) {
      return `similar_nodes match missing signal ${key}: ${match.node.slug}`;
    }
  }
  const signalTotal = Object.values(match.signals).reduce((sum, value) => sum + value, 0);
  if (Math.abs(match.score - signalTotal) > 0.00001) {
    return `similar_nodes match score mismatch: ${match.node.slug}`;
  }
  if (!Array.isArray(match.sharedNeighbors)) {
    return `similar_nodes match missing sharedNeighbors: ${match.node.slug}`;
  }
  return matchRowsFailure(`similar_nodes sharedNeighbors ${match.node.slug}`, match.sharedNeighbors);
}

export function explainRelationShapeFailure(result, targets) {
  if (result.operation !== "explain_relation") {
    return `explain_relation response operation mismatch — ${result.operation}`;
  }
  if (result.from !== targets.capabilitySlug) {
    return `explain_relation from mismatch — ${result.from}`;
  }
  if (result.to !== targets.pathTargetSlug) {
    return `explain_relation to mismatch — ${result.to}`;
  }
  if (!result.fromNode || result.fromNode.slug !== result.from) {
    return "explain_relation response missing fromNode";
  }
  if (!result.toNode || result.toNode.slug !== result.to) {
    return "explain_relation response missing toNode";
  }
  if (typeof result.verdict !== "string" || result.verdict.length === 0) {
    return "explain_relation response missing verdict";
  }
  if (!result.domains || typeof result.domains !== "object" || Array.isArray(result.domains)) {
    return "explain_relation response missing domains";
  }
  for (const key of ["from", "to"]) {
    if (result.domains[key] !== null && typeof result.domains[key] !== "string") {
      return `explain_relation domains missing ${key}`;
    }
  }
  if (typeof result.domains.sameDomain !== "boolean") {
    return "explain_relation domains missing sameDomain";
  }
  const directFailure = relationEdgeBucketFailure("explain_relation direct", result.direct);
  if (directFailure) return directFailure;
  const pathFailure = shortestRelationPathFailure(result.shortestPath, result.from, result.to);
  if (pathFailure) return pathFailure;
  const commonFailure = commonNeighborBucketFailure("explain_relation commonNeighbors", result.commonNeighbors, {
    from: result.from,
    to: result.to,
  });
  if (commonFailure) return commonFailure;
  return null;
}

export function shortestRelationPathFailure(path, from, to) {
  if (!path || typeof path !== "object" || Array.isArray(path)) {
    return "explain_relation response missing shortestPath";
  }
  if (typeof path.found !== "boolean") {
    return "explain_relation shortestPath missing found flag";
  }
  if (!path.found) {
    return "explain_relation expected shortestPath to be found";
  }
  if (typeof path.direction !== "string" || path.direction.length === 0) {
    return "explain_relation shortestPath missing direction";
  }
  if (!Number.isInteger(path.maxHops) || path.maxHops <= 0) {
    return "explain_relation shortestPath missing maxHops";
  }
  if (!Number.isInteger(path.hopCount) || path.hopCount < 0) {
    return "explain_relation shortestPath missing hopCount";
  }
  if (!Array.isArray(path.hops) || path.hops.length === 0) {
    return "explain_relation shortestPath missing hops";
  }
  if (path.hops[0] !== from || path.hops[path.hops.length - 1] !== to) {
    return "explain_relation shortestPath endpoint mismatch";
  }
  if (path.hopCount !== path.hops.length - 1) {
    return `explain_relation shortestPath hop mismatch — hopCount ${path.hopCount}, hops ${path.hops.length}`;
  }
  if (!Array.isArray(path.edges)) {
    return "explain_relation shortestPath missing edges";
  }
  if (path.edges.length !== path.hopCount) {
    return `explain_relation shortestPath edge mismatch — edges ${path.edges.length}, hopCount ${path.hopCount}`;
  }
  for (const [index, edge] of path.edges.entries()) {
    const edgeFailure = graphEdgeFailure("explain_relation shortestPath", edge, index);
    if (edgeFailure) return edgeFailure;
    const left = path.hops[index];
    const right = path.hops[index + 1];
    const connectsForward = edge.from === left && edge.to === right;
    const connectsBackward = edge.from === right && edge.to === left;
    if (!connectsForward && !connectsBackward) {
      return `explain_relation shortestPath edge endpoint mismatch at index ${index}`;
    }
  }
  return null;
}

export function relationEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

export function commonNeighborBucketFailure(label, bucket, options = {}) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label} malformed row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `${label} row missing slug at index ${index}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `${label} row missing node summary: ${row.slug}`;
    }
    for (const key of ["fromEdges", "toEdges"]) {
      if (!Array.isArray(row[key])) {
        return `${label} row missing ${key}: ${row.slug}`;
      }
      for (const [edgeIndex, edge] of row[key].entries()) {
        const edgeFailure = graphEdgeFailure(`${label} ${key}`, edge, edgeIndex);
        if (edgeFailure) return edgeFailure;
        if (!["incoming", "outgoing"].includes(edge.direction)) {
          return `${label} ${key} missing direction at index ${edgeIndex}`;
        }
        const endpoint = key === "fromEdges" ? options.from : options.to;
        if (endpoint) {
          const connectsForward = edge.from === endpoint && edge.to === row.slug;
          const connectsBackward = edge.from === row.slug && edge.to === endpoint;
          if (!connectsForward && !connectsBackward) {
            return `${label} ${key} endpoint mismatch at index ${edgeIndex}`;
          }
        }
      }
    }
  }
  return null;
}

export function profileEdgeGroupFailure(label, group, options = {}) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return `${label} missing group`;
  }
  if (!Number.isInteger(group.total) || group.total < 0) {
    return `${label} missing total`;
  }
  if (typeof group.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!group.byRelation || typeof group.byRelation !== "object" || Array.isArray(group.byRelation)) {
    return `${label} missing byRelation`;
  }
  if (!Array.isArray(group.edges)) {
    return `${label} missing edges`;
  }
  if (group.edges.length > group.total) {
    return `${label} edges exceed total — edges ${group.edges.length}, total ${group.total}`;
  }
  if (!group.limited && group.edges.length !== group.total) {
    return `${label} edge count mismatch — edges ${group.edges.length}, total ${group.total}`;
  }
  for (const [index, edge] of group.edges.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
    if (options.center && options.direction === "incoming" && edge.to !== options.center) {
      return `${label} edge target mismatch at index ${index}`;
    }
    if (options.center && options.direction === "outgoing" && edge.from !== options.center) {
      return `${label} edge source mismatch at index ${index}`;
    }
    if (typeof edge.otherKind !== "string" || edge.otherKind.length === 0) {
      return `${label} edge missing otherKind at index ${index}`;
    }
    if (edge.resolved && (!edge.otherNode || typeof edge.otherNode.slug !== "string")) {
      return `${label} edge missing otherNode at index ${index}`;
    }
    if (edge.resolved && edge.otherNode.kind !== edge.otherKind) {
      return `${label} edge otherKind mismatch at index ${index}`;
    }
    if (edge.resolved && options.center && options.direction === "incoming" && edge.otherNode.slug !== edge.from) {
      return `${label} edge otherNode source mismatch at index ${index}`;
    }
    if (edge.resolved && options.center && options.direction === "outgoing" && edge.otherNode.slug !== edge.to) {
      return `${label} edge otherNode target mismatch at index ${index}`;
    }
    if (edge.external && edge.otherNode !== null) {
      return `${label} external edge has otherNode at index ${index}`;
    }
  }
  return null;
}

export function containmentSummaryRowFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  if (typeof row.via !== "string" || row.via.length === 0) {
    return `${label} row missing via: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} row missing node summary: ${row.slug}`;
  }
  return null;
}

export function candidateGroupShapeFailure(label, group, expectedTotal) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return `${label} missing group`;
  }
  if (!Number.isInteger(group.total) || group.total < 0) {
    return `${label} missing total`;
  }
  if (group.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, group ${group.total}`;
  }
  if (typeof group.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(group.rows)) {
    return `${label} missing rows`;
  }
  if (group.rows.length > group.total) {
    return `${label} rows exceed total — rows ${group.rows.length}, total ${group.total}`;
  }
  if (!group.limited && group.rows.length !== group.total) {
    return `${label} row count mismatch — rows ${group.rows.length}, total ${group.total}`;
  }
  if (group.ignored != null && (!Number.isInteger(group.ignored) || group.ignored < 0)) {
    return `${label} malformed ignored count`;
  }
  for (const [index, row] of group.rows.entries()) {
    const rowFailure = growthCandidateRowFailure(label, row, index);
    if (rowFailure) return rowFailure;
  }
  return null;
}

export function scopeEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!bucket.byRelation || typeof bucket.byRelation !== "object" || Array.isArray(bucket.byRelation)) {
    return `${label} missing byRelation`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges array`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.edges.length !== bucket.total) {
    return `${label} edge count mismatch — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `${label} malformed edge at index ${index}`;
    }
    if (typeof edge.from !== "string" || edge.from.length === 0) {
      return `${label} missing edge from at index ${index}`;
    }
    if (typeof edge.to !== "string" || edge.to.length === 0) {
      return `${label} missing edge to at index ${index}`;
    }
    if (typeof edge.via !== "string" || edge.via.length === 0) {
      return `${label} missing edge relation at index ${index}`;
    }
  }
  return null;
}

export function summarizedNodeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.nodes)) {
    return `${label} missing nodes array`;
  }
  if (bucket.nodes.length > bucket.total) {
    return `${label} nodes exceed total — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.nodes.length !== bucket.total) {
    return `${label} node count mismatch — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.nodes);
}

export function summarizedRowBucketFailure(label, bucket, expectedTotal = null) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (expectedTotal != null && bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.rows);
}
