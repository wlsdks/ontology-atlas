const DIAGNOSIS_STATUSES = new Set(['healthy', 'needs_attention']);
const HEALTH_CHECK_STATUSES = new Set(['pass', 'warn', 'fail', 'info']);
const NEXT_ACTION_SEVERITIES = new Set(['info', 'warn', 'fail']);
const MAINTENANCE_ACTION_SEVERITIES = new Set(['fail', 'warn', 'info']);
const BLAST_RADIUS_RISKS = new Set(['low', 'medium', 'high']);

export function assertQueryOperation(result, expectedOperation) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error(`${expectedOperation} query returned a non-object response`);
  }
  if (result.operation !== expectedOperation) {
    throw new Error(`${expectedOperation} query returned unexpected operation: ${result.operation}`);
  }
  return result;
}

export function assertMaintenancePlanShape(result) {
  assertQueryOperation(result, 'maintenance_plan');
  if (!isPlainObject(result.summary)) {
    throw new Error('maintenance_plan summary must be an object');
  }
  for (const field of [
    'totalActions',
    'filteredActions',
    'remainingActions',
    'executableActions',
    'reviewActions',
  ]) {
    if (!validCount(result.summary[field])) {
      throw new Error(`maintenance_plan summary.${field} must be a non-negative integer`);
    }
  }
  if (result.summary.executableActions + result.summary.reviewActions !== result.summary.totalActions) {
    throw new Error('maintenance_plan summary executableActions + reviewActions must equal totalActions');
  }
  if (result.summary.filteredActions > result.summary.totalActions) {
    throw new Error('maintenance_plan summary.filteredActions must not exceed totalActions');
  }
  if (result.summary.remainingActions > result.summary.filteredActions) {
    throw new Error('maintenance_plan summary.remainingActions must not exceed filteredActions');
  }
  if (!isPlainObject(result.cursor)) {
    throw new Error('maintenance_plan cursor must be an object');
  }
  if (typeof result.cursor.found !== 'boolean') {
    throw new Error('maintenance_plan cursor.found must be a boolean');
  }
  if (result.cursor.startIndex != null && !validCount(result.cursor.startIndex)) {
    throw new Error('maintenance_plan cursor.startIndex must be a non-negative integer');
  }
  if (typeof result.cursor.hasMore !== 'boolean') {
    throw new Error('maintenance_plan cursor.hasMore must be a boolean');
  }
  for (const field of ['afterActionId', 'nextAfterActionId', 'reason']) {
    if (!nullableString(result.cursor[field])) {
      throw new Error(`maintenance_plan cursor.${field} must be null or a string`);
    }
  }
  if (!Array.isArray(result.actions)) {
    throw new Error('maintenance_plan actions must be an array');
  }
  if (result.actions.length > result.summary.remainingActions) {
    throw new Error('maintenance_plan actions length must not exceed summary.remainingActions');
  }
  for (let index = 0; index < result.actions.length; index += 1) {
    const action = result.actions[index];
    const actionFailure = maintenanceActionFailure(action, index);
    if (actionFailure) throw new Error(actionFailure);
  }
  for (const field of ['byPhase', 'bySeverity', 'byKind']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`maintenance_plan ${field} must be an object of non-negative integer counts`);
    }
    if (sumCountBucket(result[field]) !== result.summary.remainingActions) {
      throw new Error(`maintenance_plan ${field} total must equal summary.remainingActions`);
    }
  }
  const expectedNextAfterActionId = result.actions.length > 0
    ? result.actions[result.actions.length - 1].id
    : null;
  if (result.cursor.nextAfterActionId !== expectedNextAfterActionId) {
    throw new Error('maintenance_plan cursor.nextAfterActionId must match the last returned action id');
  }
  if (result.cursor.hasMore !== (result.summary.remainingActions > result.actions.length)) {
    throw new Error('maintenance_plan cursor.hasMore must match remaining actions after the current page');
  }
  for (const field of ['nextExecutableAction', 'nextReviewAction']) {
    if (result[field] !== null && !validMaintenanceActionPointer(result[field])) {
      throw new Error(`maintenance_plan ${field} must be null or an action pointer with id, executable, phase, kind, and severity`);
    }
  }
  const firstExecutableAction = result.actions.find((action) => action.executable === true) ?? null;
  if (firstExecutableAction && result.nextExecutableAction?.id !== firstExecutableAction.id) {
    throw new Error('maintenance_plan nextExecutableAction must match the first executable action on the page');
  }
  if (firstExecutableAction) {
    const pointerMismatch = maintenanceActionPointerMismatch(
      firstExecutableAction,
      result.nextExecutableAction,
      'nextExecutableAction',
    );
    if (pointerMismatch) throw new Error(pointerMismatch);
  }
  if (!firstExecutableAction && result.nextExecutableAction !== null) {
    throw new Error('maintenance_plan nextExecutableAction must be null when the page has no executable actions');
  }
  const firstReviewAction = result.actions.find((action) => action.executable === false) ?? null;
  if (firstReviewAction && result.nextReviewAction?.id !== firstReviewAction.id) {
    throw new Error('maintenance_plan nextReviewAction must match the first review action on the page');
  }
  if (firstReviewAction) {
    const pointerMismatch = maintenanceActionPointerMismatch(
      firstReviewAction,
      result.nextReviewAction,
      'nextReviewAction',
    );
    if (pointerMismatch) throw new Error(pointerMismatch);
  }
  if (!firstReviewAction && result.nextReviewAction !== null) {
    throw new Error('maintenance_plan nextReviewAction must be null when the page has no review actions');
  }
  return result;
}

export function assertHealthShape(result) {
  assertQueryOperation(result, 'health');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`health status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('health summary must be an object');
  }
  if (!Array.isArray(result.checks) || result.checks.length === 0) {
    throw new Error('health checks must be a non-empty array');
  }
  for (let index = 0; index < result.checks.length; index += 1) {
    if (!validHealthCheck(result.checks[index])) {
      throw new Error(`health checks[${index}] has an invalid health-check shape`);
    }
  }
  return result;
}

export function assertWorkspaceBriefShape(result) {
  assertQueryOperation(result, 'workspace_brief');
  if (!DIAGNOSIS_STATUSES.has(result.status)) {
    throw new Error(`workspace_brief status must be one of: ${[...DIAGNOSIS_STATUSES].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('workspace_brief summary must be an object');
  }
  if (!Array.isArray(result.nextActions)) {
    throw new Error('workspace_brief nextActions must be an array');
  }
  for (let index = 0; index < result.nextActions.length; index += 1) {
    if (!validNextAction(result.nextActions[index])) {
      throw new Error(`workspace_brief nextActions[${index}] has an invalid next-action shape`);
    }
  }
  if (!isPlainObject(result.health) || !Array.isArray(result.health.checks) || result.health.checks.length === 0) {
    throw new Error('workspace_brief health.checks must be a non-empty array');
  }
  for (let index = 0; index < result.health.checks.length; index += 1) {
    if (!validHealthCheck(result.health.checks[index])) {
      throw new Error(`workspace_brief health.checks[${index}] has an invalid health-check shape`);
    }
  }
  if (result.growth !== undefined && !isPlainObject(result.growth)) {
    throw new Error('workspace_brief growth must be an object when present');
  }
  return result;
}

export function assertCyclesShape(result) {
  assertQueryOperation(result, 'cycles');
  if (!Array.isArray(result.cycles)) {
    throw new Error('cycles query cycles must be an array');
  }
  const total = result.totalCycles ?? result.cycles.length;
  if (!validCount(total)) {
    throw new Error('cycles query totalCycles must be a non-negative integer when present');
  }
  for (let index = 0; index < result.cycles.length; index += 1) {
    if (!validCycle(result.cycles[index])) {
      throw new Error(`cycles query cycles[${index}] has an invalid cycle shape`);
    }
  }
  return result;
}

export function assertPathShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_path response must be an object');
  }
  if (result.found === false) return result;
  if (!Array.isArray(result.hops) || result.hops.length === 0) {
    throw new Error('find_path response hops must be a non-empty array when found');
  }
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) {
    throw new Error('find_path response hops must contain non-empty strings');
  }
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) {
    throw new Error('find_path response hopCount must match hops length');
  }
  if (!Array.isArray(result.edges)) {
    throw new Error('find_path response edges must be an array when found');
  }
  if (result.edges.length !== result.hops.length - 1) {
    throw new Error('find_path response edges length must match hops length');
  }
  for (let index = 0; index < result.edges.length; index += 1) {
    if (!validPathEdge(result.edges[index], result.hops[index], result.hops[index + 1])) {
      throw new Error(`find_path response edges[${index}] has an invalid path-edge shape`);
    }
  }
  if (result.nodes !== undefined) {
    if (!Array.isArray(result.nodes) || result.nodes.length !== result.hops.length) {
      throw new Error('find_path response nodes length must match hops length');
    }
    for (let index = 0; index < result.nodes.length; index += 1) {
      if (!validPathNode(result.nodes[index], result.hops[index])) {
        throw new Error(`find_path response nodes[${index}] has an invalid path-node shape`);
      }
    }
  }
  return result;
}

export function assertBacklinksShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_backlinks response must be an object');
  }
  if (!hasNonEmptyString(result.target)) {
    throw new Error('find_backlinks target must be a non-empty string');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('find_backlinks matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('find_backlinks total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validBacklinkRow(result.matches[index])) {
      throw new Error(`find_backlinks matches[${index}] has an invalid backlink shape`);
    }
  }
  return result;
}

export function assertOrphansShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('find_orphans response must be an object');
  }
  if (!Array.isArray(result.orphans)) {
    throw new Error('find_orphans orphans must be an array');
  }
  const total = result.total ?? result.orphans.length;
  if (!validCount(total)) {
    throw new Error('find_orphans total must be a non-negative integer when present');
  }
  for (let index = 0; index < result.orphans.length; index += 1) {
    if (!validNodeSummary(result.orphans[index])) {
      throw new Error(`find_orphans orphans[${index}] has an invalid orphan shape`);
    }
  }
  return result;
}

export function assertQueryConceptsShape(result) {
  if (!isPlainObject(result)) {
    throw new Error('query_concepts response must be an object');
  }
  if (!hasNonEmptyString(result.filter)) {
    throw new Error('query_concepts filter must be a non-empty string');
  }
  if (result.parsedAs !== undefined && !hasNonEmptyString(result.parsedAs)) {
    throw new Error('query_concepts parsedAs must be a non-empty string when present');
  }
  if (!Array.isArray(result.matches)) {
    throw new Error('query_concepts matches must be an array');
  }
  const total = result.total ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('query_concepts total must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('query_concepts limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validNodeSummary(result.matches[index])) {
      throw new Error(`query_concepts matches[${index}] has an invalid query-result shape`);
    }
  }
  return result;
}

export function assertOverviewShape(result) {
  assertQueryOperation(result, 'overview');
  if (!isPlainObject(result.graph)) {
    throw new Error('overview graph must be an object');
  }
  for (const field of ['nodes', 'edges']) {
    if (!validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['resolvedEdges', 'externalEdges', 'unresolvedEdges', 'issues']) {
    if (result.graph[field] !== undefined && !validCount(result.graph[field])) {
      throw new Error(`overview graph.${field} must be a non-negative integer when present`);
    }
  }
  for (const field of ['byKind', 'byDomain', 'byRelation']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`overview ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!Array.isArray(result.hubs)) {
    throw new Error('overview hubs must be an array');
  }
  for (let index = 0; index < result.hubs.length; index += 1) {
    if (!validHubRow(result.hubs[index])) {
      throw new Error(`overview hubs[${index}] has an invalid hub shape`);
    }
  }
  return result;
}

export function assertNodeProfileShape(result) {
  assertQueryOperation(result, 'node_profile');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('node_profile center must be a non-empty string');
  }
  if (!validNodeSummary(result.node)) {
    throw new Error('node_profile node must be a valid node summary');
  }
  if (!validDegree(result.degree)) {
    throw new Error('node_profile degree must contain non-negative in/out/total counts');
  }
  if (result.aliases !== undefined && (!Array.isArray(result.aliases) || result.aliases.some((alias) => !hasNonEmptyString(alias)))) {
    throw new Error('node_profile aliases must contain non-empty strings when present');
  }
  if (!isPlainObject(result.edges)) {
    throw new Error('node_profile edges must be an object');
  }
  for (const direction of ['incoming', 'outgoing']) {
    if (!validEdgeGroup(result.edges[direction], direction)) {
      throw new Error(`node_profile edges.${direction} must be a valid edge group`);
    }
  }
  if (result.lineage !== undefined && !validLineage(result.lineage)) {
    throw new Error('node_profile lineage must contain valid ancestor/descendant pages when present');
  }
  return result;
}

export function assertSimilarNodesShape(result) {
  assertQueryOperation(result, 'similar_nodes');
  if (!Array.isArray(result.matches)) {
    throw new Error('similar_nodes matches must be an array');
  }
  const total = result.totalMatches ?? result.matches.length;
  if (!validCount(total)) {
    throw new Error('similar_nodes totalMatches must be a non-negative integer when present');
  }
  if (result.limited !== undefined && typeof result.limited !== 'boolean') {
    throw new Error('similar_nodes limited must be a boolean when present');
  }
  for (let index = 0; index < result.matches.length; index += 1) {
    if (!validSimilarMatch(result.matches[index])) {
      throw new Error(`similar_nodes matches[${index}] has an invalid similar-node shape`);
    }
  }
  return result;
}

export function assertCentralityShape(result) {
  assertQueryOperation(result, 'centrality');
  if (!isPlainObject(result.rankings)) {
    throw new Error('centrality rankings must be an object');
  }
  for (const section of ['pageRank', 'bridges', 'authorities', 'hubs']) {
    const rows = result.rankings[section];
    if (!Array.isArray(rows)) {
      throw new Error(`centrality rankings.${section} must be an array`);
    }
    for (let index = 0; index < rows.length; index += 1) {
      if (!validCentralityRow(rows[index])) {
        throw new Error(`centrality rankings.${section}[${index}] has an invalid ranking shape`);
      }
    }
  }
  return result;
}

export function assertBlastRadiusShape(result) {
  assertQueryOperation(result, 'blast_radius');
  if (!hasNonEmptyString(result.center)) {
    throw new Error('blast_radius center must be a non-empty string');
  }
  if (!BLAST_RADIUS_RISKS.has(result.risk)) {
    throw new Error(`blast_radius risk must be one of: ${[...BLAST_RADIUS_RISKS].join(', ')}`);
  }
  if (!isPlainObject(result.summary)) {
    throw new Error('blast_radius summary must be an object');
  }
  for (const field of ['affectedNodes', 'affectedEdges', 'affectedKinds', 'affectedDomains', 'crossDomainEdges']) {
    if (!validCount(result.summary[field])) {
      throw new Error(`blast_radius summary.${field} must be a non-negative integer`);
    }
  }
  for (const field of ['byKind', 'byDomain']) {
    if (!validCountBucket(result[field])) {
      throw new Error(`blast_radius ${field} must be an object of non-negative integer counts`);
    }
  }
  if (!validPage(result.nodes, validBlastRadiusNodeRow)) {
    throw new Error('blast_radius nodes must be a page with valid node rows');
  }
  if (!validPage(result.edges, validBlastRadiusEdgeRow)) {
    throw new Error('blast_radius edges must be a page with valid edge rows');
  }
  return result;
}

export function compileResultExitCode(artifact) {
  const counts = compileBlockingCounts(artifact);
  if (!validCount(counts.issues) || !validCount(counts.unresolvedEdges)) return 1;
  return counts.issues > 0 || counts.unresolvedEdges > 0 ? 1 : 0;
}

export function compileBlockingCounts(artifact) {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) {
    return { issues: Number.NaN, unresolvedEdges: Number.NaN };
  }
  const summary = artifact.summary && typeof artifact.summary === 'object' && !Array.isArray(artifact.summary)
    ? artifact.summary
    : artifact;
  return {
    issues: countValue(summary.issues ?? summary.issueCount ?? artifact.issueCount),
    unresolvedEdges: countValue(summary.unresolvedEdges ?? summary.unresolvedEdgeCount ?? artifact.unresolvedEdgeCount),
  };
}

export function cyclesResultExitCode(result) {
  if (!Array.isArray(result?.cycles)) return 1;
  const cycles = result.cycles;
  const total = numberValue(result?.totalCycles, cycles.length);
  if (!Number.isInteger(total) || total < 0) return 1;
  if (cycles.some((cycle) => !validCycle(cycle))) return 1;
  return total === 0 ? 0 : 1;
}

export function pathResultExitCode(result) {
  if (result?.found === false) return 1;
  if (!Array.isArray(result?.hops) || result.hops.length === 0) return 1;
  if (result.hops.some((hop) => !hasNonEmptyString(hop))) return 1;
  if (typeof result.hopCount === 'number' && result.hopCount !== result.hops.length - 1) return 1;
  if (!Array.isArray(result.edges) || result.edges.length !== result.hops.length - 1) return 1;
  if (result.edges.some((edge, index) => !validPathEdge(edge, result.hops[index], result.hops[index + 1]))) {
    return 1;
  }
  return 0;
}

export function healthResultExitCode(result) {
  const status = result?.status ?? 'unknown';
  if (!DIAGNOSIS_STATUSES.has(status)) return 1;
  if (!Array.isArray(result?.checks)) return 1;
  const checks = result.checks;
  if (checks.length === 0) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (checks.some((check) => check?.status === 'fail')) return 1;
  return status === 'healthy' ? 0 : 1;
}

export function workspaceBriefExitCode(result) {
  if (!DIAGNOSIS_STATUSES.has(result?.status)) return 1;
  if (!Array.isArray(result?.nextActions)) return 1;
  if (!Array.isArray(result?.health?.checks)) return 1;
  const next = result.nextActions;
  const checks = result.health.checks;
  if (checks.length === 0) return 1;
  if (next.some((action) => !validNextAction(action))) return 1;
  if (checks.some((check) => !validHealthCheck(check))) return 1;
  if (next.some((action) => action?.severity === 'fail')) return 1;
  return checks.some((check) => check?.status === 'fail') ? 1 : 0;
}

function validNextAction(action) {
  return Boolean(
    action
    && typeof action === 'object'
    && !Array.isArray(action)
    && hasNonEmptyString(action.id, action.kind)
    && NEXT_ACTION_SEVERITIES.has(action.severity)
  );
}

function validHealthCheck(check) {
  return Boolean(
    check
    && typeof check === 'object'
    && !Array.isArray(check)
    && hasNonEmptyString(check.id)
    && HEALTH_CHECK_STATUSES.has(check.status)
    && validCount(check.count)
  );
}

function maintenanceActionFailure(action, index) {
  if (!isPlainObject(action)) {
    return `maintenance_plan actions[${index}] must be an object`;
  }
  for (const field of ['id', 'phase', 'kind', 'reason']) {
    if (!hasNonEmptyString(action[field])) {
      return `maintenance_plan actions[${index}].${field} must be a non-empty string`;
    }
  }
  if (!MAINTENANCE_ACTION_SEVERITIES.has(action.severity)) {
    return `maintenance_plan actions[${index}].severity must be one of: ${[...MAINTENANCE_ACTION_SEVERITIES].join(', ')}`;
  }
  if (typeof action.executable !== 'boolean') {
    return `maintenance_plan actions[${index}].executable must be a boolean`;
  }
  if (!Number.isFinite(action.score) || action.score < 0) {
    return `maintenance_plan actions[${index}].score must be a non-negative number`;
  }
  if (action.executable && !isPlainObject(action.proposedAction)) {
    return `maintenance_plan executable action ${action.id} must include proposedAction`;
  }
  if (action.proposedAction !== undefined && action.proposedAction !== null) {
    if (!isPlainObject(action.proposedAction)) {
      return `maintenance_plan action ${action.id} proposedAction must be an object when present`;
    }
    if (!hasNonEmptyString(action.proposedAction.tool)) {
      return `maintenance_plan action ${action.id} proposedAction.tool must be a non-empty string`;
    }
    if (!isPlainObject(action.proposedAction.args)) {
      return `maintenance_plan action ${action.id} proposedAction.args must be an object`;
    }
    const proposedActionFailure = maintenanceProposedActionFailure(action);
    if (proposedActionFailure) return proposedActionFailure;
  }
  return null;
}

function maintenanceProposedActionFailure(action) {
  const { tool, args } = action.proposedAction;
  if (action.kind === 'add_missing_relation') {
    if (tool !== 'add_relation') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be add_relation`;
    }
    if (!isPlainObject(action.nodes) || !isPlainObject(action.nodes.from) || !isPlainObject(action.nodes.to)) {
      return `maintenance_plan action ${action.id} add_missing_relation must include from/to node summaries`;
    }
    if (args.from !== action.nodes.from.slug || args.to !== action.nodes.to.slug) {
      return `maintenance_plan action ${action.id} proposedAction endpoints must match node summaries`;
    }
    if (!hasNonEmptyString(args.type)) {
      return `maintenance_plan action ${action.id} proposedAction.type must be a non-empty string`;
    }
  }
  if (action.kind === 'canonicalize_graph_arrays') {
    if (tool !== 'patch_concept') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be patch_concept`;
    }
    if (isPlainObject(action.node) && hasNonEmptyString(action.node.slug) && args.slug !== action.node.slug) {
      return `maintenance_plan action ${action.id} proposedAction.slug must match node summary`;
    }
  }
  if (action.kind === 'materialize_external_element' || action.kind === 'resolve_dangling_reference') {
    if (tool !== 'add_concept') {
      return `maintenance_plan action ${action.id} proposedAction.tool must be add_concept`;
    }
    if (!hasNonEmptyString(args.slug)) {
      return `maintenance_plan action ${action.id} proposedAction.slug must be a non-empty string`;
    }
    if (action.kind === 'materialize_external_element' && args.kind !== 'element') {
      return `maintenance_plan action ${action.id} proposedAction.kind must be element`;
    }
  }
  return null;
}

function validMaintenanceActionPointer(action) {
  return Boolean(
    isPlainObject(action)
    && hasNonEmptyString(action.id)
    && hasNonEmptyString(action.phase)
    && hasNonEmptyString(action.kind)
    && MAINTENANCE_ACTION_SEVERITIES.has(action.severity)
    && typeof action.executable === 'boolean'
  );
}

function maintenanceActionPointerMismatch(expectedAction, pointer, label) {
  for (const field of ['executable', 'phase', 'kind', 'severity']) {
    if (pointer[field] !== expectedAction[field]) {
      return `maintenance_plan ${label}.${field} must match the first page action`;
    }
  }
  return null;
}

function validNodeSummary(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.mtime === undefined || Number.isFinite(row.mtime))
  );
}

function validPathNode(row, expectedSlug) {
  return Boolean(
    isPlainObject(row)
    && row.slug === expectedSlug
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && (row.domain === undefined || typeof row.domain === 'string')
  );
}

function validBacklinkRow(row) {
  return Boolean(
    validNodeSummary(row)
    && Array.isArray(row.matchedKeys)
    && row.matchedKeys.every((key) => hasNonEmptyString(key))
  );
}

function validDegree(degree) {
  return Boolean(
    isPlainObject(degree)
    && validCount(degree.in)
    && validCount(degree.out)
    && validCount(degree.total)
  );
}

function validEdgeGroup(group, direction) {
  return Boolean(
    isPlainObject(group)
    && validCount(group.total)
    && (group.limited === undefined || typeof group.limited === 'boolean')
    && validCountBucket(group.byRelation ?? {})
    && Array.isArray(group.edges)
    && group.edges.every((edge) => validProfileEdge(edge, direction))
  );
}

function validProfileEdge(edge, direction) {
  const peerField = direction === 'incoming' ? 'from' : 'to';
  return Boolean(
    isPlainObject(edge)
    && hasNonEmptyString(edge.from)
    && hasNonEmptyString(edge.to)
    && hasNonEmptyString(edge.via)
    && (edge.id === undefined || hasNonEmptyString(edge.id))
    && (edge.ref === undefined || hasNonEmptyString(edge.ref))
    && (edge.resolved === undefined || typeof edge.resolved === 'boolean')
    && (edge.external === undefined || typeof edge.external === 'boolean')
    && hasNonEmptyString(edge[peerField])
    && (edge.otherKind === undefined || hasNonEmptyString(edge.otherKind))
    && (edge.otherNode === null || edge.otherNode === undefined || validNodeSummary(edge.otherNode))
  );
}

function validLineage(lineage) {
  if (!isPlainObject(lineage)) return false;
  for (const field of ['ancestors', 'descendants']) {
    if (lineage[field] !== undefined && !validLineagePage(lineage[field])) return false;
  }
  return true;
}

function validLineagePage(page) {
  return Boolean(
    isPlainObject(page)
    && validCount(page.total)
    && (page.limited === undefined || typeof page.limited === 'boolean')
    && Array.isArray(page.nodes)
    && page.nodes.every((row) => (
      isPlainObject(row)
      && hasNonEmptyString(row.slug)
      && validCount(row.distance)
      && (row.via === undefined || hasNonEmptyString(row.via))
      && validNodeSummary(row.node)
    ))
  );
}

function validSimilarMatch(match) {
  return Boolean(
    isPlainObject(match)
    && validNodeSummary(match.node)
    && Number.isFinite(match.score)
    && match.score >= 0
    && validSignalBucket(match.signals ?? {})
    && (match.sharedNeighbors === undefined || (
      Array.isArray(match.sharedNeighbors)
      && match.sharedNeighbors.every((slug) => hasNonEmptyString(slug))
    ))
  );
}

function validSignalBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((score) => Number.isFinite(score) && score >= 0);
}

function validHubRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && hasNonEmptyString(row.kind)
    && hasNonEmptyString(row.title)
    && validCount(row.inDegree)
    && validCount(row.outDegree)
    && validCount(row.degree)
  );
}

function validCentralityRow(row) {
  return Boolean(
    validHubRow(row)
    && Number.isFinite(row.pageRank)
    && row.pageRank >= 0
    && validCount(row.bridgeScore)
  );
}

function validPage(page, rowPredicate) {
  if (!isPlainObject(page)) return false;
  if (!validCount(page.total)) return false;
  if (typeof page.limited !== 'boolean') return false;
  if (!Array.isArray(page.rows)) return false;
  return page.rows.every((row) => rowPredicate(row));
}

function validBlastRadiusNodeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.slug)
    && validCount(row.distance)
    && isPlainObject(row.node)
    && hasNonEmptyString(row.node.slug)
    && hasNonEmptyString(row.node.kind)
    && hasNonEmptyString(row.node.title)
    && (row.node.inDegree === undefined || validCount(row.node.inDegree))
    && (row.node.outDegree === undefined || validCount(row.node.outDegree))
  );
}

function validBlastRadiusEdgeRow(row) {
  return Boolean(
    isPlainObject(row)
    && hasNonEmptyString(row.from)
    && hasNonEmptyString(row.to)
    && hasNonEmptyString(row.via)
    && (row.id === undefined || hasNonEmptyString(row.id))
    && (row.traversedFrom === undefined || hasNonEmptyString(row.traversedFrom))
    && (row.traversedTo === undefined || hasNonEmptyString(row.traversedTo))
    && (row.crossDomain === undefined || typeof row.crossDomain === 'boolean')
  );
}

function validCountBucket(value) {
  if (!isPlainObject(value)) return false;
  return Object.values(value).every((count) => validCount(count));
}

function sumCountBucket(value) {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function validCycle(cycle) {
  if (!cycle || typeof cycle !== 'object' || Array.isArray(cycle)) return false;
  const nodes = Array.isArray(cycle.nodes) ? cycle.nodes : cycle.slugs;
  if (!Array.isArray(nodes) || nodes.length < 2) return false;
  if (!nodes.every((slug) => hasNonEmptyString(slug))) return false;
  if (cycle.nodeSummaries !== undefined) {
    if (!Array.isArray(cycle.nodeSummaries) || cycle.nodeSummaries.length !== nodes.length) return false;
    for (let index = 0; index < cycle.nodeSummaries.length; index += 1) {
      if (!validPathNode(cycle.nodeSummaries[index], nodes[index])) return false;
    }
  }
  if (cycle.edges === undefined) return true;
  return Array.isArray(cycle.edges) && cycle.edges.length === nodes.length - 1;
}

function validPathEdge(edge, from, to) {
  return Boolean(
    edge
    && typeof edge === 'object'
    && !Array.isArray(edge)
    && edge.from === from
    && edge.to === to
    && hasNonEmptyString(edge.via)
  );
}

function hasNonEmptyString(...values) {
  return values.some((value) => typeof value === 'string' && value.trim().length > 0);
}

function nullableString(value) {
  return value === undefined || value === null || typeof value === 'string';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberValue(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countValue(value) {
  return validCount(value) ? value : Number.NaN;
}

function validCount(value) {
  return Number.isInteger(value) && value >= 0;
}
