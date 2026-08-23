// Response-shape validators for the dogfood MCP walk: graph structure tools
// (cycles, topological_order, lineage, containment_tree, reachability, impact,
// blast_radius, subgraph).
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import { matchRowsFailure, numericSummaryFailure } from "./shape-validators-primitives.mjs";

export function cyclesShapeFailure(result) {
  if (result.operation !== "cycles") {
    return `cycles response operation mismatch — ${result.operation}`;
  }
  if (!Array.isArray(result.relationTypes) || result.relationTypes.some((type) => typeof type !== "string" || type.length === 0)) {
    return "cycles response missing relationTypes";
  }
  if (!Number.isInteger(result.maxDepth) || result.maxDepth < 0) {
    return "cycles response missing maxDepth";
  }
  if (!Number.isInteger(result.totalCycles) || result.totalCycles < 0) {
    return "cycles response missing totalCycles";
  }
  if (typeof result.limited !== "boolean") {
    return "cycles response missing limited flag";
  }
  if (!Array.isArray(result.cycles)) {
    return "cycles response missing cycles array";
  }
  if (result.cycles.length > result.totalCycles) {
    return `cycles rows exceed total — rows ${result.cycles.length}, total ${result.totalCycles}`;
  }
  if (!result.limited && result.cycles.length !== result.totalCycles) {
    return `cycles row count mismatch — rows ${result.cycles.length}, total ${result.totalCycles}`;
  }
  for (const [index, cycle] of result.cycles.entries()) {
    if (!cycle || typeof cycle !== "object" || Array.isArray(cycle)) {
      return `cycles malformed cycle at index ${index}`;
    }
    if (typeof cycle.id !== "string" || cycle.id.length === 0) {
      return `cycles cycle missing id at index ${index}`;
    }
    if (!Number.isInteger(cycle.length) || cycle.length <= 0) {
      return `cycles cycle missing length: ${cycle.id}`;
    }
    if (!Array.isArray(cycle.nodes) || cycle.nodes.length !== cycle.length + 1) {
      return `cycles cycle node count mismatch: ${cycle.id}`;
    }
    if (cycle.nodes[0] !== cycle.nodes[cycle.nodes.length - 1]) {
      return `cycles cycle does not close: ${cycle.id}`;
    }
    if (!Array.isArray(cycle.edges) || cycle.edges.length !== cycle.length) {
      return `cycles cycle edge count mismatch: ${cycle.id}`;
    }
    for (const [edgeIndex, edge] of cycle.edges.entries()) {
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
        return `cycles malformed edge: ${cycle.id}/${edgeIndex}`;
      }
      for (const key of ["from", "to", "via"]) {
        if (typeof edge[key] !== "string" || edge[key].length === 0) {
          return `cycles edge missing ${key}: ${cycle.id}/${edgeIndex}`;
        }
      }
    }
  }
  return null;
}

export function topologicalOrderShapeFailure(result) {
  if (result.operation !== "topological_order") {
    return `topological_order response operation mismatch — ${result.operation}`;
  }
  if (!Array.isArray(result.relationTypes) || result.relationTypes.some((type) => typeof type !== "string" || type.length === 0)) {
    return "topological_order response missing relationTypes";
  }
  if (result.prerequisiteFirst !== true) {
    return "topological_order must be prerequisite-first";
  }
  if (typeof result.includeIsolated !== "boolean") {
    return "topological_order response missing includeIsolated";
  }
  if (typeof result.acyclic !== "boolean") {
    return "topological_order response missing acyclic flag";
  }
  for (const key of ["totalNodes", "orderedCount", "selectedEdges"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `topological_order response missing ${key}`;
    }
  }
  if (result.orderedCount > result.totalNodes) {
    return `topological_order orderedCount exceeds totalNodes — ordered ${result.orderedCount}, total ${result.totalNodes}`;
  }
  if (typeof result.limited !== "boolean") {
    return "topological_order response missing limited flag";
  }
  if (!Array.isArray(result.order)) {
    return "topological_order response missing order";
  }
  if (result.order.length > result.orderedCount) {
    return `topological_order order exceeds orderedCount — rows ${result.order.length}, ordered ${result.orderedCount}`;
  }
  if (!result.limited && result.order.length !== result.orderedCount) {
    return `topological_order order count mismatch — rows ${result.order.length}, ordered ${result.orderedCount}`;
  }
  if (!Array.isArray(result.layers)) {
    return "topological_order response missing layers";
  }
  if (!Array.isArray(result.blocked)) {
    return "topological_order response missing blocked";
  }
  if (result.acyclic && result.blocked.length > 0) {
    return "topological_order acyclic result has blocked nodes";
  }
  for (const [index, row] of result.order.entries()) {
    const rowFailure = topologicalNodeRowFailure("topological_order order", row, index, { requireRank: true });
    if (rowFailure) return rowFailure;
  }
  for (const [index, layer] of result.layers.entries()) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return `topological_order malformed layer at index ${index}`;
    }
    if (!Number.isInteger(layer.rank) || layer.rank < 0) {
      return `topological_order layer missing rank at index ${index}`;
    }
    if (!Array.isArray(layer.nodes)) {
      return `topological_order layer missing nodes at rank ${layer.rank}`;
    }
    for (const [nodeIndex, node] of layer.nodes.entries()) {
      const rowFailure = topologicalNodeRowFailure(`topological_order layer ${layer.rank}`, node, nodeIndex);
      if (rowFailure) return rowFailure;
    }
  }
  for (const [index, row] of result.blocked.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `topological_order malformed blocked row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `topological_order blocked row missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.remainingInDegree) || row.remainingInDegree <= 0) {
      return `topological_order blocked row missing remainingInDegree: ${row.slug}`;
    }
  }
  return null;
}

function topologicalNodeRowFailure(label, row, index, { requireRank = false } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (requireRank && (!Number.isInteger(row.rank) || row.rank < 0)) {
    return `${label} row missing rank at index ${index}`;
  }
  const slug = typeof row.slug === "string" ? row.slug : row.node?.slug;
  if (typeof slug !== "string" || slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  return null;
}

export function lineageShapeFailure(result, targets) {
  if (result.operation !== "lineage") {
    return `lineage response operation mismatch — ${result.operation}`;
  }
  if (result.center !== targets.capabilitySlug) {
    return `lineage response center mismatch — ${result.center}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "lineage response missing depth";
  }
  if (!result.node || result.node.slug !== result.center) {
    return "lineage response missing center node";
  }
  for (const key of ["ancestors", "descendants"]) {
    const bucketFailure = lineageBucketFailure(`lineage ${key}`, result[key]);
    if (bucketFailure) return bucketFailure;
  }
  if (!Array.isArray(result.edges)) {
    return "lineage response missing edges array";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("lineage edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  const ancestorSlugs = new Set(result.ancestors.nodes.map((row) => row.slug));
  const descendantSlugs = new Set(result.descendants.nodes.map((row) => row.slug));
  if (!ancestorSlugs.has(targets.domainSlug)) {
    return `lineage response missing ${targets.domainSlug} ancestor`;
  }
  if (descendantSlugs.has(result.center) || ancestorSlugs.has(result.center)) {
    return "lineage response includes center in lineage rows";
  }
  return null;
}

export function lineageBucketFailure(label, bucket) {
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
    return `${label} missing nodes`;
  }
  if (bucket.nodes.length > bucket.total) {
    return `${label} nodes exceed total — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.nodes.length !== bucket.total) {
    return `${label} node count mismatch — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.nodes.entries()) {
    const rowFailure = lineageNodeFailure(label, row, index);
    if (rowFailure) return rowFailure;
  }
  return null;
}

function lineageNodeFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} row missing node summary: ${row.slug}`;
  }
  if (!Number.isInteger(row.distance) || row.distance <= 0) {
    return `${label} row missing distance: ${row.slug}`;
  }
  if (typeof row.via !== "string" || row.via.length === 0) {
    return `${label} row missing via: ${row.slug}`;
  }
  return null;
}

export function containmentTreeShapeFailure(result, targets) {
  if (result.operation !== "containment_tree") {
    return `containment_tree response operation mismatch — ${result.operation}`;
  }
  if (result.root !== targets.projectSlug) {
    return `containment_tree response root mismatch — ${result.root}`;
  }
  for (const key of ["depth", "totalRoots", "emittedNodes"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `containment_tree response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "containment_tree response missing limited flag";
  }
  if (!Array.isArray(result.roots)) {
    return "containment_tree response missing roots";
  }
  if (result.roots.length > result.totalRoots) {
    return `containment_tree roots exceed total — roots ${result.roots.length}, total ${result.totalRoots}`;
  }
  if (!result.limited && result.roots.length !== result.totalRoots) {
    return `containment_tree root count mismatch — roots ${result.roots.length}, total ${result.totalRoots}`;
  }
  if (!Array.isArray(result.cycles)) {
    return "containment_tree response missing cycles";
  }
  let countedNodes = 0;
  for (const [index, root] of result.roots.entries()) {
    const rootFailure = containmentNodeFailure(root, index, {
      expectedSlug: index === 0 ? targets.projectSlug : null,
      expectedDistance: 0,
      path: [],
    });
    if (rootFailure) return rootFailure;
    countedNodes += countContainmentNodes(root);
  }
  if (countedNodes !== result.emittedNodes) {
    return `containment_tree emitted node mismatch — emitted ${result.emittedNodes}, counted ${countedNodes}`;
  }
  for (const [index, cycle] of result.cycles.entries()) {
    const edgeFailure = graphEdgeFailure("containment_tree cycle", cycle, index);
    if (edgeFailure) return edgeFailure;
    if (!Array.isArray(cycle.path) || cycle.path.length === 0) {
      return `containment_tree cycle missing path at index ${index}`;
    }
  }
  return null;
}

function containmentNodeFailure(row, index, { expectedSlug = null, expectedDistance = null, path = [] } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `containment_tree malformed node at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `containment_tree node missing slug at index ${index}`;
  }
  if (expectedSlug && row.slug !== expectedSlug) {
    return `containment_tree root slug mismatch — ${row.slug}`;
  }
  if (!Number.isInteger(row.distance) || row.distance < 0) {
    return `containment_tree node missing distance: ${row.slug}`;
  }
  if (expectedDistance != null && row.distance !== expectedDistance) {
    return `containment_tree node distance mismatch: ${row.slug}`;
  }
  if (row.distance === 0 && row.via !== null) {
    return `containment_tree root should not have via: ${row.slug}`;
  }
  if (row.distance > 0 && (typeof row.via !== "string" || row.via.length === 0)) {
    return `containment_tree child missing via: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `containment_tree node summary mismatch: ${row.slug}`;
  }
  if (!Array.isArray(row.children)) {
    return `containment_tree node missing children: ${row.slug}`;
  }
  if (path.includes(row.slug)) {
    return `containment_tree repeated node in path: ${row.slug}`;
  }
  for (const [childIndex, child] of row.children.entries()) {
    const childFailure = containmentNodeFailure(child, childIndex, {
      expectedDistance: row.distance + 1,
      path: [...path, row.slug],
    });
    if (childFailure) return childFailure;
  }
  return null;
}

function countContainmentNodes(row) {
  return 1 + row.children.reduce((sum, child) => sum + countContainmentNodes(child), 0);
}

export function graphEdgeFailure(label, edge, index) {
  if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
    return `${label} malformed edge at index ${index}`;
  }
  for (const key of ["from", "to", "via"]) {
    if (typeof edge[key] !== "string" || edge[key].length === 0) {
      return `${label} missing ${key} at index ${index}`;
    }
  }
  return null;
}

export function reachabilityShapeFailure(result, targets) {
  if (result.operation !== "reachability") {
    return `reachability response operation mismatch — ${result.operation}`;
  }
  if (result.start !== targets.capabilitySlug) {
    return `reachability response start mismatch — ${result.start}`;
  }
  if (!result.node || result.node.slug !== result.start) {
    return "reachability response missing start node";
  }
  if (result.direction !== "outgoing") {
    return `reachability response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "reachability response missing depth";
  }
  const summaryFailure = numericSummaryFailure("reachability", result.summary, [
    "reachableNodes",
    "traversedEdges",
    "layers",
    "terminalNodes",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "reachability response missing byKind";
  }
  if (!result.byRelation || typeof result.byRelation !== "object" || Array.isArray(result.byRelation)) {
    return "reachability response missing byRelation";
  }
  if (!Array.isArray(result.layers)) {
    return "reachability response missing layers";
  }
  if (result.layers.length !== result.summary.layers) {
    return `reachability layer count mismatch — layers ${result.layers.length}, summary ${result.summary.layers}`;
  }
  for (const [index, layer] of result.layers.entries()) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return `reachability malformed layer at index ${index}`;
    }
    if (!Number.isInteger(layer.distance) || layer.distance <= 0) {
      return `reachability layer missing distance at index ${index}`;
    }
    if (!Number.isInteger(layer.total) || layer.total < 0) {
      return `reachability layer missing total at distance ${layer.distance}`;
    }
    if (!Array.isArray(layer.nodes)) {
      return `reachability layer missing nodes at distance ${layer.distance}`;
    }
    if (layer.nodes.length !== layer.total) {
      return `reachability layer node count mismatch — distance ${layer.distance}`;
    }
    const layerRowsFailure = matchRowsFailure(`reachability layer ${layer.distance}`, layer.nodes);
    if (layerRowsFailure) return layerRowsFailure;
  }
  const pathsFailure = reachablePathsFailure(
    "reachability paths",
    result.paths,
    result.summary.reachableNodes,
    targets.capabilitySlug,
  );
  if (pathsFailure) return pathsFailure;
  if (!Array.isArray(result.terminalNodes)) {
    return "reachability response missing terminalNodes";
  }
  if (result.terminalNodes.length !== result.summary.terminalNodes) {
    return `reachability terminal count mismatch — terminals ${result.terminalNodes.length}, summary ${result.summary.terminalNodes}`;
  }
  const terminalFailure = matchRowsFailure("reachability terminalNodes", result.terminalNodes);
  if (terminalFailure) return terminalFailure;
  const edgesFailure = graphEdgeBucketFailure("reachability edges", result.edges, result.summary.traversedEdges);
  if (edgesFailure) return edgesFailure;
  return null;
}

function reachablePathsFailure(label, paths, expectedTotal, startSlug = null) {
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(paths.total) || paths.total < 0) {
    return `${label} missing total`;
  }
  if (paths.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, paths ${paths.total}`;
  }
  if (typeof paths.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(paths.rows)) {
    return `${label} missing rows`;
  }
  if (paths.rows.length > paths.total) {
    return `${label} rows exceed total — rows ${paths.rows.length}, total ${paths.total}`;
  }
  if (!paths.limited && paths.rows.length !== paths.total) {
    return `${label} row count mismatch — rows ${paths.rows.length}, total ${paths.total}`;
  }
  for (const [index, row] of paths.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label} malformed row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `${label} row missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.distance) || row.distance <= 0) {
      return `${label} row missing distance: ${row.slug}`;
    }
    if (!Array.isArray(row.path) || (startSlug && row.path[0] !== startSlug) || row.path[row.path.length - 1] !== row.slug) {
      return `${label} row path mismatch: ${row.slug}`;
    }
    if (!Array.isArray(row.edges)) {
      return `${label} row missing edges: ${row.slug}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `${label} row missing node summary: ${row.slug}`;
    }
  }
  return null;
}

function graphEdgeBucketFailure(label, bucket, expectedTotal = null) {
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
  for (const [index, edge] of bucket.rows.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

export function impactShapeFailure(result, targets) {
  if (result.operation !== "impact") {
    return `impact response operation mismatch — ${result.operation}`;
  }
  if (result.center !== targets.capabilitySlug) {
    return `impact response center mismatch — ${result.center}`;
  }
  if (result.direction !== "incoming") {
    return `impact response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "impact response missing depth";
  }
  if (!Number.isInteger(result.total) || result.total < 0) {
    return "impact response missing total";
  }
  if (typeof result.limited !== "boolean") {
    return "impact response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "impact response missing nodes";
  }
  if (result.nodes.length > result.total) {
    return `impact nodes exceed total — nodes ${result.nodes.length}, total ${result.total}`;
  }
  if (!result.limited && result.nodes.length !== result.total) {
    return `impact node count mismatch — nodes ${result.nodes.length}, total ${result.total}`;
  }
  for (const [index, row] of result.nodes.entries()) {
    const rowFailure = impactedNodeFailure("impact", row, index);
    if (rowFailure) return rowFailure;
  }
  if (!Array.isArray(result.edges)) {
    return "impact response missing edges";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("impact edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

function impactedNodeFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed node at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} node missing slug at index ${index}`;
  }
  if (!Number.isInteger(row.distance) || row.distance <= 0) {
    return `${label} node missing distance: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} node summary mismatch: ${row.slug}`;
  }
  return null;
}

export function blastRadiusShapeFailure(result, targets) {
  if (result.operation !== "blast_radius") {
    return `blast_radius response operation mismatch — ${result.operation}`;
  }
  if (result.center !== targets.capabilitySlug) {
    return `blast_radius response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "blast_radius response missing center node";
  }
  if (result.direction !== "incoming") {
    return `blast_radius response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "blast_radius response missing depth";
  }
  // `unknown` is an intentional fail-closed result when relation-level source
  // receipts are unavailable. The engine documents that state instead of
  // fabricating a risk level from containment or unqualified edges.
  if (!["low", "medium", "high", "unknown"].includes(result.risk)) {
    return `blast_radius response unknown risk — ${result.risk}`;
  }
  const summaryFailure = numericSummaryFailure("blast_radius", result.summary, [
    "affectedNodes",
    "affectedEdges",
    "affectedKinds",
    "affectedDomains",
    "crossDomainEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "blast_radius response missing byKind";
  }
  if (!result.byDomain || typeof result.byDomain !== "object" || Array.isArray(result.byDomain)) {
    return "blast_radius response missing byDomain";
  }
  const nodesFailure = blastRadiusNodeBucketFailure(result.nodes, result.summary.affectedNodes);
  if (nodesFailure) return nodesFailure;
  const edgesFailure = blastRadiusEdgeBucketFailure(result.edges, result.summary.affectedEdges);
  if (edgesFailure) return edgesFailure;
  const crossDomainRows = result.edges.rows.filter((edge) => edge.crossDomain).length;
  if (crossDomainRows > result.summary.crossDomainEdges) {
    return `blast_radius cross-domain edge mismatch — rows ${crossDomainRows}, summary ${result.summary.crossDomainEdges}`;
  }
  return null;
}

function blastRadiusNodeBucketFailure(bucket, expectedTotal) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return "blast_radius nodes missing bucket";
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return "blast_radius nodes missing total";
  }
  if (bucket.total !== expectedTotal) {
    return `blast_radius nodes total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return "blast_radius nodes missing limited flag";
  }
  if (!Array.isArray(bucket.rows)) {
    return "blast_radius nodes missing rows";
  }
  if (bucket.rows.length > bucket.total) {
    return `blast_radius nodes rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `blast_radius nodes row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.rows.entries()) {
    const rowFailure = impactedNodeFailure("blast_radius", row, index);
    if (rowFailure) return rowFailure;
    if (row.domain !== null && typeof row.domain !== "string") {
      return `blast_radius node missing domain: ${row.slug}`;
    }
  }
  return null;
}

function blastRadiusEdgeBucketFailure(bucket, expectedTotal) {
  const bucketFailure = graphEdgeBucketFailure("blast_radius edges", bucket, expectedTotal);
  if (bucketFailure) return bucketFailure;
  for (const [index, edge] of bucket.rows.entries()) {
    if (edge.fromDomain !== null && typeof edge.fromDomain !== "string") {
      return `blast_radius edge missing fromDomain at index ${index}`;
    }
    if (edge.toDomain !== null && typeof edge.toDomain !== "string") {
      return `blast_radius edge missing toDomain at index ${index}`;
    }
    if (typeof edge.crossDomain !== "boolean") {
      return `blast_radius edge missing crossDomain at index ${index}`;
    }
  }
  return null;
}

export function subgraphShapeFailure(result, targets) {
  if (result.operation !== "subgraph") {
    return `subgraph response operation mismatch — ${result.operation}`;
  }
  if (result.seed !== targets.capabilitySlug) {
    return `subgraph response seed mismatch — ${result.seed}`;
  }
  if (result.direction !== "both") {
    return `subgraph response direction mismatch — ${result.direction}`;
  }
  for (const key of ["depth", "totalNodes", "totalEdges"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `subgraph response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "subgraph response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "subgraph response missing nodes";
  }
  if (result.nodes.length > result.totalNodes) {
    return `subgraph nodes exceed total — nodes ${result.nodes.length}, total ${result.totalNodes}`;
  }
  if (!result.limited && result.nodes.length !== result.totalNodes) {
    return `subgraph node count mismatch — nodes ${result.nodes.length}, total ${result.totalNodes}`;
  }
  if (!result.nodes.some((row) => row.slug === result.seed && row.distance === 0)) {
    return "subgraph response missing seed node";
  }
  for (const [index, row] of result.nodes.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `subgraph malformed node at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `subgraph node missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.distance) || row.distance < 0) {
      return `subgraph node missing distance: ${row.slug}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `subgraph node summary mismatch: ${row.slug}`;
    }
  }
  if (!Array.isArray(result.edges)) {
    return "subgraph response missing edges";
  }
  if (result.edges.length !== result.totalEdges) {
    return `subgraph edge count mismatch — edges ${result.edges.length}, total ${result.totalEdges}`;
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("subgraph edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}
