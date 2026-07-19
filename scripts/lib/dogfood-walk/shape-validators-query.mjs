// Response-shape validators for the dogfood MCP walk: core read/query tools
// (evidence, concepts, pattern_walk, all_paths, query_plan, neighbors, path,
// project_scope/map, domain_profile/matrix, components, relation_check).
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import {
  structuredContentMismatchSummary,
  structuredContentParityStatus,
} from "../../../mcp/scripts/verify.mjs";
import {
  isNonBlankString,
  matchRowsFailure,
  numericSummaryFailure,
  pathShapeFailure,
} from "./shape-validators-workspace.mjs";
import { graphEdgeFailure } from "./shape-validators-graph-structure.mjs";
import {
  scopeEdgeBucketFailure,
  summarizedNodeBucketFailure,
  summarizedRowBucketFailure,
} from "./shape-validators-graph-analytics.mjs";

export function recordStructuredContentFailure(failures, label, parsed, structured) {
  const status = structuredContentParityStatus(parsed, structured);
  if (status === "missing") {
    failures.push(`${label} structuredContent missing`);
    return;
  }
  if (status === "mismatch") {
    failures.push(structuredContentMismatchFailure(label, parsed, structured));
  }
}

export function structuredContentMismatchFailure(label, parsed, structured) {
  return `${label} structuredContent mismatch — ${structuredContentMismatchSummary(parsed, structured)}`;
}

export function evidenceShapeFailure(result) {
  if (!Array.isArray(result.matches)) {
    return "find_evidence response missing matches array";
  }
  return matchRowsFailure("find_evidence", result.matches);
}

export function getConceptsShapeFailure(result) {
  if (!Array.isArray(result.concepts)) {
    return "get_concepts response missing concepts array";
  }
  if (result.concepts.length !== 3) {
    return `get_concepts response row count mismatch — expected 3, got ${result.concepts.length}`;
  }
  const [project, mcpServer, missing] = result.concepts;
  for (const [index, row] of [project, mcpServer].entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `get_concepts response malformed success row at index ${index}`;
    }
    if (row.ok !== true) {
      return `get_concepts response expected success row at index ${index}`;
    }
    if (!isNonBlankString(row.slug)) {
      return `get_concepts response missing success slug at index ${index}`;
    }
    if (!row.frontmatter || typeof row.frontmatter !== "object" || Array.isArray(row.frontmatter)) {
      return `get_concepts response missing frontmatter: ${row.slug}`;
    }
    if (typeof row.mtime !== "number" || !Number.isFinite(row.mtime)) {
      return `get_concepts response missing mtime: ${row.slug}`;
    }
  }
  if (!missing || typeof missing !== "object" || Array.isArray(missing)) {
    return "get_concepts response malformed missing row at index 2";
  }
  if (missing.ok !== false) {
    return "get_concepts response expected missing row to be ok:false";
  }
  if (missing.slug !== "missing-dogfood-slug") {
    return `get_concepts response missing row slug mismatch — ${missing.slug}`;
  }
  if (typeof missing.error !== "string" || !/not found/i.test(missing.error)) {
    return "get_concepts response missing row error";
  }
  return null;
}

export function patternWalkShapeFailure(result) {
  if (result.operation !== "pattern_walk") {
    return "pattern_walk response operation mismatch";
  }
  if (!Array.isArray(result.pattern) || result.pattern.length === 0) {
    return "pattern_walk response missing pattern array";
  }
  if (!Array.isArray(result.layers)) {
    return "pattern_walk response missing layers array";
  }
  if (!Array.isArray(result.endNodes)) {
    return "pattern_walk response missing endNodes array";
  }
  if (!result.paths || !Array.isArray(result.paths.rows)) {
    return "pattern_walk response missing paths.rows array";
  }
  if (!Number.isInteger(result.paths.total) || result.paths.total < 0) {
    return "pattern_walk response missing paths.total";
  }
  if (typeof result.paths.limited !== "boolean") {
    return "pattern_walk response missing paths.limited flag";
  }
  if (result.paths.rows.length === 0) {
    return "pattern_walk response returned no rows";
  }
  if (result.paths.rows.length > result.paths.total) {
    return `pattern_walk response row count exceeds total — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  if (result.paths.limited && result.paths.total <= result.paths.rows.length) {
    return `pattern_walk response limited without hidden row — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  if (!result.paths.limited && result.paths.total !== result.paths.rows.length) {
    return `pattern_walk response total mismatch — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  for (let i = 0; i < result.paths.rows.length; i += 1) {
    const row = result.paths.rows[i];
    if (!Array.isArray(row.path) || row.path.length < 2) {
      return `pattern_walk response missing path at index ${i}`;
    }
    if (!row.end) {
      return `pattern_walk response missing end at index ${i}`;
    }
  }
  return null;
}

export function allPathsShapeFailure(result) {
  if (result.operation !== "all_paths") {
    return "all_paths response operation mismatch";
  }
  if (typeof result.found !== "boolean") {
    return "all_paths response missing found flag";
  }
  if (!Number.isInteger(result.totalPaths) || result.totalPaths < 0) {
    return "all_paths response missing totalPaths";
  }
  if (typeof result.limited !== "boolean") {
    return "all_paths response missing limited flag";
  }
  if (!Number.isInteger(result.searchBudget) || result.searchBudget < 1) {
    return "all_paths response missing searchBudget";
  }
  if (!Number.isInteger(result.expandedStates) || result.expandedStates < 0) {
    return "all_paths response missing expandedStates";
  }
  if (typeof result.exhaustive !== "boolean") {
    return "all_paths response missing exhaustive flag";
  }
  if (typeof result.truncatedByBudget !== "boolean") {
    return "all_paths response missing truncatedByBudget flag";
  }
  if (typeof result.totalPathsExact !== "boolean") {
    return "all_paths response missing totalPathsExact flag";
  }
  if (result.expandedStates > result.searchBudget) {
    return `all_paths response exceeded searchBudget — expanded ${result.expandedStates}, budget ${result.searchBudget}`;
  }
  if (result.truncatedByBudget && result.exhaustive) {
    return "all_paths response cannot be both budget-truncated and exhaustive";
  }
  if (!result.truncatedByBudget && !result.exhaustive) {
    return "all_paths response non-exhaustive without budget truncation";
  }
  if (result.totalPathsExact !== result.exhaustive) {
    return "all_paths response totalPathsExact/exhaustive mismatch";
  }
  if (!Array.isArray(result.paths)) {
    return "all_paths response missing paths array";
  }
  if (result.paths.length === 0) {
    return "all_paths response returned no paths";
  }
  if (result.paths.length > result.totalPaths) {
    return `all_paths response row count exceeds total — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  if (result.limited && !result.truncatedByBudget && result.totalPaths <= result.paths.length) {
    return `all_paths response limited without hidden path — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  if (!result.limited && result.totalPaths !== result.paths.length) {
    return `all_paths response total mismatch — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  for (let i = 0; i < result.paths.length; i += 1) {
    const row = result.paths[i];
    if (!Array.isArray(row.hops) || row.hops.length < 2) {
      return `all_paths response missing hops at index ${i}`;
    }
    if (!Array.isArray(row.edges)) {
      return `all_paths response missing edges at index ${i}`;
    }
  }
  const seen = new Set();
  for (let i = 0; i < result.paths.length; i += 1) {
    const row = result.paths[i];
    const relationChain = row.edges.map((edge) => edge?.via ?? "").join(">");
    const signature = `${row.hops.join(">")}|${relationChain}`;
    if (seen.has(signature)) {
      return `all_paths response duplicate path signature at index ${i}`;
    }
    seen.add(signature);
  }
  return null;
}

export function allPathsPlanShapeFailure(result) {
  if (result.operation !== "query_plan") {
    return "all_paths query_plan response operation mismatch";
  }
  if (result.targetOperation !== "all_paths") {
    return "all_paths query_plan targetOperation mismatch";
  }
  if (result.sideEffect !== false) {
    return "all_paths query_plan must be side-effect-free";
  }
  if (!result.normalized || result.normalized.targetOperation !== "all_paths") {
    return "all_paths query_plan missing normalized targetOperation";
  }
  if (result.normalized.limit !== 25) {
    return `all_paths query_plan default limit mismatch — expected 25, got ${result.normalized.limit}`;
  }
  if (result.normalized.searchBudget !== 5000) {
    return `all_paths query_plan default searchBudget mismatch — expected 5000, got ${result.normalized.searchBudget}`;
  }
  if (result.normalized.from !== "capabilities/mcp-server") {
    return `all_paths query_plan normalized from mismatch — ${result.normalized.from}`;
  }
  if (result.normalized.to !== "domains/vault-local-first") {
    return `all_paths query_plan normalized to mismatch — ${result.normalized.to}`;
  }
  if (!result.estimate || result.estimate.strategy !== "bounded_path_enumeration") {
    return "all_paths query_plan missing bounded path estimate";
  }
  if (!Number.isInteger(result.estimate.resultUpperBound) || result.estimate.resultUpperBound < 0) {
    return "all_paths query_plan missing resultUpperBound";
  }
  if (result.estimate.resultUpperBound > result.normalized.limit) {
    return `all_paths query_plan resultUpperBound exceeds limit — upper ${result.estimate.resultUpperBound}, limit ${result.normalized.limit}`;
  }
  if (!["low", "medium", "high"].includes(result.estimate.costClass)) {
    return "all_paths query_plan missing costClass";
  }
  if (!Array.isArray(result.warnings)) {
    return "all_paths query_plan missing warnings array";
  }
  const executionFailure = queryPlanExecutionShapeFailure(result.execution, "all_paths", "all_paths query_plan");
  if (executionFailure) return executionFailure;
  return null;
}

export function queryPlanExecutionShapeFailure(execution, targetOperation, label) {
  if (!execution || typeof execution !== "object") {
    return `${label} missing execution advice`;
  }
  if (typeof execution.shouldRun !== "boolean") {
    return `${label} execution missing shouldRun`;
  }
  if (!["run", "narrow", "review"].includes(execution.nextStep)) {
    return `${label} execution missing nextStep`;
  }
  if (typeof execution.recommendation !== "string" || execution.recommendation.trim() === "") {
    return `${label} execution missing recommendation`;
  }
  if (!execution.suggestedQuery || execution.suggestedQuery.operation !== targetOperation) {
    return `${label} execution missing suggestedQuery`;
  }
  if (execution.nextStep === "narrow" && !execution.saferQuery) {
    return `${label} execution missing saferQuery for narrow advice`;
  }
  return null;
}

export function neighborsShapeFailure(result) {
  if (result.operation !== "neighbors") {
    return `neighbors response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `neighbors response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "neighbors response missing center node";
  }
  if (!Number.isInteger(result.total) || result.total < 0) {
    return "neighbors response missing total";
  }
  if (typeof result.limited !== "boolean") {
    return "neighbors response missing limited flag";
  }
  if (!Array.isArray(result.edges)) {
    return "neighbors response missing edges";
  }
  if (result.edges.length === 0) {
    return "neighbors response returned no edges";
  }
  if (result.edges.length > result.total) {
    return `neighbors edges exceed total — edges ${result.edges.length}, total ${result.total}`;
  }
  if (!result.limited && result.edges.length !== result.total) {
    return `neighbors edge count mismatch — edges ${result.edges.length}, total ${result.total}`;
  }
  if (!Array.isArray(result.nodes)) {
    return "neighbors response missing nodes";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("neighbors edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (!["incoming", "outgoing"].includes(edge.direction)) {
      return `neighbors edge missing direction at index ${index}`;
    }
    if (edge.direction === "incoming" && edge.to !== result.center) {
      return `neighbors incoming edge does not target center at index ${index}`;
    }
    if (edge.direction === "outgoing" && edge.from !== result.center) {
      return `neighbors outgoing edge does not start at center at index ${index}`;
    }
  }
  const nodeFailure = matchRowsFailure("neighbors nodes", result.nodes);
  if (nodeFailure) return nodeFailure;
  return null;
}

export function queryPathShapeFailure(result) {
  if (result.operation !== "path") {
    return `path operation response mismatch — ${result.operation}`;
  }
  if (result.from !== "capabilities/mcp-server") {
    return `path operation from mismatch — ${result.from}`;
  }
  if (result.to !== "domains/vault-local-first") {
    return `path operation to mismatch — ${result.to}`;
  }
  const pathFailure = pathShapeFailure(result);
  if (pathFailure) return pathFailure.replace("find_path", "path operation");
  if (!result.found) {
    return "path operation expected mcp-server → vault-local-first path";
  }
  if (!Array.isArray(result.edges)) {
    return "path operation response missing edges";
  }
  if (result.edges.length !== result.hopCount) {
    return `path operation edge mismatch — edges ${result.edges.length}, hopCount ${result.hopCount}`;
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("path operation edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (edge.traversedFrom !== result.hops[index] || edge.traversedTo !== result.hops[index + 1]) {
      return `path operation traversal mismatch at index ${index}`;
    }
  }
  return null;
}

export function projectScopeShapeFailure(result) {
  if (result.operation !== "project_scope") {
    return `project_scope response operation mismatch — ${result.operation}`;
  }
  if (result.project !== "project") {
    return `project_scope response project mismatch — ${result.project}`;
  }
  if (!result.node || result.node.slug !== result.project) {
    return "project_scope response missing project node";
  }
  const summaryFailure = numericSummaryFailure("project_scope", result.summary, [
    "nodes",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "project_scope response missing byKind";
  }
  if (!result.byDomain || typeof result.byDomain !== "object" || Array.isArray(result.byDomain)) {
    return "project_scope response missing byDomain";
  }
  const nodesFailure = summarizedRowBucketFailure("project_scope nodes", result.nodes, result.summary.nodes);
  if (nodesFailure) return nodesFailure;
  const kindTotal = Object.values(result.byKind).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (kindTotal !== result.summary.nodes) {
    return `project_scope byKind count mismatch — summary ${result.summary.nodes}, byKind ${kindTotal}`;
  }
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "project_scope response missing edges";
  }
  const expectedTotals = {
    internal: result.summary.internalEdges,
    boundary: result.summary.boundaryEdges,
    external: result.summary.externalEdges,
    unresolved: result.summary.unresolvedEdges,
  };
  for (const [key, expectedTotal] of Object.entries(expectedTotals)) {
    const edgeFailure = scopeEdgeBucketFailure(`project_scope ${key} edges`, result.edges[key]);
    if (edgeFailure) return edgeFailure;
    if (result.edges[key].total !== expectedTotal) {
      return `project_scope ${key} edge total mismatch — summary ${expectedTotal}, bucket ${result.edges[key].total}`;
    }
  }
  return null;
}

export function projectMapShapeFailure(result) {
  if (result.operation !== "project_map") {
    return `project_map response operation mismatch — ${result.operation}`;
  }
  if (typeof result.project !== "string" || result.project.length === 0) {
    return "project_map response missing project";
  }
  const summaryFailure = numericSummaryFailure("project_map", result.summary, [
    "nodes",
    "domains",
    "capabilities",
    "elements",
    "unassignedNodes",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (typeof result.limited !== "boolean") {
    return "project_map response missing limited flag";
  }
  if (!Array.isArray(result.domains)) {
    return "project_map response missing domains array";
  }
  if (result.domains.length === 0) {
    return "project_map response returned no domains";
  }
  if (result.domains.length > result.summary.domains) {
    return `project_map response domains exceed summary — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  if (!result.limited && result.domains.length !== result.summary.domains) {
    return `project_map response domain count mismatch — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  for (const [index, domain] of result.domains.entries()) {
    if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
      return `project_map response malformed domain at index ${index}`;
    }
    if (typeof domain.slug !== "string" || domain.slug.length === 0) {
      return `project_map response missing domain slug at index ${index}`;
    }
    const domainSummaryFailure = numericSummaryFailure("project_map domain", domain.summary, [
      "nodes",
      "capabilities",
      "elements",
      "internalEdges",
      "boundaryEdges",
      "externalEdges",
      "unresolvedEdges",
    ]);
    if (domainSummaryFailure) return `${domainSummaryFailure}: ${domain.slug}`;
    const capabilitiesFailure = summarizedNodeBucketFailure(`project_map capabilities: ${domain.slug}`, domain.capabilities);
    if (capabilitiesFailure) return capabilitiesFailure;
    const elementsFailure = summarizedNodeBucketFailure(`project_map elements: ${domain.slug}`, domain.elements);
    if (elementsFailure) return elementsFailure;
    if (domain.capabilities.total !== domain.summary.capabilities) {
      return `project_map capabilities total mismatch — ${domain.slug}: summary ${domain.summary.capabilities}, bucket ${domain.capabilities.total}`;
    }
    if (domain.elements.total !== domain.summary.elements) {
      return `project_map elements total mismatch — ${domain.slug}: summary ${domain.summary.elements}, bucket ${domain.elements.total}`;
    }
  }
  const unassignedFailure = summarizedNodeBucketFailure("project_map unassigned", result.unassigned);
  if (unassignedFailure) return unassignedFailure;
  if (!Array.isArray(result.hotspots)) {
    return "project_map response missing hotspots array";
  }
  return matchRowsFailure("project_map hotspots", result.hotspots);
}

export function domainProfileShapeFailure(result) {
  if (result.operation !== "domain_profile") {
    return `domain_profile response operation mismatch — ${result.operation}`;
  }
  if (result.domain !== "domains/ai-agent-partner") {
    return `domain_profile response domain mismatch — ${result.domain}`;
  }
  if (!result.node || result.node.slug !== result.domain) {
    return "domain_profile response missing domain node";
  }
  if (!result.parents || !Array.isArray(result.parents.projects)) {
    return "domain_profile response missing parent projects";
  }
  const summaryFailure = numericSummaryFailure("domain_profile", result.summary, [
    "nodes",
    "capabilities",
    "elements",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  const capabilitiesFailure = summarizedNodeBucketFailure("domain_profile capabilities", result.capabilities);
  if (capabilitiesFailure) return capabilitiesFailure;
  const elementsFailure = summarizedNodeBucketFailure("domain_profile elements", result.elements);
  if (elementsFailure) return elementsFailure;
  if (result.capabilities.total !== result.summary.capabilities) {
    return `domain_profile capabilities total mismatch — summary ${result.summary.capabilities}, bucket ${result.capabilities.total}`;
  }
  if (result.elements.total !== result.summary.elements) {
    return `domain_profile elements total mismatch — summary ${result.summary.elements}, bucket ${result.elements.total}`;
  }
  if (!Array.isArray(result.hotspots)) {
    return "domain_profile response missing hotspots array";
  }
  const hotspotsFailure = matchRowsFailure("domain_profile hotspots", result.hotspots);
  if (hotspotsFailure) return hotspotsFailure;
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "domain_profile response missing edges block";
  }
  for (const key of ["boundary", "external", "unresolved"]) {
    const failure = scopeEdgeBucketFailure(`domain_profile ${key} edges`, result.edges[key]);
    if (failure) return failure;
  }
  return null;
}

export function domainMatrixShapeFailure(result) {
  if (result.operation !== "domain_matrix") {
    return `domain_matrix response operation mismatch — ${result.operation}`;
  }
  if (result.project !== "project") {
    return `domain_matrix response project mismatch — ${result.project}`;
  }
  const summaryFailure = numericSummaryFailure("domain_matrix", result.summary, [
    "domains",
    "nodes",
    "assignedNodes",
    "unassignedNodes",
    "crossDomainEdges",
    "selfDomainEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!Array.isArray(result.domains)) {
    return "domain_matrix response missing domains array";
  }
  if (result.domains.length !== result.summary.domains) {
    return `domain_matrix response domain count mismatch — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  const assignedNodes = result.domains.reduce((sum, domain) => sum + (Number.isInteger(domain?.nodes) ? domain.nodes : 0), 0);
  if (assignedNodes !== result.summary.assignedNodes) {
    return `domain_matrix assigned node mismatch — summary ${result.summary.assignedNodes}, domains ${assignedNodes}`;
  }
  for (const [index, domain] of result.domains.entries()) {
    if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
      return `domain_matrix response malformed domain at index ${index}`;
    }
    if (typeof domain.slug !== "string" || domain.slug.length === 0) {
      return `domain_matrix response missing domain slug at index ${index}`;
    }
    for (const key of ["nodes", "outgoing", "incoming", "selfEdges", "externalEdges", "unresolvedEdges"]) {
      if (!Number.isInteger(domain[key]) || domain[key] < 0) {
        return `domain_matrix domain missing ${key}: ${domain.slug}`;
      }
    }
  }
  if (!result.connections || typeof result.connections !== "object" || Array.isArray(result.connections)) {
    return "domain_matrix response missing connections";
  }
  if (!Number.isInteger(result.connections.total) || result.connections.total < 0) {
    return "domain_matrix connections missing total";
  }
  if (typeof result.connections.limited !== "boolean") {
    return "domain_matrix connections missing limited flag";
  }
  if (!Array.isArray(result.connections.rows)) {
    return "domain_matrix connections missing rows array";
  }
  if (result.connections.rows.length > result.connections.total) {
    return `domain_matrix connections rows exceed total — rows ${result.connections.rows.length}, total ${result.connections.total}`;
  }
  if (!result.connections.limited && result.connections.rows.length !== result.connections.total) {
    return `domain_matrix connections row count mismatch — rows ${result.connections.rows.length}, total ${result.connections.total}`;
  }
  for (const [index, row] of result.connections.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `domain_matrix connection malformed row at index ${index}`;
    }
    if (typeof row.from !== "string" || row.from.length === 0) {
      return `domain_matrix connection missing from at index ${index}`;
    }
    if (typeof row.to !== "string" || row.to.length === 0) {
      return `domain_matrix connection missing to at index ${index}`;
    }
    if (!Number.isInteger(row.count) || row.count <= 0) {
      return `domain_matrix connection missing count: ${row.from}->${row.to}`;
    }
    if (!row.byRelation || typeof row.byRelation !== "object" || Array.isArray(row.byRelation)) {
      return `domain_matrix connection missing byRelation: ${row.from}->${row.to}`;
    }
    if (!Array.isArray(row.examples)) {
      return `domain_matrix connection missing examples: ${row.from}->${row.to}`;
    }
  }
  return null;
}

export function componentsShapeFailure(result) {
  if (result.operation !== "components") {
    return `components response operation mismatch — ${result.operation}`;
  }
  for (const key of ["totalComponents", "largestSize", "singletonCount"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `components response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "components response missing limited flag";
  }
  if (!Array.isArray(result.components)) {
    return "components response missing components array";
  }
  if (result.components.length > result.totalComponents) {
    return `components rows exceed total — rows ${result.components.length}, total ${result.totalComponents}`;
  }
  if (!result.limited && result.components.length !== result.totalComponents) {
    return `components row count mismatch — rows ${result.components.length}, total ${result.totalComponents}`;
  }
  const largestObserved = result.components.reduce((max, component) => Math.max(max, Number.isInteger(component?.size) ? component.size : 0), 0);
  if (result.components.length > 0 && result.largestSize < largestObserved) {
    return `components largestSize below returned component — largest ${result.largestSize}, observed ${largestObserved}`;
  }
  for (const [index, component] of result.components.entries()) {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      return `components malformed component at index ${index}`;
    }
    if (!Number.isInteger(component.id) || component.id <= 0) {
      return `components component missing id at index ${index}`;
    }
    if (!Number.isInteger(component.size) || component.size <= 0) {
      return `components component missing size at index ${index}`;
    }
    if (!component.kinds || typeof component.kinds !== "object" || Array.isArray(component.kinds)) {
      return `components component missing kinds: ${component.id}`;
    }
    if (typeof component.nodeLimited !== "boolean") {
      return `components component missing nodeLimited flag: ${component.id}`;
    }
    if (!Array.isArray(component.nodes)) {
      return `components component missing nodes: ${component.id}`;
    }
    if (component.nodes.length > component.size) {
      return `components component nodes exceed size: ${component.id}`;
    }
    if (!component.nodeLimited && component.nodes.length !== component.size) {
      return `components component node count mismatch: ${component.id}`;
    }
    const kindTotal = Object.values(component.kinds).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
    if (kindTotal !== component.size) {
      return `components component kind count mismatch: ${component.id}`;
    }
    for (const [nodeIndex, node] of component.nodes.entries()) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        return `components component malformed node: ${component.id}`;
      }
      if (typeof node.slug !== "string" || node.slug.length === 0) {
        return `components component missing node slug: ${component.id}/${nodeIndex}`;
      }
      if (typeof node.kind !== "string" || node.kind.length === 0) {
        return `components component missing node kind: ${component.id}/${node.slug}`;
      }
    }
  }
  return null;
}

export function relationCheckShapeFailure(result) {
  if (result.operation !== "relation_check") {
    return `relation_check response operation mismatch — ${result.operation}`;
  }
  for (const key of ["from", "to", "relation", "fromKind", "toKind", "verdict"]) {
    if (typeof result[key] !== "string" || result[key].length === 0) {
      return `relation_check response missing ${key}`;
    }
  }
  if (typeof result.exists !== "boolean") {
    return "relation_check response missing exists flag";
  }
  if (!["already_exists", "matches_existing_schema", "new_schema_pattern"].includes(result.verdict)) {
    return `relation_check response unknown verdict — ${result.verdict}`;
  }
  if (!result.recommendation || typeof result.recommendation !== "object" || Array.isArray(result.recommendation)) {
    return "relation_check response missing recommendation";
  }
  if (!["skip_existing", "review_inverse", "safe_to_add", "review_new_schema"].includes(result.recommendation.decision)) {
    return `relation_check response unknown recommendation decision — ${result.recommendation.decision}`;
  }
  if (!["info", "warn"].includes(result.recommendation.severity)) {
    return `relation_check response unknown recommendation severity — ${result.recommendation.severity}`;
  }
  if (typeof result.recommendation.reason !== "string" || result.recommendation.reason.length === 0) {
    return "relation_check recommendation missing reason";
  }
  if (!Array.isArray(result.matchingEdges)) {
    return "relation_check response missing matchingEdges array";
  }
  if (!Array.isArray(result.inverseEdges)) {
    return "relation_check response missing inverseEdges array";
  }
  if (result.exists && result.matchingEdges.length === 0) {
    return "relation_check exists without matchingEdges";
  }
  if (!result.exists && result.verdict === "already_exists") {
    return "relation_check already_exists verdict without exists flag";
  }
  if (result.verdict === "new_schema_pattern" && result.schemaPattern !== null) {
    return "relation_check new_schema_pattern should not include schemaPattern";
  }
  if (result.verdict !== "new_schema_pattern") {
    if (!result.schemaPattern || typeof result.schemaPattern !== "object" || Array.isArray(result.schemaPattern)) {
      return "relation_check response missing schemaPattern";
    }
    for (const key of ["fromKind", "relation", "toKind"]) {
      if (typeof result.schemaPattern[key] !== "string" || result.schemaPattern[key].length === 0) {
        return `relation_check schemaPattern missing ${key}`;
      }
    }
    if (!Number.isInteger(result.schemaPattern.count) || result.schemaPattern.count <= 0) {
      return "relation_check schemaPattern missing count";
    }
    if (
      result.schemaPattern.fromKind !== result.fromKind ||
      result.schemaPattern.relation !== result.relation ||
      result.schemaPattern.toKind !== result.toKind
    ) {
      return "relation_check schemaPattern mismatch";
    }
  }
  for (const [index, edge] of result.matchingEdges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `relation_check malformed matching edge at index ${index}`;
    }
    for (const key of ["from", "to", "via"]) {
      if (typeof edge[key] !== "string" || edge[key].length === 0) {
        return `relation_check matching edge missing ${key} at index ${index}`;
      }
    }
    if (edge.from !== result.from || edge.to !== result.to || edge.via !== result.relation) {
      return `relation_check matching edge mismatch at index ${index}`;
    }
  }
  for (const [index, edge] of result.inverseEdges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `relation_check malformed inverse edge at index ${index}`;
    }
    for (const key of ["from", "to", "via"]) {
      if (typeof edge[key] !== "string" || edge[key].length === 0) {
        return `relation_check inverse edge missing ${key} at index ${index}`;
      }
    }
    if (edge.from !== result.to || edge.to !== result.from || edge.via !== result.relation) {
      return `relation_check inverse edge mismatch at index ${index}`;
    }
  }
  return null;
}
